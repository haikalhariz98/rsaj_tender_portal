/**
 * How a supplier's act on an exercise locks (Phase 4d; LESSONS: re-validate on locked rows). The staff side takes requisition, exercise, window, then the rows an act is about
 * (`src/app/sourcing/[id]/window/shared.ts`, `src/lib/window/lock.ts`), and `recordSale` takes the supplier row LAST. A supplier's act here touches only the exercise side, so it takes the exercise
 * and then the window (a subsequence of that order, so two acts can never wait on each other in opposite orders) and never the supplier row: nothing it writes needs a supplier's other rows to
 * hold still. Its own unique indexes (one sign-up per event and supplier, one acknowledgement per addendum and supplier, one standing request per window and supplier) are what hold the rest.
 * `bids.db.test.ts` pins the order by the source.
 */

import type { Tx } from "@/lib/audit/record";

/// Lock the organisation's exercise, then its window. False where the exercise is not the organisation's.
export async function lockExerciseSide(tx: Tx, organisationId: string, exerciseId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SourcingExercise" WHERE id = ${exerciseId} AND "organisationId" = ${organisationId} FOR UPDATE`;
  if (rows.length !== 1) return false;
  await tx.$queryRaw`SELECT id FROM "ExerciseWindow" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
  return true;
}
