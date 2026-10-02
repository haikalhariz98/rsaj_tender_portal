/**
 * How an evaluation write locks (plan §4; LESSONS: re-validate on locked rows): the exercise's
 * requisition, then the exercise (`withLockedRequisitionForSourcing` / `withLockedExerciseScope`),
 * then its window row (`lockWindowRow`), then its openings (`lockOpeningRows`), then — where an act
 * reads them — its envelopes and opened bids, then the exercise's evaluations, which hold every
 * child row (team, bidders, scores, submissions, results, aspects, meetings, communications, the
 * recommendation, the Kertas Cadangan). The 6.5 / 6.6 / 6.7 order extended at its end, so two acts
 * never take the same locks in opposite orders. The document store's three evaluation owners take
 * the same path, to the evaluations.
 *
 * Two acts reach the evaluations from a committee sitting, whose row the sitting's own lock holds
 * first: the NOT_CARRIED loop (6.10 `recordOutcome`) locks sitting → evaluations, never the exercise;
 * tabling a two-stage tender's first-stage matter locks exercise … openings → sitting → evaluations.
 * Both take the sitting before the evaluations, and nothing that holds the evaluations asks for a
 * sitting, so the orders agree (BD-68-3).
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

/// Lock every evaluation version of the exercise, after its openings'.
export async function lockEvaluationRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Evaluation" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// An evaluation's exercise, read without a lock, to know what to lock.
export async function exerciseOfEvaluation(evaluationId: string): Promise<string | null> {
  const e = await db.evaluation.findUnique({ where: { id: evaluationId }, select: { exerciseId: true } });
  return e?.exerciseId ?? null;
}

export async function exerciseOfEvaluationMeeting(meetingId: string): Promise<string | null> {
  const m = await db.evaluationMeeting.findUnique({ where: { id: meetingId }, select: { evaluation: { select: { exerciseId: true } } } });
  return m?.evaluation.exerciseId ?? null;
}

export async function exerciseOfEvaluationBidder(bidderId: string): Promise<string | null> {
  const b = await db.evaluationBidder.findUnique({ where: { id: bidderId }, select: { evaluation: { select: { exerciseId: true } } } });
  return b?.evaluation.exerciseId ?? null;
}

const EVALUATION_OF = { exerciseId: true, version: true, state: true, exercise: { select: { status: true, reference: true } } } as const;

/// What an evaluation's owner facts and label are read from.
export const EVALUATION_FACTS_SELECT = {
  ...EVALUATION_OF,
  proposalPaper: { select: { checkedByPersonId: true, recommendedByPersonId: true } },
} as const;

/// A meeting's: its evaluation, whether it is closed, and which bidder by its listing number (never a name).
export const EVALUATION_MEETING_FACTS_SELECT = {
  kind: true,
  round: true,
  closedAt: true,
  evaluation: { select: EVALUATION_OF },
  bidder: { select: { openedBid: { select: { listingNo: true } } } },
} as const;

/// A bidder's: its evaluation, whether a CPR is entered on it, and its listing number.
export const EVALUATION_BIDDER_FACTS_SELECT = {
  cprPercent: true,
  evaluation: { select: EVALUATION_OF },
  openedBid: { select: { listingNo: true } },
} as const;

type Of = { version: number; exercise: { reference: string } };

/// The evaluation as the trail and the screens name it: its exercise's reference and its version, never an id.
export const evaluationLabel = (e: Of) => `${e.exercise.reference} · Evaluation, version ${e.version}`;
export const evaluationMeetingLabel = (m: { kind: "CLARIFICATION" | "NEGOTIATION"; round: number; evaluation: Of; bidder: { openedBid: { listingNo: number } } }) =>
  `${evaluationLabel(m.evaluation)} · ${m.kind === "CLARIFICATION" ? "Clarification" : "Negotiation"} with bid No. ${m.bidder.openedBid.listingNo}, round ${m.round}`;
export const evaluationBidderLabel = (b: { evaluation: Of; openedBid: { listingNo: number } }) => `${evaluationLabel(b.evaluation)} · Bid No. ${b.openedBid.listingNo}`;
