/**
 * How a bid-receipt write locks (LESSONS: re-validate on locked rows; 6.6 plan §4): the exercise's
 * requisition, then the exercise (`withLockedExerciseScope`), then the exercise's window row
 * (`lockWindowRow`), then the register's rows the act is about — envelopes, withdrawals, box events,
 * validity extensions — each `FOR UPDATE`, always in that order, the same order as 6.5's window
 * writes. The document store's withdrawal and extension owners (`withLockedOwner`) take the same
 * path. The company estimate's lodgement takes requisition → exercise → estimate → envelopes: it
 * needs no window (6.6 conditions), and never takes the window after an envelope.
 */

import type { Tx } from "@/lib/audit/record";
import { formatDate } from "@/lib/format";
import { db } from "@/lib/db";

/// Lock every envelope of the exercise, after the exercise's (and the window's, where the act takes it).
export async function lockEnvelopeRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "BidEnvelope" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// Lock every withdrawal of the exercise, after its envelopes'.
export async function lockWithdrawalRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "BidWithdrawal" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// Lock every box event of the exercise, after its envelopes'.
export async function lockBoxRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "BoxEvent" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// Lock every validity extension of the exercise, after its envelopes'.
export async function lockExtensionRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "ValidityExtension" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// The withdrawal's exercise, read without a lock, to know what to lock.
export async function exerciseOfWithdrawal(withdrawalId: string): Promise<string | null> {
  const w = await db.bidWithdrawal.findUnique({ where: { id: withdrawalId }, select: { exerciseId: true } });
  return w?.exerciseId ?? null;
}

/// The extension's exercise, read without a lock, to know what to lock.
export async function exerciseOfExtension(extensionId: string): Promise<string | null> {
  const x = await db.validityExtension.findUnique({ where: { id: extensionId }, select: { exerciseId: true } });
  return x?.exerciseId ?? null;
}

/// What a withdrawal's owner facts and label are read from.
export const WITHDRAWAL_FACTS_SELECT = {
  exerciseId: true,
  receivedAt: true,
  envelope: { select: { sequence: true } },
  exercise: { select: { status: true, reference: true } },
} as const;

/// What an extension's owner facts and label are read from.
export const EXTENSION_FACTS_SELECT = {
  exerciseId: true,
  toExpiry: true,
  appliedAt: true,
  exercise: { select: { status: true, reference: true } },
} as const;

/// The withdrawal as the trail and the screens name it: its exercise's reference and the envelope, never an id.
export const withdrawalLabel = (w: { envelope: { sequence: number } | null; exercise: { reference: string } }) =>
  `${w.exercise.reference} · Withdrawal of ${w.envelope ? `envelope ${w.envelope.sequence}` : "an envelope in the box"}`;

/// The extension as the trail and the screens name it.
export const extensionLabel = (x: { toExpiry: Date; exercise: { reference: string } }) => `${x.exercise.reference} · Validity extension to ${formatDate(x.toExpiry)}`;
