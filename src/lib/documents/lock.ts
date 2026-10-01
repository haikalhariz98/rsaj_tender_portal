/**
 * The document store's row locks, and the one read of a version an attach judges
 * (LESSONS: every write re-validates inside its transaction on locked rows). No
 * database client of its own: the caller's transaction is passed in.
 */

import type { Tx } from "@/lib/audit/record";

/// Lock a document's row for the rest of the transaction. Owners are locked first, always.
export async function lockDocument(tx: Tx, documentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
}

/// What an attach judges of the version it pins, read under its document's lock.
export const LOCKED_VERSION_SELECT = { id: true, documentId: true, versionNo: true, sha256: true, withdrawnAt: true } as const;

export interface LockedVersion {
  id: string;
  documentId: string;
  versionNo: number;
  sha256: string;
  withdrawnAt: Date | null;
}

/**
 * Lock a version's document, then read the version: the order every attach follows.
 *
 * 1. Read only which document the version belongs to (within the organisation). Nothing
 *    is judged on this read: a version can be withdrawn between it and the lock.
 * 2. `lockDocument` — withdrawal takes the same row lock, so from here no withdrawal of
 *    any of the document's versions can commit until this transaction ends.
 * 3. Read the version again, with what `attachFault` / `repinFault` judge (`withdrawnAt`,
 *    `versionNo`, `sha256`), and judge only that.
 *
 * Null where the version is not in the organisation at either read.
 */
export async function lockVersion(tx: Tx, versionId: string, organisationId: string): Promise<LockedVersion | null> {
  const at = await tx.documentVersion.findFirst({ where: { id: versionId, organisationId }, select: { documentId: true } });
  if (!at) return null;
  await lockDocument(tx, at.documentId);
  return tx.documentVersion.findFirst({ where: { id: versionId, organisationId }, select: LOCKED_VERSION_SELECT });
}
