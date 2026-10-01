import { committedSen } from "@/lib/dashboard-sums";
import { ACTIVITY_ENTITIES, activityFeed, type ActivityEntry, type ActivityOwner } from "@/lib/dashboard/activity";
import { db } from "@/lib/db";
import type { FieldChange } from "@/lib/audit/diff";
import { ORGANISATION_CODE } from "@/lib/org";
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
  value: number | null;
  /// The office or committee of the first undecided step.
  waitingOn: string | null;
  openedAt: Date;
  waitingDays: number;
}

/**
 * What the dashboard can honestly report today.
 *
 * Only the committee layer is built, so the figures here are drawn from sittings and
 * votes. The sourcing pipeline, contract ledger and document queue arrive with their
 * modules; until then those cards say so rather than showing a zero that looks like
 * a quiet week.
 */
export async function loadDashboard(asOf: Date = new Date()) {
  const org = await db.organisation.findUnique({
    where: { code: ORGANISATION_CODE },
    select: { id: true },
  });
  if (!org) return null;

  const decisions = await db.committeeDecision.findMany({
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

  const activity = await recentActivity(org.id, await organisationTimeZone());

  const meetings = await db.meeting.count({
    where: { committee: { organisationId: org.id } },
  });
  const upcoming = await db.meeting.findMany({
    where: { committee: { organisationId: org.id }, meetingDate: { gte: asOf } },
    include: { committee: true },
    orderBy: { meetingDate: "asc" },
    take: 5,
  });

  const pendingRequisitions = await db.approvalInstance.findMany({
    where: { organisationId: org.id, status: "PENDING", requisition: { status: "PENDING_APPROVAL" } },
    include: {
      requisition: { select: { id: true, reference: true, title: true, estimatedValue: true } },
      steps: { where: { decision: "PENDING" }, orderBy: { sequence: "asc" }, take: 1 },
    },
    orderBy: { openedAt: "asc" },
  });
  const requisitions: RequisitionWaiting[] = pendingRequisitions
    .filter((i) => i.requisition)
    .map((i) => ({
      id: i.requisition!.id,
      reference: i.requisition!.reference,
      title: i.requisition!.title,
      value: num(i.requisition!.estimatedValue),
      waitingOn: i.steps[0]?.roleLabel ?? null,
      openedAt: i.openedAt,
      waitingDays: Math.max(0, Math.floor((asOf.getTime() - i.openedAt.getTime()) / DAY)),
    }));

  const committees = await db.committee.count({ where: { organisationId: org.id } });
  const withoutQuorum = await db.committee.count({
    where: { organisationId: org.id, quorum: null },
  });

  return {
    queue,
    requisitions,
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
 * The newest acts across requisitions, approvals, exercises, sittings, tabled matters
 * and awards, from the audit trail. Votes, recusals, attendance and configuration are
 * not in the allowlist, so those rows are never read.
 */
async function recentActivity(organisationId: string, timeZone: string | null) {
  const rows = await db.auditEntry.findMany({
    where: { organisationId, entity: { in: [...ACTIVITY_ENTITIES] } },
    orderBy: { at: "desc" },
    take: ACTIVITY_READ,
    select: { id: true, entity: true, entityId: true, entityLabel: true, action: true, changes: true, reason: true, at: true },
  });
  const entries: ActivityEntry[] = rows.map((r) => ({ ...r, action: r.action as ActivityEntry["action"], changes: (r.changes ?? []) as unknown as FieldChange[] }));

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
