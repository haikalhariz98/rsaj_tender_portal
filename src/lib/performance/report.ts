/**
 * The contractor performance report's life (Phase 2 close-out stage D; ADR 0047 D6; rulings 10, 12, 17). Pure.
 *
 * One report per contract. It opens once the certificate of making good defects is issued, or once the practical completion certificate is
 * issued where no defects liability period applies. It is scored and assessed, then verified by a different signed-in person, which files it.
 * Stage C's send of the final certificate and its close call `performanceNotFiled`.
 */

import type { Finding } from "./form";

export type PerformanceState = "NONE" | "OPEN" | "ASSESSED" | "VERIFIED";
export type ReportFault = "PERFORMANCE_FORM_NOT_SET" | "NOT_YET_OPEN" | "REPORT_LIVE" | "ASSESSED" | "NOT_ASSESSED" | "SAME_PERSON" | "VERIFIED" | "PERFORMANCE_NOT_FILED";

export interface ReportRow {
  assessedByPersonId: string | null;
  verifiedByPersonId: string | null;
}

export const performanceState = (r: ReportRow | null): PerformanceState => (!r ? "NONE" : r.verifiedByPersonId ? "VERIFIED" : r.assessedByPersonId ? "ASSESSED" : "OPEN");

/// Filed: verified by a second person (FR-FIN-014). Not set is not met.
export const performanceFiled = (r: ReportRow | null): boolean => performanceState(r) === "VERIFIED";

/// Stage C: refuses sending the final certificate for approval, and is checked again at close (ruling 17).
export const performanceNotFiled = (r: ReportRow | null): Finding<ReportFault> | null => (performanceFiled(r) ? null : { code: "PERFORMANCE_NOT_FILED", level: "block" });

/// Where the stage stands: the report opens at the CMGD, or at the CPC where no defects liability period applies (ruling 17).
export interface OpenFacts {
  cpcIssued: boolean;
  dlpApplies: boolean;
  cmgdIssued: boolean;
}
export const reportOpens = (f: OpenFacts): boolean => f.cmgdIssued || (f.cpcIssued && !f.dlpApplies);

/// Why a report may not be opened. `typeName`: the contract type's label, for the form not set by name (ruling 10's FORM_NOT_SET; coded PERFORMANCE_FORM_NOT_SET, as FORM_NOT_SET is a retired certificate code). Null: no type.
export function openFaults(f: OpenFacts & { formIssued: boolean; typeName: string | null; live: boolean }): Finding<ReportFault>[] {
  if (f.live) return [{ code: "REPORT_LIVE", level: "block" }];
  const out: Finding<ReportFault>[] = [];
  if (!reportOpens(f)) out.push({ code: "NOT_YET_OPEN", level: "block", data: { dlp: f.dlpApplies ? "yes" : "no" } });
  if (!f.formIssued) out.push({ code: "PERFORMANCE_FORM_NOT_SET", level: "block", data: { type: f.typeName } });
  return out;
}

/// Scores change, and the report is assessed, only before assessment.
export const editFaults = (r: ReportRow): Finding<ReportFault>[] => (r.assessedByPersonId ? [{ code: "ASSESSED", level: "block" }] : []);

/// The verifier is a different person from the assessor (CHECK and act).
export function verifyFaults(r: ReportRow, verifierPersonId: string): Finding<ReportFault>[] {
  if (r.verifiedByPersonId) return [{ code: "VERIFIED", level: "block" }];
  if (!r.assessedByPersonId) return [{ code: "NOT_ASSESSED", level: "block" }];
  if (r.assessedByPersonId === verifierPersonId) return [{ code: "SAME_PERSON", level: "block" }];
  return [];
}
