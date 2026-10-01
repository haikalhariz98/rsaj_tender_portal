/**
 * How a window write locks (LESSONS: re-validate on locked rows): the exercise's requisition,
 * then the exercise (`withLockedExerciseScope`), then the exercise's window row, then the child
 * rows the act is about (an addendum's, a sale's), each `FOR UPDATE`, always in that order — so two
 * acts never take the same locks in opposite orders. The document store's addendum owner
 * (`withLockedOwner`) takes the same path.
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

/// Lock the exercise's window row, after the exercise's. Call inside `withLockedExerciseScope`.
export async function lockWindowRow(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "ExerciseWindow" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// Lock every addendum of the window, after the window's (numbers are allocated under it).
export async function lockAddendumRows(tx: Tx, windowId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Addendum" WHERE "windowId" = ${windowId} FOR UPDATE`;
}

/// Lock every sale of the window, after the window's (one live sale per party, receipts).
export async function lockSaleRows(tx: Tx, windowId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "DocumentSale" WHERE "windowId" = ${windowId} FOR UPDATE`;
}

/// The addendum's exercise, read without a lock, to know what to lock.
export async function exerciseOfAddendum(addendumId: string): Promise<string | null> {
  const a = await db.addendum.findUnique({ where: { id: addendumId }, select: { window: { select: { exerciseId: true } } } });
  return a?.window.exerciseId ?? null;
}

/// What an addendum's owner facts are read from (`addendumFacts`).
export const ADDENDUM_FACTS_SELECT = {
  status: true,
  number: true,
  title: true,
  window: { select: { exerciseId: true, exercise: { select: { status: true, reference: true } } } },
} as const;

/// The addendum as the trail and the screens name it: its exercise's reference and its number, never an id.
export const addendumLabel = (a: { number: number | null; title: string; window: { exercise: { reference: string } } }) =>
  `${a.window.exercise.reference} · ${a.number != null ? `Addendum ${a.number}` : "Addendum (draft)"}, ${a.title}`;
