/**
 * Documents as the audit trail records them (NFR-AUD-001). Pure, so the route handler,
 * the owner acts and the demo loader write the same shape, and nothing in the trail is
 * a code: purposes, classifications, types and sizes are written as their labels, and
 * the bytes never enter it — the fingerprint does.
 */

import { diffFields, type FieldChange } from "@/lib/audit/diff";

import { CLASSIFICATION_LABEL, classificationLabel, formatBytes, mediaLabel, PURPOSE_LABEL, RECORDED_ON_BEHALF, STATUS_LABEL } from "./labels";
import type { AttachmentPurpose, DocumentStatus, SecurityClass } from "./types";

/// How the trail names each entity this module writes.
export const DOCUMENT_ENTITY_LABEL: Readonly<Record<string, string>> = {
  Document: "Document",
  DocumentVersion: "Document version",
  DocumentAttachment: "Attachment",
  LegalHold: "Legal hold",
  DocumentStorePolicy: "Upload rules",
};

export function documentCreated(i: { title: string; className: string; classification: SecurityClass | null; status: DocumentStatus }): FieldChange[] {
  return diffFields(null, { title: i.title, documentClass: i.className, classification: classificationLabel(i.classification), status: STATUS_LABEL[i.status] });
}

export function versionCreated(i: { versionNo: number; sha256: string; byteSize: bigint; mediaType: string; originalFilename: string; receivedOn: string | null; recordedBy: string; note: string; reason?: string }): FieldChange[] {
  return diffFields(null, {
    version: i.versionNo,
    fingerprint: i.sha256,
    size: formatBytes(i.byteSize),
    type: mediaLabel(i.mediaType),
    fileName: i.originalFilename,
    receivedOn: i.receivedOn,
    recordedBy: `${i.recordedBy} (${RECORDED_ON_BEHALF})`,
    note: i.note || null,
    malwareScan: "not scanned",
  });
}

export function versionWithdrawn(i: { versionNo: number; reason: string }): FieldChange[] {
  return diffFields({ version: i.versionNo, withdrawn: "no" }, { version: i.versionNo, withdrawn: "yes", withdrawnBecause: i.reason });
}

export function attached(i: { purpose: AttachmentPurpose; title: string; versionNo: number; sha256: string; owner: string }): FieldChange[] {
  return diffFields(null, { purpose: PURPOSE_LABEL[i.purpose], document: i.title, version: i.versionNo, fingerprint: i.sha256, attachedTo: i.owner });
}

export function detached(i: { purpose: AttachmentPurpose; title: string; versionNo: number; reason: string }): FieldChange[] {
  return diffFields({ purpose: PURPOSE_LABEL[i.purpose], document: i.title, attached: "yes" }, { purpose: PURPOSE_LABEL[i.purpose], document: i.title, attached: "no", detachedBecause: i.reason });
}

export function repinned(i: { purpose: AttachmentPurpose; title: string; fromVersion: number; toVersion: number; toSha256: string }): FieldChange[] {
  return diffFields({ purpose: PURPOSE_LABEL[i.purpose], version: i.fromVersion }, { purpose: PURPOSE_LABEL[i.purpose], version: i.toVersion, fingerprint: i.toSha256 });
}

export function reclassified(i: { from: SecurityClass | null; to: SecurityClass }): FieldChange[] {
  return diffFields({ classification: classificationLabel(i.from) }, { classification: CLASSIFICATION_LABEL[i.to] });
}

export function filed(): FieldChange[] {
  return diffFields({ status: STATUS_LABEL.STAGED }, { status: STATUS_LABEL.FILED });
}

export function holdPlaced(i: { reason: string; placedBy: string }): FieldChange[] {
  return diffFields(null, { legalHold: "placed", reason: i.reason, placedBy: `${i.placedBy} (${RECORDED_ON_BEHALF})` });
}

export function holdReleased(i: { reason: string; releasedBy: string }): FieldChange[] {
  return diffFields({ legalHold: "standing" }, { legalHold: "released", releasedBecause: i.reason, releasedBy: `${i.releasedBy} (${RECORDED_ON_BEHALF})` });
}

export function policyView(p: { allowedMediaTypes: readonly string[]; maxBytes: bigint | null; provenance: string; notes: string } | null): Record<string, unknown> {
  if (!p) return { allowedTypes: "Not set", largestFile: "Not set", provenance: null, notes: null };
  return {
    allowedTypes: p.allowedMediaTypes.length ? p.allowedMediaTypes.map(mediaLabel).join(", ") : "Not set",
    largestFile: p.maxBytes != null ? formatBytes(p.maxBytes) : "Not set",
    provenance: p.provenance,
    notes: p.notes || null,
  };
}
