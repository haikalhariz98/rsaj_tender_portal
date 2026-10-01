/**
 * Whether an exercise's scope is ready for its tender documents to go for approval
 * (OD-4): shown on the Scope tab now, "not yet enforced", and enforced by 6.4 at Pending
 * Approval for Tendering. Pure. Increment 2 adds scope approval (OD-9, FR-REQ-014):
 * SCOPE_RULE_NOT_SET and SCOPE_COMMITTEE_NOT_SET block naming the setting, and
 * SCOPE_NOT_APPROVED blocks until the finalised bill's scope matter is carried.
 *
 * Unset configuration never reads as "not needed" (OD-6): a method whose estimate rule is
 * unset, or a basis whose bill rule is unset, blocks naming the setting. Each finding's
 * words (labels.ts) say where to fix it.
 */

import type { PanelState } from "./panel";
import { scopeClears, type ScopeApprovalState } from "./scope-matter";
import type { BqStatus, EstimateState, Finding } from "./types";

export type PackFault =
  | "BASIS_NOT_CHOSEN"
  | "BASIS_BQ_NOT_SET"
  | "BQ_NOT_FINALISED"
  | "BQ_REVISION_OPEN"
  | "PANEL_NOT_VERIFIED"
  | "PANEL_SCAN_GONE"
  | "PANEL_BILL_SUPERSEDED"
  | "METHOD_NOT_CONFIGURED"
  | "ESTIMATE_RULE_NOT_SET"
  | "ESTIMATE_NOT_LODGED"
  | "ESTIMATE_BEHIND"
  | "SCOPE_RULE_NOT_SET"
  | "SCOPE_COMMITTEE_NOT_SET"
  | "SCOPE_NOT_APPROVED";

export interface PackInput {
  /// The exercise's contract basis as configured, null where none is chosen or it is no longer configured.
  basis: { requiresBq: boolean | null } | null;
  /// The exercise's sourcing method as configured, null where it is no longer configured.
  method: { requiresCompanyEstimate: boolean | null } | null;
  /// The bill's versions' statuses (and numbers, where known, to name them).
  bq: readonly { status: BqStatus; versionNo?: number }[];
  panel: PanelState;
  /// The bill version the panel certifies, null where it names none. Required: a verified
  /// panel is only as good as the bill it was verified on.
  panelBill: { versionNo: number; status: BqStatus } | null;
  /// The live estimate (not void), null where none. `behind`: amended since it was lodged.
  estimate: { state: EstimateState; behind: boolean } | null;
  /// `scopeApproval(...).state` (scope-matter.ts). Required: there is no default reading.
  scope: ScopeApprovalState;
}

export function packFaults(i: PackInput): Finding<PackFault>[] {
  const out: Finding<PackFault>[] = [];
  if (i.basis == null) out.push({ code: "BASIS_NOT_CHOSEN", level: "block" });
  else if (i.basis.requiresBq == null) out.push({ code: "BASIS_BQ_NOT_SET", level: "block" });
  else if (i.basis.requiresBq) {
    // `started` lets the words tell no bill at all from a draft that is not finalised yet; the
    // panel's own finding of the same code (panel.ts) carries none and keeps its own sentence.
    if (!i.bq.some((v) => v.status === "FINALISED")) out.push({ code: "BQ_NOT_FINALISED", level: "block", data: { started: i.bq.length > 0 ? 1 : 0 } });
    else if (i.bq.some((v) => v.status === "DRAFT")) out.push({ code: "BQ_REVISION_OPEN", level: "warn" });
  }
  if (i.panel === "SCAN_GONE") out.push({ code: "PANEL_SCAN_GONE", level: "block" });
  else if (i.panel !== "VERIFIED") out.push({ code: "PANEL_NOT_VERIFIED", level: "block" });
  // A panel verified on a bill since superseded certifies quantities that no longer stand.
  // It compares two bills, so it is said only where both exist: with no finalised bill the finding
  // above already says so, and a comparison against nothing would only confuse.
  const finalised = i.bq.find((v) => v.status === "FINALISED");
  if ((i.panel === "VERIFIED" || i.panel === "SCAN_GONE") && i.panelBill != null && i.panelBill.status !== "FINALISED" && finalised != null) {
    const current = finalised.versionNo ?? null;
    out.push({ code: "PANEL_BILL_SUPERSEDED", level: "block", data: { panelVersion: i.panelBill.versionNo, current } });
  }
  if (i.method == null) out.push({ code: "METHOD_NOT_CONFIGURED", level: "block" });
  else if (i.method.requiresCompanyEstimate == null) out.push({ code: "ESTIMATE_RULE_NOT_SET", level: "block" });
  else if (i.method.requiresCompanyEstimate) {
    const e = i.estimate;
    if (e == null || (e.state !== "LODGED" && e.state !== "DISCLOSED")) out.push({ code: "ESTIMATE_NOT_LODGED", level: "block" });
    else if (e.behind) out.push({ code: "ESTIMATE_BEHIND", level: "block" });
  }
  // The method's own absence is said once, above (METHOD_NOT_CONFIGURED).
  if (i.scope === "RULE_NOT_SET") out.push({ code: "SCOPE_RULE_NOT_SET", level: "block" });
  else if (i.scope === "COMMITTEE_NOT_SET") out.push({ code: "SCOPE_COMMITTEE_NOT_SET", level: "block" });
  else if (i.scope !== "METHOD_NOT_CONFIGURED" && !scopeClears(i.scope)) out.push({ code: "SCOPE_NOT_APPROVED", level: "block", data: { state: i.scope } });
  return out;
}
