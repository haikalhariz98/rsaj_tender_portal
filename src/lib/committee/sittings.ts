import { HIDDEN_MATTER_SUBJECT } from "./hidden";
import type { Tx } from "@/lib/audit/record";
import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import type { OrgScope } from "@/lib/org-scope";
import { loadRoster } from "@/lib/people/load";

import {
  assessFromRegister,
  checkRegisterChange,
  isRegisterSnapshot,
  resolveRegister,
  type SittingMatter,
  type SittingRules,
} from "./assess-sitting";
import { outcomesOffered, type DecisionOutcome } from "./matter";
import { assessQuorum } from "./quorum";
import type { Seat } from "./sitting";
import { secretariatHoldersOn } from "./tabling";

/**
 * Sittings, loaded. Reads only; every rule is in the pure modules beside this, and
 * this file hands them rows. `withLockedSitting` is how every write reads: it locks
 * the sitting's row and re-reads everything under it inside the write's own
 * transaction, so a check and the write it guards see the same data.
 */

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));

export const SITTINGS_PAGE = 50;

/// One page of the organisation's sittings, newest first, with what the list shows.
export async function listSittings(scope: OrgScope, page = 0) {
  const orgId = scope.organisationId;
  if (!orgId) return { sittings: [], committees: [], total: 0, page: 0, counts: { upcoming: 0, awaiting: 0, pending: 0 } };

  const where = { committee: { organisationId: orgId } };
  const [meetings, total, committees, roster, byStatus, pending] = await Promise.all([
    db.meeting.findMany({
      where,
      orderBy: [{ meetingDate: "desc" }, { id: "asc" }],
      skip: page * SITTINGS_PAGE,
      take: SITTINGS_PAGE,
      include: {
        committee: { include: { members: true } },
        attendance: true,
        decisions: { select: { outcome: true, withdrawnAt: true } },
      },
    }),
    db.meeting.count({ where }),
    db.committee.findMany({
      where: { organisationId: orgId },
      orderBy: [{ isExternal: "asc" }, { nameEn: "asc" }],
      select: { id: true, nameEn: true, retiredOn: true },
    }),
    loadRoster(scope.organisationCode),
    db.meeting.groupBy({ by: ["status"], where, _count: true }),
    db.committeeDecision.count({
      where: { outcome: "PENDING", withdrawnAt: null, meeting: { ...where, status: { in: ["SCHEDULED", "IN_PROGRESS"] } } },
    }),
  ]);

  const sittings = meetings.map((m) => {
    const snap = m.status === "MINUTED" && isRegisterSnapshot(m.registerSnapshot) ? m.registerSnapshot : null;
    const register = snap
      ? snap.register
      : resolveRegister({ meetingDate: m.meetingDate, seats: m.committee.members, roster, attendance: m.attendance });
    const quorum = snap ? snap.rules.quorum : m.committee.quorum;
    const present = register.present.voterIds.length;
    return {
      id: m.id,
      reference: m.reference,
      meetingDate: m.meetingDate,
      status: m.status,
      committeeName: snap?.committeeName ?? m.committee.nameEn,
      matters: m.decisions.filter((d) => !d.withdrawnAt).length,
      pending: m.decisions.filter((d) => d.outcome === "PENDING" && !d.withdrawnAt).length,
      present,
      quorum,
      quorumState: assessQuorum({ quorum, present }).state,
    };
  });

  const count = (st: string) => byStatus.find((b) => b.status === st)?._count ?? 0;
  return {
    sittings,
    committees,
    total,
    page,
    counts: { upcoming: count("SCHEDULED"), awaiting: count("IN_PROGRESS"), pending },
  };
}

export type SittingSummary = Awaited<ReturnType<typeof listSittings>>["sittings"][number];

type RosterData = Awaited<ReturnType<typeof loadRoster>>;

/**
 * One sitting with everything its screen, its actions and the votes route need.
 *
 * A minuted sitting with a register snapshot is assessed from it: its seats,
 * holders, names, quorum and rule as they stood on the day. Decided matters are
 * judged on the quorum and rule recorded on them.
 */
export async function loadSitting(scope: OrgScope, id: string, client: Tx = db, preloaded?: RosterData) {
  const org = await client.organisation.findUnique({
    where: { id: scope.organisationId },
    select: { id: true, timeZone: true },
  });
  if (!org) return null;
  const orgId = org.id;

  const meeting = await client.meeting.findFirst({
    where: { id, committee: { organisationId: orgId } },
    include: {
      committee: { include: { members: { orderBy: [{ position: "asc" }, { id: "asc" }] } } },
      attendance: { include: { person: true } },
      // Signed minutes (FR-CTE-004), live and past, for the minutes card and History.
      attachments: { where: { purpose: { in: ["SIGNED_MINUTES", "SITTING_MINUTES"] } }, select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
      decisions: {
        orderBy: [{ sequence: "asc" }, { id: "asc" }],
        include: {
          votes: { include: { person: true }, orderBy: { recordedAt: "asc" } },
          recusals: { include: { person: true } },
          tabledBy: true,
          dependsOn: { select: { id: true, subject: true, outcome: true } },
          // 6.2 OD-9: the bill version a SCOPE matter tables, to name and link it.
          bqVersion: { select: { versionNo: true, status: true, exerciseId: true } },
          // SR-09: or the uploaded bill file's version, with the exercise it belongs to (scopeExerciseId).
          scopeFileVersion: { select: { versionNo: true } },
        },
      },
    },
  });
  if (!meeting) return null;

  const [roster, outcomes] = await Promise.all([
    preloaded ?? loadRoster(scope.organisationCode),
    client.notApprovedOutcome.findMany({
      where: { organisationId: orgId },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
      include: { _count: { select: { decisions: true } } },
    }),
  ]);

  const c = meeting.committee;
  const snapshot = meeting.status === "MINUTED" && isRegisterSnapshot(meeting.registerSnapshot) ? meeting.registerSnapshot : null;

  const matters: SittingMatter[] = meeting.decisions.map((d) => ({
    id: d.id,
    act: d.act,
    tabled: d.tabledByPersonId != null,
    outcome: d.outcome,
    dependencyOutcome: (d.dependsOn?.outcome as DecisionOutcome | undefined) ?? null,
    recusedIds: d.recusals.map((r) => r.personId),
    votes: d.votes.map((v) => ({ personId: v.personId, choice: v.choice })),
    snapshot:
      d.outcome === "CARRIED" || d.outcome === "NOT_CARRIED"
        ? { quorum: d.quorumRequired, votingRule: d.votingRule, alternateMayVoteForRecused: d.alternateMayVoteForRecused }
        : undefined,
  }));

  const rules: SittingRules & { votingRuleProvenance: string | null } = snapshot
    ? snapshot.rules
    : {
        quorum: c.quorum,
        votingRule: c.votingRule,
        votingRuleProvenance: c.votingRuleProvenance,
        alternateMayVoteForRecused: c.alternateMayVoteForRecused,
      };
  const register = snapshot
    ? snapshot.register
    : resolveRegister({ meetingDate: meeting.meetingDate, seats: c.members, roster, attendance: meeting.attendance });
  const assessment = assessFromRegister(register, rules, matters, meeting.status);

  const names: Record<string, string> = snapshot
    ? { ...Object.fromEntries(roster.people.map((p) => [p.id, p.name])), ...snapshot.names }
    : Object.fromEntries(roster.people.map((p) => [p.id, p.name]));

  // Null while the organisation has no time zone: starting, tabling and voting wait.
  const today = todayIn(new Date(), org.timeZone ?? null);
  const secretariat = c.secretariatRoleCode;

  return {
    organisationId: orgId,
    timeZone: org.timeZone ?? null,
    today,
    meeting: {
      ...meeting,
      decisions: meeting.decisions.map((d) => ({ ...d, amount: num(d.amount) })),
    },
    committeeName: snapshot?.committeeName ?? c.nameEn,
    fromSnapshot: snapshot != null,
    roster,
    names,
    rules,
    register,
    matters,
    assessment,
    outcomesOffered: outcomesOffered(outcomes, meeting.committeeId, meeting.meetingDate),
    outcomesAll: outcomes,
    secretariat: {
      code: secretariat,
      office: secretariat ? (roster.offices.find((o) => o.code === secretariat) ?? null) : null,
      /// Judged on the tabling day, as the tabling action judges them.
      holders: secretariatHoldersOn(roster, secretariat, today),
    },
  };
}

export type LoadedSitting = NonNullable<Awaited<ReturnType<typeof loadSitting>>>;

/**
 * The sitting as a reader who may not see some of its matters is shown it (FR-MTD-007, Phase 3a): each such matter keeps its place, its sequence, its
 * outcome and its status, so counts and quorum still add up, and loses what identifies it: its subject, its reference, its amount, who voted and
 * who recused, what it depends on and who tabled it. The sitting itself is not hidden. Only the screen reads this; the acts read the sitting whole
 * and refuse a hidden matter by its exercise (`meetingOf`).
 */
export function redactHiddenMatters(s: LoadedSitting, hiddenMatters: ReadonlySet<string>): LoadedSitting {
  if (hiddenMatters.size === 0) return s;
  return {
    ...s,
    meeting: {
      ...s.meeting,
      decisions: s.meeting.decisions.map((d) =>
        hiddenMatters.has(d.id)
          ? { ...d, subject: HIDDEN_MATTER_SUBJECT, matterRef: null, amount: null, votes: [], recusals: [], dependsOn: null, dependsOnDecisionId: null, tabledBy: null, tabledByPersonId: null, outcomeNote: "", withdrawnReason: "", notApprovedOutcomeNameEn: null }
          : d,
      ),
    },
  };
}

/**
 * Run a write against a sitting with its row locked.
 *
 * `SELECT … FOR UPDATE` on the Meeting row serialises every write to the sitting —
 * a vote, an outcome, tabling, attendance, minuting — and the sitting is re-read
 * inside the same transaction, so the pure checks run on exactly the data the write
 * lands on. Returns null when the sitting does not exist. The roster is read before
 * the lock: it is configuration, not part of the sitting.
 */
export async function withLockedSitting<T>(
  scope: OrgScope,
  meetingId: string,
  fn: (tx: Tx, s: LoadedSitting) => Promise<T>,
): Promise<T | null> {
  const roster = await loadRoster(scope.organisationCode);
  return db.$transaction(async (tx) => {
    const s = await lockSittingIn(tx, scope, meetingId, roster);
    if (!s) return null;
    return fn(tx, s);
  });
}

/**
 * The same lock and re-read, inside a transaction another module already holds. Used by
 * 6.2's scope tabling, which locks the exercise (requisition, exercise, its bill versions)
 * first and the sitting last; no act takes them the other way round (a sitting's own acts
 * never lock an exercise), so the two orders never meet.
 */
export async function lockSittingIn(tx: Tx, scope: OrgScope, meetingId: string, roster: Awaited<ReturnType<typeof loadRoster>>): Promise<LoadedSitting | null> {
  await tx.$queryRaw`SELECT id FROM "Meeting" WHERE id = ${meetingId} FOR UPDATE`;
  return loadSitting(scope, meetingId, tx, roster);
}

export const HISTORY_PAGE = 200;

/// The audit trail of a sitting and everything under it, newest first, the latest
/// HISTORY_PAGE entries with the total.
/// `hiddenMatters`: the matters of exercises the reader may not see (`hiddenDecisionIds`). Their rows are not in the trail the reader is shown (FR-MTD-007).
export async function sittingHistory(s: LoadedSitting, hiddenMatters: ReadonlySet<string>) {
  const m = s.meeting;
  const ids = [
    m.id,
    ...m.attendance.map((a) => a.id),
    ...m.decisions.filter((d) => !hiddenMatters.has(d.id)).flatMap((d) => [d.id, ...d.votes.map((v) => v.id), ...d.recusals.map((r) => r.id)]),
    ...m.attachments.map((a) => a.id),
  ];
  const where = { organisationId: s.organisationId, entityId: { in: ids } };
  const [rows, total] = await Promise.all([
    db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: HISTORY_PAGE }),
    db.auditEntry.count({ where }),
  ]);
  const entries = rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    /// The record the row is about, so a screen can judge a SULIT value on it by that record (Phase 3b).
    entityId: r.entityId,
    entityLabel: r.entityLabel,
    action: r.action,
    at: r.at,
    reason: r.reason,
    changes: (r.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[],
  }));
  /// Never silently truncated: the screen says "latest N of M" when there are more.
  return { entries, total };
}

/**
 * Would a change to seats or role assignments disturb a sitting in progress?
 *
 * An ex-officio seat resolves through role assignments on the sitting date, and a
 * named seat through its own period, so either kind of change can move who sits —
 * and a vote on record or a decided matter with it. For each sitting in progress on a
 * committee the change touches, the register is resolved again with the change
 * applied and compared (`checkRegisterChange`). Returns a refusal naming the sitting,
 * or null. Minuted sittings are unaffected: they read their snapshot.
 */
export async function inProgressSittingRefusal(scope: OrgScope, change: {
  /// Committees whose seats change.
  committeeIds?: string[];
  /// Or: an office whose holders change; every committee with a seat for it.
  roleCode?: string;
  seats?: (committeeId: string, seats: Seat[]) => Seat[];
  roster?: (roster: RosterData) => RosterData;
}): Promise<string | null> {
  const orgId = scope.organisationId;
  const meetings = await db.meeting.findMany({
    where: {
      status: "IN_PROGRESS",
      committee: {
        organisationId: orgId,
        ...(change.committeeIds ? { id: { in: change.committeeIds } } : {}),
        ...(change.roleCode ? { members: { some: { seatRoleCode: change.roleCode } } } : {}),
      },
    },
    select: { id: true },
  });
  if (meetings.length === 0) return null;

  const roster = await loadRoster(scope.organisationCode);
  const problems: string[] = [];
  for (const { id } of meetings) {
    const s = await loadSitting(scope, id, db, roster);
    if (!s) continue;
    const c = s.meeting.committee;
    const seats = change.seats ? change.seats(c.id, c.members) : c.members;
    const after = resolveRegister({
      meetingDate: s.meeting.meetingDate,
      seats,
      roster: change.roster ? change.roster(roster) : roster,
      attendance: s.meeting.attendance,
    });
    const check = checkRegisterChange(s.register, after, s.rules, s.matters);
    if (check.ok) continue;
    const subject = (mid: string) => s.meeting.decisions.find((d) => d.id === mid)?.subject ?? "a matter";
    const what = [
      ...check.newlyIneligible.map((v) => `${s.names[v.personId] ?? "a member"}'s vote on “${subject(v.matterId)}” would no longer count`),
      ...check.brokenDecisions.map((mid) => `“${subject(mid)}”, already decided, would no longer follow from the register`),
      ...(check.newFaults.length > 0 ? ["the register would have faults"] : []),
    ];
    problems.push(`the sitting ${s.meeting.reference} of the ${s.committeeName}, in progress: ${what.join("; ")}`);
  }
  return problems.length === 0
    ? null
    : `This change is refused because it would change who sits at ${problems.join(", and at ")}. Make it once the sitting is minuted.`;
}
