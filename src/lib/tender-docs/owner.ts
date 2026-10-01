/**
 * How a tender pack is locked for a write (LESSONS: re-validate on locked rows). The
 * exercise's requisition, then the exercise (`withLockedExerciseScope`), then the
 * exercise's pack rows, each `FOR UPDATE`, always in that order; a submission then locks
 * the 6.2 rows it judges (the bill, the panel, the estimate) after the pack. The document
 * store's tender-pack-part owner (`withLockedOwner`) takes the same path, so an upload and
 * a submission never take the same locks in opposite orders.
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

/// Lock every pack row of the exercise, after the exercise's. Call inside `withLockedExerciseScope`.
export async function lockPackRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TenderPack" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}

/// The part's exercise, read without a lock, to know what to lock.
export async function exerciseOfPackPart(partId: string): Promise<string | null> {
  const p = await db.tenderPackPart.findUnique({ where: { id: partId }, select: { pack: { select: { exerciseId: true } } } });
  return p?.pack.exerciseId ?? null;
}

/// What a part's owner facts are read from (`tenderPackPartFacts`).
export const PACK_PART_FACTS_SELECT = {
  source: true,
  printedNumber: true,
  labelSnapshot: true,
  pack: { select: { status: true, versionNo: true, exerciseId: true, exercise: { select: { status: true, reference: true } } } },
} as const;

/// The part as the trail and the screens name it: its exercise's reference, never an id.
export const packPartLabel = (p: { printedNumber: string; labelSnapshot: string; pack: { versionNo: number; exercise: { reference: string } } }) =>
  `${p.pack.exercise.reference} · Tender documents v${p.pack.versionNo} · part ${p.printedNumber}, ${p.labelSnapshot}`;
