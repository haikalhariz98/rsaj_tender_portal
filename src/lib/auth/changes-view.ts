import { db } from "@/lib/db";

import { eligibleFor } from "./eligibility-store";
import { CHANGE_KINDS, KIND_PERMISSION, KIND_WORDS, parseChange, STATUS_WORDS, type ChangeKind, type ChangeStatus } from "./configuration-change";
import { describeChange, type ChangeLine } from "./configuration-change-words";
import type { StaffActor } from "./types";

/**
 * What the two-person queue shows (Phase 2c): every change still waiting, and the latest that were decided, each in words. Read only; the acts are in `change-store.ts`.
 * Nothing waits without an owner and an age: each waiting change names who proposed it, since when, and who could decide it (so it appears in someone's queue), and
 * the screen says plainly where nobody could.
 */

export interface ChangeRow {
  id: string;
  kind: ChangeKind;
  title: string;
  status: ChangeStatus;
  statusWords: string;
  subject: string | null;
  lines: ChangeLine[];
  /// Why it was proposed, in the proposer's words.
  reason: string;
  proposedBy: string;
  proposedAt: Date;
  /// Whole days it has waited, for one still proposed; null once decided.
  waitingDays: number | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string;
  /// The signed-in person proposed it: they may withdraw it, and may not decide it.
  isYours: boolean;
  /// The signed-in person may decide it: a different Person, holding the permission that decides this kind (and, for a code, not the account's own Person).
  canDecide: boolean;
  /// The people besides the proposer who hold the permission, by name: who the change is waiting for. Empty where nobody could decide it.
  waitingFor: string[];
  /// A code is what applying it makes: the second person is shown it once.
  makesCode: boolean;
}

export interface ChangesView {
  waiting: ChangeRow[];
  decided: ChangeRow[];
}

const DECIDED_SHOWN = 50;

/// Whole days a change has waited, on the clock it is handed (never the system's).
export const waitedDays = (since: Date, now: Date): number => Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));

export async function loadChangesView(actor: StaffActor, now: Date = new Date()): Promise<ChangesView> {
  const organisationId = actor.organisationId;
  const [open, closed] = await Promise.all([
    db.configurationChange.findMany({ where: { organisationId, status: "PROPOSED" }, orderBy: { proposedAt: "asc" }, include: { proposedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } }),
    db.configurationChange.findMany({ where: { organisationId, status: { not: "PROPOSED" } }, orderBy: { decidedAt: "desc" }, take: DECIDED_SHOWN, include: { proposedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } }),
  ]);
  const rows = [...open, ...closed];

  // The names a change reads by: the person behind an account, and a role by what the organisation calls it.
  const accountIds = new Set<string>();
  const roleCodes = new Set<string>();
  for (const r of rows) {
    const p = r.payload as Record<string, unknown>;
    if (typeof p.accountId === "string") accountIds.add(p.accountId);
    if (typeof p.roleCode === "string") roleCodes.add(p.roleCode);
  }
  const [accounts, roles, people] = await Promise.all([
    db.staffAccount.findMany({ where: { organisationId, id: { in: [...accountIds] } }, select: { id: true, personId: true, person: { select: { name: true } } } }),
    db.authorityRole.findMany({ where: { organisationId, code: { in: [...roleCodes] } }, select: { code: true, nameEn: true } }),
    db.person.findMany({ where: { organisationId }, select: { id: true, name: true } }),
  ]);
  const accountPerson = new Map(accounts.map((a) => [a.id, a]));
  const roleName = new Map(roles.map((r) => [r.code, r.nameEn]));
  const personName = new Map(people.map((p) => [p.id, p.name]));

  // Who could decide each kind: one read per permission, not per change.
  const eligibleBy = new Map<string, string[]>();
  for (const kind of new Set(CHANGE_KINDS.filter((k) => open.some((o) => o.kind === k)))) {
    eligibleBy.set(kind, await eligibleFor(db, { organisationId, timeZone: actor.organisationTimeZone, now }, KIND_PERMISSION[kind]));
  }

  const toRow = (r: (typeof rows)[number]): ChangeRow => {
    const p = r.payload as Record<string, unknown>;
    const account = typeof p.accountId === "string" ? accountPerson.get(p.accountId) : undefined;
    const summary = describeChange(r.kind, r.payload, r.before as Record<string, unknown>, {
      accountPerson: account?.person.name ?? null,
      roleName: typeof p.roleCode === "string" ? (roleName.get(p.roleCode) ?? null) : null,
    });
    const waiting = r.status === "PROPOSED";
    // A code is never decided by the account's own Person, so they are not among those it waits for.
    const deciders = (eligibleBy.get(r.kind) ?? []).filter((id) => id !== r.proposedByPersonId && !(r.kind === "ACCOUNT_CODE" && id === account?.personId));
    const parsed = parseChange(r.kind, r.payload);
    return {
      id: r.id,
      kind: r.kind,
      title: KIND_WORDS[r.kind].en,
      status: r.status,
      statusWords: STATUS_WORDS[r.status].en,
      subject: summary.subject,
      lines: summary.lines,
      reason: r.reason,
      proposedBy: r.proposedBy.name,
      proposedAt: r.proposedAt,
      waitingDays: waiting ? waitedDays(r.proposedAt, now) : null,
      decidedBy: r.decidedBy?.name ?? null,
      decidedAt: r.decidedAt,
      decisionReason: r.decisionReason,
      isYours: r.proposedByPersonId === actor.personId,
      canDecide: waiting && parsed.ok && deciders.includes(actor.personId),
      waitingFor: waiting ? deciders.map((id) => personName.get(id) ?? "A person on file") : [],
      makesCode: r.kind === "ACCOUNT_CODE",
    };
  };
  return { waiting: open.map(toRow), decided: closed.map(toRow) };
}
