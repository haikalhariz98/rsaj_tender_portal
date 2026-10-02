/**
 * How an opening write locks (LESSONS: re-validate on locked rows; plan §4): the exercise's
 * requisition, then the exercise (`withLockedRequisitionForSourcing` / `withLockedExerciseScope`),
 * then the exercise's window row (`lockWindowRow`), then the exercise's openings, then the register's
 * rows the act is about — envelopes, withdrawals, box events — then the opened bids. Always in that
 * order, the 6.5 / 6.6 order extended, so two acts never take the same locks in opposite orders.
 * 6.6's acts lock window → envelopes and never an opening, so the two orders agree. The document
 * store's opening owner (`withLockedOwner`) takes the same path, to the opening.
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

/// Lock every opening of the exercise, after the window's.
export async function lockOpeningRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Opening" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// Lock every opened bid of the exercise, after its envelopes' (listing numbers are allocated under it).
export async function lockOpenedBidRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "OpenedBid" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// The opening's exercise, read without a lock, to know what to lock.
export async function exerciseOfOpening(openingId: string): Promise<string | null> {
  const o = await db.opening.findUnique({ where: { id: openingId }, select: { exerciseId: true } });
  return o?.exerciseId ?? null;
}

/// What an opening's owner facts and label are read from.
export const OPENING_FACTS_SELECT = {
  exerciseId: true,
  kind: true,
  sequenceNo: true,
  finalisedAt: true,
  exercise: { select: { status: true, reference: true } },
} as const;

/// The opening as the trail and the screens name it: its exercise's reference and which opening, never an id.
export const openingLabel = (o: { kind: "MAIN" | "SUPPLEMENTARY"; sequenceNo: number; exercise: { reference: string } }) =>
  `${o.exercise.reference} · ${o.kind === "MAIN" ? "Opening" : `Supplementary opening ${o.sequenceNo - 1}`}`;
