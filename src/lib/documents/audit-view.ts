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

/// The reason an attachment closed by a new version carries (BD-DS-17).
export const replacedBecause = (toVersion: number, reason: string) => `Replaced by version ${toVersion}: ${reason}`;

export interface AuditEntryPlan {
  entityId: string;
  action: "CREATE" | "UPDATE";
  changes: FieldChange[];
}

/**
 * A new version moving a pin (OD-8, BD-DS-17), as the trail records it: two entries,
 * each under its own attachment's id — the old attachment closed (UPDATE), naming the
 * version that replaced it and why, and the new one opened (CREATE). Each attachment's
 * history then reads whole on its own (review carry 6).
 */
export function repinAudit(i: {
  purpose: AttachmentPurpose;
  title: string;
  owner: string;
  reason: string;
  from: { attachmentId: string; versionNo: number };
  to: { attachmentId: string; versionNo: number; sha256: string };
}): [AuditEntryPlan, AuditEntryPlan] {
  return [
    { entityId: i.from.attachmentId, action: "UPDATE", changes: detached({ purpose: i.purpose, title: i.title, versionNo: i.from.versionNo, reason: replacedBecause(i.to.versionNo, i.reason) }) },
    { entityId: i.to.attachmentId, action: "CREATE", changes: attached({ purpose: i.purpose, title: i.title, versionNo: i.to.versionNo, sha256: i.to.sha256, owner: i.owner }) },
  ];
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
