/**
 * The justification a method asks for (FR-MTD-005, FR-MTD-009, FR-REQ-013).
 *
 * A dossier method needs a reason from the customer's list; with no list configured the
 * fault says where to set one. Evidence cannot be attached until there is document
 * storage, so it is always "not attached" — a warning, never a pass. An emergency needs
 * its coordination record. `dossierFault` is what 6.11 checks before approving.
 */

import type { Finding, JustificationReason, Method } from "./types";

export type JustificationFault =
  | "REASONS_NOT_SET"
  | "REASON_REQUIRED"
  | "REASON_UNKNOWN"
  | "EVIDENCE_NOT_ATTACHED"
  | "DOSSIER_UNNUMBERED"
  | "COORDINATION_RECORD_REQUIRED"
  | "SCOPE_DOCUMENT_NOT_ATTACHED";

export interface JustificationDraft {
  justificationReasonCode: string | null;
  evidenceNote: string;
  dossierReference: string | null;
  emergencyTrigger: string;
  coordinationMeetingOn: string | null;
}

/// The reasons in force offered for a method: its own and the general ones.
export function reasonsFor(reasons: readonly JustificationReason[], methodCode: string, on: Date): JustificationReason[] {
  return reasons
    .filter((r) => (r.retiredOn == null || r.retiredOn > on) && (r.sourcingMethodCode == null || r.sourcingMethodCode === methodCode))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function justificationFaults(method: Method, d: JustificationDraft, reasons: readonly JustificationReason[], on: Date): Finding<JustificationFault>[] {
  const out: Finding<JustificationFault>[] = [];
  if (method.requiresDossier) {
    const offered = reasonsFor(reasons, method.code, on);
    if (offered.length === 0) out.push({ code: "REASONS_NOT_SET", level: "block" });
    else if (!d.justificationReasonCode) out.push({ code: "REASON_REQUIRED", level: "block" });
    else if (!offered.some((r) => r.code === d.justificationReasonCode)) out.push({ code: "REASON_UNKNOWN", level: "block" });
    out.push({ code: "EVIDENCE_NOT_ATTACHED", level: "warn" });
  }
  if (method.requiresCoordinationRecord) {
    if (!d.emergencyTrigger.trim() || !d.coordinationMeetingOn) out.push({ code: "COORDINATION_RECORD_REQUIRED", level: "block" });
    out.push({ code: "SCOPE_DOCUMENT_NOT_ATTACHED", level: "warn" });
  }
  return out;
}

/**
 * Whether a direct appointment's dossier would let it be approved (FR-MTD-009). A
 * reason, a reference and at least one evidence attachment; with no document storage
 * there are none, so it never passes on evidence yet. Enforced by 6.11.
 */
export function dossierFault(method: Pick<Method, "requiresDossier">, ex: { justificationReasonCode: string | null; dossierReference: string | null; evidenceAttachments: number }): Finding<JustificationFault>[] {
  if (!method.requiresDossier) return [];
  const out: Finding<JustificationFault>[] = [];
  if (!ex.justificationReasonCode) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (!ex.dossierReference) out.push({ code: "DOSSIER_UNNUMBERED", level: "block" });
  if (ex.evidenceAttachments < 1) out.push({ code: "EVIDENCE_NOT_ATTACHED", level: "block" });
  return out;
}
