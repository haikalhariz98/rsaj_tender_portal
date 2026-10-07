/**
 * How every 6.2 write reads (LESSONS: re-validate on locked rows). The exercise's
 * requisition, then the exercise (`withLockedRequisitionForSourcing`), then the 6.2 row the
 * act is about — the panel, the bill's draft, the live estimate — each `FOR UPDATE`, always
 * in that order, so two acts never take the same locks in opposite orders. The document
 * store's panel owner (`withLockedOwner`) takes the same path.
 */

import type { Tx } from "@/lib/audit/record";
import type { Reader } from "@/lib/auth/sulit-store";
import { db } from "@/lib/db";
import { requisitionOfExercise, withLockedRequisitionForSourcing, type ExerciseOrg, type ExerciseRow } from "@/lib/method/repo";

export interface LockedExercise {
  org: ExerciseOrg;
  ex: ExerciseRow;
}

/// Lock the exercise (requisition first) and run `fn` in the same transaction. Null when it does not exist.
export async function withLockedExerciseScope<T>(reader: Reader, exerciseId: string, fn: (tx: Tx, l: LockedExercise) => Promise<T>): Promise<T | null> {
  const requisitionId = await requisitionOfExercise(reader.organisationId, exerciseId);
  if (!requisitionId) return null;
  return withLockedRequisitionForSourcing(reader, requisitionId, exerciseId, async (tx, l) => (l.ex ? fn(tx, { org: l.org, ex: l.ex }) : null));
}

/// The panel's exercise, read without a lock, to know what to lock.
export async function exerciseOfPanel(organisationId: string, panelId: string): Promise<string | null> {
  const p = await db.specificationPanel.findFirst({ where: { id: panelId, organisationId }, select: { exerciseId: true } });
  return p?.exerciseId ?? null;
}

/// The bill version's exercise, read without a lock, to know what to lock.
export async function exerciseOfBqVersion(organisationId: string, versionId: string): Promise<string | null> {
  const v = await db.bqVersion.findFirst({ where: { id: versionId, organisationId }, select: { exerciseId: true } });
  return v?.exerciseId ?? null;
}

/// Lock the panel's row, after its exercise's. Call inside `withLockedExerciseScope`.
export async function lockPanelRow(tx: Tx, panelId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "SpecificationPanel" WHERE id = ${panelId} FOR UPDATE`;
}

/// Lock every company estimate row of the exercise that is not void (at most one), after the exercise's.
export async function lockLiveEstimateRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "CompanyEstimate" WHERE "exerciseId" = ${exerciseId} AND "state" <> 'VOID' FOR UPDATE`;
}

/// Lock one estimate's row, after its exercise's.
export async function lockEstimateRow(tx: Tx, estimateId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "CompanyEstimate" WHERE id = ${estimateId} FOR UPDATE`;
}

/// Lock the exercise's bill versions, after the exercise's.
export async function lockBqRows(tx: Tx, exerciseId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "BqVersion" WHERE "exerciseId" = ${exerciseId} FOR UPDATE`;
}
