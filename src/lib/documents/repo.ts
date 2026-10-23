/**
 * Document store reads. Loading only: every rule is in the pure modules beside this.
 * Each read takes the caller's client, so a write reads inside its own locked
 * transaction. Bytes are never read here (BlobContent is a separate table, read only by
 * the store façade).
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

import type { AttachmentFact, AttachmentPurpose, OwnerKind } from "./types";
import { OWNER_COLUMN } from "./types";

export type OwnerRef = { kind: OwnerKind; id: string };

/**
 * `isLive` as a query filter, for screens that list many owners at once: not detached,
 * and its pinned version not withdrawn. The one definition of "attached" (plan §3) in
 * database form; a module filters with this rather than writing its own.
 */
export const liveAttachmentWhere = (purpose: AttachmentPurpose) => ({ purpose, detachedAt: null, version: { withdrawnAt: null } });

const factSelect = {
  id: true,
  purpose: true,
  detachedAt: true,
  attachedAt: true,
  version: { select: { id: true, documentId: true, versionNo: true, sha256: true, withdrawnAt: true, document: { select: { title: true } } } },
} as const;

/// An owner's attachments (live and past) as the rules read them.
export async function attachmentFacts(owner: OwnerRef, client: Tx = db, purposes?: readonly AttachmentPurpose[]): Promise<AttachmentFact[]> {
  const rows = await client.documentAttachment.findMany({
    where: { [OWNER_COLUMN[owner.kind]]: owner.id, ...(purposes ? { purpose: { in: [...purposes] } } : {}) },
    select: factSelect,
    orderBy: [{ attachedAt: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    purpose: r.purpose,
    detachedAt: r.detachedAt,
    attachedAt: r.attachedAt,
    version: { id: r.version.id, documentId: r.version.documentId, versionNo: r.version.versionNo, sha256: r.version.sha256, withdrawnAt: r.version.withdrawnAt, title: r.version.document.title },
  }));
}
