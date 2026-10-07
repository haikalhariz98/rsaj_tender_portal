import { committedSen, exerciseTally } from "@/lib/dashboard-sums";
import { ACTIVITY_ENTITIES, activityFeed, type ActivityEntry, type ActivityOwner } from "@/lib/dashboard/activity";
import { openStepOf, oldestWaitingDays } from "@/lib/approvals/queue";
import { todayIn } from "@/lib/dates";
import { EXERCISE_STATUS_ORDER } from "@/lib/method/labels";
import type { ExerciseStatus } from "@/lib/method/types";
import { exerciseNotHidden } from "@/lib/auth/sulit-store";
import type { MatterKind } from "@/lib/committee/labels";
import { hiddenDecisionIds } from "@/lib/committee/hidden";
import { db } from "@/lib/db";
import type { FieldChange } from "@/lib/audit/diff";
import { organisationTimeZone } from "@/lib/org-time";

const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));

const DAY = 24 * 60 * 60 * 1000;

export interface QueueItem {
  decisionId: string;
  committeeCode: string;
  committeeName: string;
  subject: string;
  matterRef: string | null;
  domain: string;
  amount: number | null;
  /// What kind of matter it is, which says whose figure its amount is (`matterAmountScope`).
  matterKind: MatterKind | null;
  act: string;
  meetingReference: string;
  meetingDate: Date;
  waitingDays: number;
  votesCast: number;
  entitled: number;
}

/// A requisition whose approval route is open, and the step it waits on.
export interface RequisitionWaiting {
  id: string;
  reference: string;
  title: string;
  /// The department estimate: SULIT (6.2 OD-8), so the list that shows it flags the column.
  estimatedValue: number | null;
  /// The office acting for the first undecided step: the one it was escalated to, else its own.
  waitingOn: string | null;
  /// The office the step was written for, where it was escalated away from it.
  escalatedFrom: string | null;
  /// The organisation's day the step opened (`openStepOf`), and whole days since; null
  /// while no time zone is set.
  waitingSince: string | null;
  waitingDays: number | null;
}

/**
 * What the dashboard can honestly report today.
 *
 * Only the committee layer is built, so the figures here are drawn from sittings and
 * votes. The sourcing pipeline, contract ledger and document queue arrive with their
 * modules; until then those cards say so rather than showing a zero that looks like
 * a quiet week.
 */
/// `hidden`: the restricted exercises the reader may not see (FR-MTD-007). Their matters, their counts and their lines in the feed are left out.
export async function loadDashboard(organisationId: string, hidden: readonly string[], asOf: Date = new Date()) {
  const org = await db.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true },
  });
  if (!org) return null;

  const everyDecision = await db.committeeDecision.findMany({
    where: { meeting: { committee: { organisationId: org.id } } },
    include: {
      votes: { include: { person: true }, orderBy: { votedAt: "desc" } },
      meeting: {
        include: {
          committee: { include: { members: { where: { effectiveTo: null } } } },
        },
      },
    },
    orderBy: { meeting: { meetingDate: "desc" } },
  });
  // A matter names its exercise in one of four ways (itself, its bill of quantities version, its envelope, its evaluation bidder), and `hiddenDecisionIds` follows
  // all four. Filtered after the read rather than in the `where`: a negated test on a nullable pointer drops the rows that point nowhere (FR-MTD-007).
  const hiddenMatters = await hiddenDecisionIds(everyDecision.map((d) => d.id), hidden);
  const decisions = hiddenMatters.size ? everyDecision.filter((d) => !hiddenMatters.has(d.id)) : everyDecision;

  const queue: QueueItem[] = decisions
    .filter((d) => d.outcome === "PENDING" && !d.withdrawnAt)
    .map((d) => ({
      decisionId: d.id,
      committeeCode: d.meeting.committee.code,
      committeeName: d.meeting.committee.nameEn,
      subject: d.subject,
      matterRef: d.matterRef,
      domain: d.domain,
      amount: num(d.amount),
      matterKind: (d.matterKind as MatterKind | null) ?? null,
      act: d.act,
      meetingReference: d.meeting.reference,
      meetingDate: d.meeting.meetingDate,
      waitingDays: Math.max(0, Math.floor((asOf.getTime() - d.meeting.meetingDate.getTime()) / DAY)),
      votesCast: d.votes.length,
      entitled: d.meeting.committee.members.filter((m) => m.personId).length,
    }))
    .sort((a, b) => b.waitingDays - a.waitingDays);

  const decided = decisions.filter((d) => d.outcome === "CARRIED");
  // Summed in sen, never through a float (ruling C6).
  const committed = committedSen(decisions);

  const activity = await recentActivity(org.id, await organisationTimeZone(org.id), hidden);

  const meetings = await db.meeting.count({
    where: { committee: { organisationId: org.id } },
  });
  const upcoming = await db.meeting.findMany({
    where: { committee: { organisationId: org.id }, meetingDate: { gte: asOf } },
    include: { committee: true },
    orderBy: { meetingDate: "asc" },
    take: 5,
  });

  const timeZone = await organisationTimeZone(org.id);
  const today = todayIn(asOf, timeZone);
  const pendingRequisitions = await db.approvalInstance.findMany({
    where: { organisationId: org.id, status: "PENDING", requisition: { status: "PENDING_APPROVAL" } },
    include: {
      requisition: { select: { id: true, reference: true, title: true, estimatedValue: true } },
      steps: { orderBy: { sequence: "asc" } },
    },
  });
  // The step each route waits on, who acts for it and how long it has waited: one
  // reading, shared with the worklist. Oldest first; a wait that is not counted last.
  const requisitions: RequisitionWaiting[] = pendingRequisitions
    .filter((i) => i.requisition)
    .map((i) => {
      const o = openStepOf(i, today);
      return {
        id: i.requisition!.id,
        reference: i.requisition!.reference,
        title: i.requisition!.title,
        estimatedValue: num(i.requisition!.estimatedValue),
        waitingOn: o?.officeLabel ?? null,
        escalatedFrom: o?.escalatedFrom ?? null,
        waitingSince: o?.waitingSince ?? null,
        waitingDays: o?.waitingDays ?? null,
      };
    })
    .sort((a, b) => (b.waitingDays ?? -1) - (a.waitingDays ?? -1) || a.reference.localeCompare(b.reference));
  const oldestWaiting = oldestWaitingDays([...requisitions.map((r) => r.waitingDays), ...queue.map((q) => q.waitingDays)]);

  const exercises = exerciseTally(
    (await db.sourcingExercise.findMany({ where: { organisationId: org.id, ...exerciseNotHidden(hidden) }, select: { status: true } })).map((e) => e.status as ExerciseStatus),
    EXERCISE_STATUS_ORDER,
  );

  const committees = await db.committee.count({ where: { organisationId: org.id } });
  const withoutQuorum = await db.committee.count({
    where: { organisationId: org.id, quorum: null },
  });

  return {
    queue,
    requisitions,
    exercises,
    oldestWaiting,
    activity,
    committedSen: committed.total,
    committedWithoutAmount: committed.withoutAmount,
    decidedCount: decided.length,
    meetings,
    committees,
    withoutQuorum,
    upcoming: upcoming.map((m) => ({
      id: m.id,
      reference: m.reference,
      committeeCode: m.committee.code,
      committeeName: m.committee.nameEn,
      meetingDate: m.meetingDate,
      daysAway: Math.ceil((m.meetingDate.getTime() - asOf.getTime()) / DAY),
    })),
    votesOutstanding: queue.reduce((n, q) => n + Math.max(0, q.entitled - q.votesCast), 0),
  };
}

export type Dashboard = NonNullable<Awaited<ReturnType<typeof loadDashboard>>>;

/// How many allowlisted audit rows are read before folding. Many are not events (an
/// edit that changes no status), so this is wider than the eight lines shown.
const ACTIVITY_READ = 60;

/**
 * The feed's entries without those about a hidden exercise (FR-MTD-007): its own rows, its approval steps, its awards and the matters tabled on it.
 * The feed is made from the audit trail, whose rows name a record by id, so each kind is traced to its exercise here and dropped. Nothing is
 * dropped when no exercise is hidden from the reader.
 */
async function withoutHiddenExercises(entries: ActivityEntry[], hidden: readonly string[]): Promise<ActivityEntry[]> {
  if (hidden.length === 0) return entries;
  const gone = new Set(hidden);
  const idsOf = (entity: string) => [...new Set(entries.filter((e) => e.entity === entity).map((e) => e.entityId))];
  const [steps, awards, hiddenDecision] = await Promise.all([
    db.approvalStep.findMany({ where: { id: { in: idsOf("ApprovalStep") } }, select: { id: true, instance: { select: { exerciseId: true, award: { select: { exerciseId: true } } } } } }),
    db.award.findMany({ where: { id: { in: idsOf("Award") } }, select: { id: true, exerciseId: true } }),
    hiddenDecisionIds(idsOf("CommitteeDecision"), hidden),
  ]);
  const hiddenStep = new Set(steps.filter((s) => (s.instance.exerciseId && gone.has(s.instance.exerciseId)) || (s.instance.award && gone.has(s.instance.award.exerciseId))).map((s) => s.id));
  const hiddenAward = new Set(awards.filter((a) => gone.has(a.exerciseId)).map((a) => a.id));
  return entries.filter((e) => {
    if (e.entity === "SourcingExercise") return !gone.has(e.entityId);
    if (e.entity === "ApprovalStep") return !hiddenStep.has(e.entityId);
    if (e.entity === "Award") return !hiddenAward.has(e.entityId);
    if (e.entity === "CommitteeDecision") return !hiddenDecision.has(e.entityId);
    return true;
  });
}

/**
 * The newest acts across requisitions, approvals, exercises, sittings, tabled matters
 * and awards, from the audit trail. Votes, recusals, attendance and configuration are
 * not in the allowlist, so those rows are never read.
 */
async function recentActivity(organisationId: string, timeZone: string | null, hidden: readonly string[]) {
  const rows = await db.auditEntry.findMany({
    where: { organisationId, entity: { in: [...ACTIVITY_ENTITIES] } },
    orderBy: { at: "desc" },
    take: ACTIVITY_READ,
    select: { id: true, entity: true, entityId: true, entityLabel: true, action: true, changes: true, reason: true, at: true },
  });
  const all: ActivityEntry[] = rows.map((r) => ({ ...r, action: r.action as ActivityEntry["action"], changes: (r.changes ?? []) as unknown as FieldChange[] }));
  const entries = await withoutHiddenExercises(all, hidden);

  // One batched lookup per kind of owner: the record a step or a tabled matter belongs
  // to, and the committee of a sitting.
  const ids = (entity: string) => [...new Set(entries.filter((e) => e.entity === entity).map((e) => e.entityId))];
  const [steps, decisions, meetings] = await Promise.all([
    db.approvalStep.findMany({
      where: { id: { in: ids("ApprovalStep") } },
      select: { id: true, instance: { select: { requisition: { select: { id: true, reference: true } }, award: { select: { id: true, reference: true } }, exercise: { select: { id: true, reference: true } } } } },
    }),
    db.committeeDecision.findMany({
      where: { id: { in: ids("CommitteeDecision") } },
      select: { id: true, meeting: { select: { id: true, reference: true, committee: { select: { nameEn: true } } } } },
    }),
    db.meeting.findMany({
      where: { id: { in: ids("Meeting") } },
      select: { id: true, reference: true, committee: { select: { nameEn: true } } },
    }),
  ]);

  const owners: Record<string, ActivityOwner> = {};
  for (const s of steps) {
    // An award's route also carries its exercise, so the award wins, then the exercise.
    const i = s.instance;
    const o = i.award ? { kind: "award" as const, ...i.award } : i.exercise ? { kind: "exercise" as const, ...i.exercise } : i.requisition ? { kind: "requisition" as const, ...i.requisition } : null;
    if (o) owners[`ApprovalStep:${s.id}`] = { kind: o.kind, id: o.id, reference: o.reference, committee: null };
  }
  for (const d of decisions) owners[`CommitteeDecision:${d.id}`] = { kind: "sitting", id: d.meeting.id, reference: d.meeting.reference, committee: d.meeting.committee.nameEn };
  for (const m of meetings) owners[`Meeting:${m.id}`] = { kind: "sitting", id: m.id, reference: m.reference, committee: m.committee.nameEn };

  return activityFeed(entries, owners, timeZone);
}
