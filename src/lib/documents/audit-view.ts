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

// ----------------------------------------------------------------------- reading the trail

/// The changes that are only a reason, said again: the reason is shown once, on the entry.
const REASON_FIELDS = new Set(["reason", "withdrawnBecause", "detachedBecause", "releasedBecause"]);

export interface TrailEntry {
  entity: string;
  /// How the trail names it: "Document · Title · version 2", "DEMO/SX/0002/2026 · Dossier evidence".
  entityLabel: string;
  action: "CREATE" | "UPDATE" | "DELETE" | string;
  reason: string | null;
  changes: readonly FieldChange[];
}

const valueOf = (changes: readonly FieldChange[], field: string) => changes.find((c) => c.field === field)?.after ?? null;

/// The record an attachment's entry is about: the first part of its label.
const ownerOfLabel = (entityLabel: string) => entityLabel.split(" · ")[0];

/// What an entry says happened, as a sentence a reader takes in at a glance.
export function trailLabel(e: Pick<TrailEntry, "entity" | "entityLabel" | "action" | "changes">): string {
  const create = e.action === "CREATE";
  switch (e.entity) {
    case "Document":
      if (create) return "Document received";
      if (e.changes.some((c) => c.field === "status")) return "Filed";
      if (e.changes.some((c) => c.field === "classification")) return "Classification changed";
      return "Document changed";
    case "DocumentVersion": {
      const v = valueOf(e.changes, "version") ?? /version (\d+)$/.exec(e.entityLabel)?.[1];
      const n = v ? `Version ${v}` : "A version";
      if (create) return `${n} recorded`;
      return valueOf(e.changes, "withdrawn") === "yes" ? `${n} withdrawn` : `${n} changed`;
    }
    case "DocumentAttachment":
      return create ? `Attached to ${ownerOfLabel(e.entityLabel)}` : `Taken off ${ownerOfLabel(e.entityLabel)}`;
    case "LegalHold":
      return create ? "Legal hold placed" : "Legal hold released";
    default:
      return create ? "Recorded" : "Changed";
  }
}

/// A change the sentence label already says, so the list under it does not repeat it.
function saidByLabel(e: Pick<TrailEntry, "entity" | "action">, field: string): boolean {
  return (
    (e.entity === "LegalHold" && field === "legalHold") ||
    (e.entity === "DocumentVersion" && e.action !== "CREATE" && field === "withdrawn") ||
    (e.entity === "DocumentAttachment" && e.action !== "CREATE" && field === "attached") ||
    (e.entity === "DocumentAttachment" && e.action === "CREATE" && field === "attachedTo") ||
    (e.entity === "Document" && e.action !== "CREATE" && field === "status")
  );
}

/**
 * One trail entry as the drawer reads it: a sentence label, one reason (the entry's own, or
 * the one its changes carry, never both), and the changes that say something the label does
 * not. Values that are days read as days, in the format used everywhere (`day`).
 */
export function trailEntry(e: TrailEntry, day: (iso: string) => string): { label: string; reason: string | null; changes: FieldChange[] } {
  const carried = e.changes.find((c) => REASON_FIELDS.has(c.field) && c.after)?.after ?? null;
  const asDay = (v: string | null) => (v != null && /^\d{4}-\d{2}-\d{2}$/.test(v) ? day(v) : v);
  return {
    label: trailLabel(e),
    reason: e.reason?.trim() || carried,
    changes: e.changes.filter((c) => !REASON_FIELDS.has(c.field) && !saidByLabel(e, c.field)).map((c) => ({ ...c, before: asDay(c.before), after: asDay(c.after) })),
  };
}
