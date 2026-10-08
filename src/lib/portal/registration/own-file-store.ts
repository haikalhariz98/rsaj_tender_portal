import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";

/**
 * A signed-in supplier's own file, found (Phase 4b, B6 `GET /supplier/registration/file`). A file is the supplier's own when a version of it hangs on the supplier's own registration draft,
 * on one of its own creditor profiles (the bank statement), or on one of its own documents: the supplier is the session's, the organisation is the session's, and a version that hangs
 * on nothing of theirs is not found, whoever's it is. A refusal and a missing file read the same.
 */

export interface OwnVersion {
  id: string;
  sha256: string;
  byteSize: bigint;
  mediaType: string;
  originalFilename: string;
  scanState: "NOT_SCANNED" | "CLEAN" | "THREAT";
  /// The creditor profile the file is the statement of, where it is one: its reading is then logged as the supplier's own SULIT reading as well.
  creditorProfileId: string | null;
}

export async function findOwnVersion(client: Tx, actor: Pick<SupplierActor, "organisationId" | "supplierId">, versionId: string): Promise<OwnVersion | null> {
  const mine = [{ registrationDraftDocument: { draft: { supplierId: actor.supplierId } } }, { creditorProfile: { supplierId: actor.supplierId } }, { supplierDocument: { supplierId: actor.supplierId } }];
  const v = await client.documentVersion.findFirst({
    where: { id: versionId, organisationId: actor.organisationId, attachments: { some: { organisationId: actor.organisationId, OR: mine } } },
    select: {
      id: true,
      sha256: true,
      byteSize: true,
      mediaType: true,
      originalFilename: true,
      scanState: true,
      attachments: { where: { creditorProfile: { supplierId: actor.supplierId } }, select: { creditorProfileId: true }, take: 1 },
    },
  });
  if (!v) return null;
  return { id: v.id, sha256: v.sha256, byteSize: v.byteSize, mediaType: v.mediaType, originalFilename: v.originalFilename, scanState: v.scanState as OwnVersion["scanState"], creditorProfileId: v.attachments[0]?.creditorProfileId ?? null };
}
