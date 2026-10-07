import type { Tx } from "@/lib/audit/record";

import { administrationConflict, type HoldingKind, type Holdings } from "./administration-conflict";
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
