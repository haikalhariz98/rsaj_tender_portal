/**
 * Checks on 6.2's configuration (ScopePolicy, qualifications, holdings), pure. A value that
 * is set says where it came from (STATED, OBSERVED or ASSUMED): a lead time or a signatory
 * limit with no provenance would read as a rule when it may be a guess. A code must name a
 * configured row. Nothing here supplies a default: an empty field stays "Not set".
 */

import type { Finding, Provenance } from "./types";

export type ConfigFault = "PROVENANCE_REQUIRED" | "LEAD_NEGATIVE" | "LIMIT_BELOW_ONE" | "UNKNOWN_QUALIFICATION" | "UNKNOWN_OFFICE" | "UNKNOWN_LIST" | "PERIOD_REVERSED";

export interface PolicyDraft {
  measurementStandardLabel: string | null;
  measurementStandardProvenance: Provenance | null;
  bqPreparerQualificationCode: string | null;
  estimateLeadDays: number | null;
  estimateLeadProvenance: Provenance | null;
  estimateCustodianRoleCode: string | null;
  estimateAuditRoleCode: string | null;
  estimateOverrideRoleCode: string | null;
  panelSignatoryLimit: number | null;
  panelSignatoryLimitProvenance: Provenance | null;
  panelContractKindTaxonomyCode: string | null;
  panelProjectStatusTaxonomyCode: string | null;
}

/// Field-keyed faults, so the form marks the field.
export function scopePolicyFaults(p: PolicyDraft, known: { qualifications: readonly string[]; offices: readonly string[]; lists: readonly string[] }): (Finding<ConfigFault> & { field: string })[] {
  const out: (Finding<ConfigFault> & { field: string })[] = [];
  const need = (set: boolean, prov: Provenance | null, field: string) => {
    if (set && prov == null) out.push({ code: "PROVENANCE_REQUIRED", level: "block", field });
  };
  need(p.measurementStandardLabel != null, p.measurementStandardProvenance, "measurementStandardProvenance");
  need(p.estimateLeadDays != null, p.estimateLeadProvenance, "estimateLeadProvenance");
  need(p.panelSignatoryLimit != null, p.panelSignatoryLimitProvenance, "panelSignatoryLimitProvenance");
  if (p.estimateLeadDays != null && p.estimateLeadDays < 0) out.push({ code: "LEAD_NEGATIVE", level: "block", field: "estimateLeadDays" });
  if (p.panelSignatoryLimit != null && p.panelSignatoryLimit < 1) out.push({ code: "LIMIT_BELOW_ONE", level: "block", field: "panelSignatoryLimit" });
  if (p.bqPreparerQualificationCode != null && !known.qualifications.includes(p.bqPreparerQualificationCode)) out.push({ code: "UNKNOWN_QUALIFICATION", level: "block", field: "bqPreparerQualificationCode" });
  for (const f of ["estimateCustodianRoleCode", "estimateAuditRoleCode", "estimateOverrideRoleCode"] as const) {
    if (p[f] != null && !known.offices.includes(p[f]!)) out.push({ code: "UNKNOWN_OFFICE", level: "block", field: f });
  }
  for (const f of ["panelContractKindTaxonomyCode", "panelProjectStatusTaxonomyCode"] as const) {
    if (p[f] != null && !known.lists.includes(p[f]!)) out.push({ code: "UNKNOWN_LIST", level: "block", field: f });
  }
  return out;
}

/// A holding's period: its last day, where given, not before its first.
export function holdingFault(validFrom: string, validTo: string | null): Finding<"PERIOD_REVERSED"> | null {
  return validTo != null && validTo < validFrom ? { code: "PERIOD_REVERSED", level: "block" } : null;
}

export const CONFIG_FAULT_TEXT: Readonly<Record<ConfigFault, string>> = {
  PROVENANCE_REQUIRED: "Say where this comes from: stated, observed or assumed.",
  LEAD_NEGATIVE: "The lead is a number of days, zero or more.",
  LIMIT_BELOW_ONE: "The limit is at least one verifier. Leave it empty for no limit.",
  UNKNOWN_QUALIFICATION: "That qualification is not configured. Add it under Qualifications first.",
  UNKNOWN_OFFICE: "That is not an office. Choose one from Users & roles.",
  UNKNOWN_LIST: "That list is not configured. Add it under Configuration, Reference data.",
  PERIOD_REVERSED: "The last day cannot be before the first.",
};
