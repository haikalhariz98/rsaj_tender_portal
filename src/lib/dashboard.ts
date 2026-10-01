import { committedSen } from "@/lib/dashboard-sums";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

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

export interface ActivityItem {
  at: Date;
  who: string;
  what: string;
  detail: string;
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

  const activity: ActivityItem[] = decisions
    .flatMap((d) =>
      d.votes.map((v) => ({
        at: v.votedAt,
        who: v.person.name,
        what: v.choice === "SETUJU" ? "voted Setuju on" : v.choice === "TIDAK_SETUJU" ? "voted Tidak Setuju on" : "abstained on",
        detail: d.subject,
      })),
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

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
