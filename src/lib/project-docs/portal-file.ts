/**
 * Which file of a Project workspace document a contractor may download (plan step 5, §6; PW-8, PW-14, PW-28; ADR 0042 D3, D7). One reader, which the file route
 * (`src/app/supplier/projects/documents/file/[attachmentId]/route.ts`) asks before it reads a byte.
 *
 * The attachment is reached through the chain, all in the supplier's own organisation: the attachment (purpose PROJECT_DOCUMENT_FILE, still attached) → its version → its
 * document → its contract → `supplierHoldsContract`. Every way of failing the chain answers the same 404: another contractor's file, one that is not there, another
 * organisation's, and one on a contract the supplier does not hold. Then the version must be one the contractor may see (`contractorSeesVersion`: an organisation version
 * still with its approvers is 404 as well), and the classification is judged NOW, on the document's and its class's current values (`contractorMayDownload`): a class raised to
 * SULIT after the upload is refused here, though the file was fine when it was staged.
 *
 * Every refusal of a file that exists in the organisation is returned with what to log (a REFUSED access event naming the version and the supplier's account); a request for
 * an id that is nowhere in the organisation writes nothing. The caller logs every refusal and every download, and never shows the access log to the contractor. Server-side.
 */

import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { supplierHoldsContract } from "@/lib/portal/projects/visibility";

import { loadDocumentFactsMany } from "./facts";
import { contractorMayDownload, contractorSeesVersion } from "./visibility";

export interface ProjectFile {
  versionId: string;
  sha256: string;
  mediaType: string;
  originalFilename: string;
}

export type FileLookup =
  | { ok: true; file: ProjectFile }
  /// `status` 404 is the one answer for everything that is not the contractor's to see; 403 only for a file that is its own to see but is no longer open to a contractor.
  | { ok: false; status: 404 | 403; log: { reason: string; versionId: string } | null };

const ID = /^[A-Za-z0-9_-]{8,40}$/;

export async function findProjectFile(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, attachmentId: string): Promise<FileLookup> {
  if (!ID.test(attachmentId)) return { ok: false, status: 404, log: null };
  const a = await client.documentAttachment.findFirst({
    where: { id: attachmentId, organisationId: actor.organisationId, purpose: "PROJECT_DOCUMENT_FILE", detachedAt: null, projectDocumentVersionId: { not: null } },
    select: {
      versionId: true,
      projectDocumentVersionId: true,
      projectDocumentVersion: { select: { documentId: true, document: { select: { contract: { select: { award: { select: { vendorId: true, status: true } } } } } } } },
      version: { select: { sha256: true, mediaType: true, originalFilename: true, withdrawnAt: true, document: { select: { classificationSnapshot: true, documentClass: { select: { classification: true } } } } } },
    },
  });
  if (!a || !a.projectDocumentVersion || !a.projectDocumentVersionId) return { ok: false, status: 404, log: null };
  const log = (reason: string) => ({ reason, versionId: a.versionId });

  const award = a.projectDocumentVersion.document.contract.award;
  if (!supplierHoldsContract({ awardVendorId: award.vendorId, awardStatus: award.status, supplierId: actor.supplierId })) return { ok: false, status: 404, log: log("NOT_HELD") };

  const facts = (await loadDocumentFactsMany(client, [a.projectDocumentVersion.documentId])).get(a.projectDocumentVersion.documentId);
  const version = facts?.versions.find((v) => v.id === a.projectDocumentVersionId);
  if (!facts || !version || !contractorSeesVersion(facts, version)) return { ok: false, status: 404, log: log("NOT_VISIBLE") };
  if (a.version.withdrawnAt) return { ok: false, status: 404, log: log("WITHDRAWN") };

  const open = contractorMayDownload({ versionVisible: true, documentClassification: a.version.document.classificationSnapshot, classClassification: a.version.document.documentClass.classification });
  if (!open) return { ok: false, status: 403, log: log("NOT_OPEN_TO_CONTRACTOR") };
  return { ok: true, file: { versionId: a.versionId, sha256: a.version.sha256, mediaType: a.version.mediaType, originalFilename: a.version.originalFilename } };
}
