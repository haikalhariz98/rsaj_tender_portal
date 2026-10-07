import type { Tx } from "@/lib/audit/record";

import { administrationConflict, holdingsInWords, type HoldingKind, type Holdings } from "./administration-conflict";
import type { Fault } from "./types";

/**
 * The I/O half of the administration rule (ADR 0034 D9, Phase 2a): reads what the rule in `administration-conflict.ts` needs, under a lock on
 * the Person, inside the caller's own transaction.
 *
 * The Person's row is locked (`FOR UPDATE`) before anything is read, by every path that gives a holding and by the one that makes an
 * administrator, so the two cannot each pass their own check: whichever takes the lock first is seen by the other when it gets it. More than
 * one Person (a delegation has two) is locked in id order, so two such acts cannot wait on each other. A caller that takes other locks
 * takes these after them.
 */

/// Lock the Persons' rows, in id order. The one lock these paths share.
export async function lockPersons(tx: Tx, personIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(personIds)].sort()) await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${id} FOR UPDATE`;
}

/// What a person holds that has not ended. A period whose end is today or earlier has ended.
export async function holdingsOf(tx: Tx, personId: string, now: Date): Promise<Holdings> {
  const live = { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] };
  const [offices, seats, delegations] = await Promise.all([
    tx.roleAssignment.count({ where: { personId, ...live } }),
    tx.committeeMember.count({ where: { personId, ...live } }),
    // AND, because both halves are an OR and one would overwrite the other as keys of one object.
    tx.delegation.count({ where: { AND: [{ OR: [{ fromPersonId: personId }, { toPersonId: personId }] }, live] } }),
  ]);
  return { offices, seats, delegations };
}

/**
 * What each of these people has ever held, ended or not, and wherever it has since gone (review of Phase 2c). The one question it answers is whether a code for
 * their account needs a second person, and that must not turn on what they hold this minute: one administrator could end an office, reset the account alone, and
 * restore the office. So it counts every row that names the person as it stands, and every row the trail records as having named them, because an office, a seat
 * or a delegation can be edited from one person to another and the row no longer says who it was. Each row is counted once, however many ways it is found.
 * Every person asked about is in the answer, with zeros for one who has held nothing.
 */
export async function holdingHistoryFor(tx: Tx, personIds: readonly string[]): Promise<Map<string, Holdings>> {
  const ids = [...new Set(personIds)];
  const [offices, seats, delegations, trail] = await Promise.all([
    tx.roleAssignment.findMany({ where: { personId: { in: ids } }, select: { id: true, personId: true } }),
    tx.committeeMember.findMany({ where: { personId: { in: ids } }, select: { id: true, personId: true } }),
    tx.delegation.findMany({ where: { OR: [{ fromPersonId: { in: ids } }, { toPersonId: { in: ids } }] }, select: { id: true, fromPersonId: true, toPersonId: true } }),
    // Every audit row of a holding that names the person in any of its changes, before or after (a creation names them after, a move away names them before).
    tx.$queryRaw<{ entity: string; entityId: string; personId: string }[]>`
      SELECT DISTINCT a."entity", a."entityId", v.p AS "personId"
      FROM "AuditEntry" a
      CROSS JOIN LATERAL jsonb_array_elements(a."changes") c
      CROSS JOIN LATERAL (VALUES (c->>'before'), (c->>'after')) v(p)
      WHERE a."entity" IN ('RoleAssignment', 'CommitteeMember', 'Delegation')
        AND c->>'field' IN ('personId', 'fromPersonId', 'toPersonId')
        AND v.p = ANY(${ids}::text[])`,
  ]);
  const found = new Map<string, { RoleAssignment: Set<string>; CommitteeMember: Set<string>; Delegation: Set<string> }>(ids.map((id) => [id, { RoleAssignment: new Set(), CommitteeMember: new Set(), Delegation: new Set() }]));
  for (const r of offices) found.get(r.personId)?.RoleAssignment.add(r.id);
  for (const r of seats) if (r.personId) found.get(r.personId)?.CommitteeMember.add(r.id);
  for (const r of delegations) for (const p of [r.fromPersonId, r.toPersonId]) found.get(p)?.Delegation.add(r.id);
  for (const t of trail) found.get(t.personId)?.[t.entity as "RoleAssignment" | "CommitteeMember" | "Delegation"]?.add(t.entityId);
  return new Map([...found].map(([id, f]) => [id, { offices: f.RoleAssignment.size, seats: f.CommitteeMember.size, delegations: f.Delegation.size }]));
}

/// `holdingHistoryFor`, for one person. Read inside the caller's transaction, after the Person's lock.
export async function holdingHistoryOf(tx: Tx, personId: string): Promise<Holdings> {
  return (await holdingHistoryFor(tx, [personId])).get(personId) ?? { offices: 0, seats: 0, delegations: 0 };
}

/// Whether the Person has an administrator's sign-in account, of whatever status: a disabled one can be enabled again (an open item for the product owner).
export async function personIsAdministrator(tx: Tx, personId: string): Promise<boolean> {
  const account = await tx.staffAccount.findUnique({ where: { personId }, select: { isAdministrator: true } });
  return account?.isAdministrator === true;
}

/// Making this Person an administrator: the fault, or null. Locks the Person first.
export async function makeAdministratorConflict(tx: Tx, personId: string, now: Date): Promise<Fault | null> {
  await lockPersons(tx, [personId]);
  return administrationConflict({ kind: "MAKE_ADMINISTRATOR", holdings: await holdingsOf(tx, personId, now) });
}

/// Thrown inside a transaction that was about to give an administrator's Person a holding, so that nothing it did is kept. `personId` is the Person it was about.
export class HoldingRefused extends Error {
  constructor(
    readonly fault: Fault,
    readonly personId: string,
  ) {
    super(fault.en);
    this.name = "HoldingRefused";
  }
}

/// `holdingConflict`, as a throw: for an act that already has a refusal to catch. Takes its locks after the caller's own.
export async function assertCanHold(tx: Tx, personIds: readonly string[], holding: HoldingKind): Promise<void> {
  await lockPersons(tx, personIds);
  for (const personId of personIds) {
    const fault = administrationConflict({ kind: "GIVE_HOLDING", holding, personIsAdministrator: await personIsAdministrator(tx, personId) });
    if (fault) throw new HoldingRefused(fault, personId);
  }
}

/// An administrator's Person who holds something that has not ended, which ADR 0034 D9 keeps apart. Found, never changed.
export interface AdministratorHoldingViolation {
  organisationId: string;
  personId: string;
  personName: string;
  loginName: string;
  status: string;
  holdings: Holdings;
  /// What they hold, in words: "2 offices, 1 delegation".
  words: string;
}

/**
 * Every administrator account whose Person holds a live office, seat or delegation (review of Phase 2a). Read only. The rule was made after
 * offices, seats and delegations could be given to any Person, so a database from before it may already break it, and nothing else would say so.
 * A disabled administrator account counts, as it does for the rule (it can be enabled again).
 */
export async function administratorHoldingViolations(tx: Tx, now: Date): Promise<AdministratorHoldingViolation[]> {
  const accounts = await tx.staffAccount.findMany({
    where: { isAdministrator: true },
    select: { organisationId: true, personId: true, loginName: true, status: true, person: { select: { name: true } } },
    orderBy: [{ organisationId: "asc" }, { loginName: "asc" }],
  });
  const out: AdministratorHoldingViolation[] = [];
  for (const a of accounts) {
    const holdings = await holdingsOf(tx, a.personId, now);
    const words = holdingsInWords(holdings);
    if (words) out.push({ organisationId: a.organisationId, personId: a.personId, personName: a.person.name, loginName: a.loginName, status: a.status, holdings, words: words.en });
  }
  return out;
}
