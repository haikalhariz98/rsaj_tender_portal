/**
 * Checks on 6.2's configuration (ScopePolicy, qualifications, holdings), pure. A value that
 * is set says where it came from (STATED, OBSERVED or ASSUMED): a lead time or a signatory
 * limit with no provenance would read as a rule when it may be a guess. A code must name a
 * configured row. Nothing here supplies a default: an empty field stays "Not set".
 */

import { NO_LIMIT, NOT_SET } from "./labels";
import type { Finding, Provenance } from "./types";

export type ConfigFault = "PROVENANCE_REQUIRED" | "LEAD_NEGATIVE" | "LIMIT_BELOW_ONE" | "UNKNOWN_QUALIFICATION" | "UNKNOWN_OFFICE" | "UNKNOWN_LIST" | "PERMIT_LIST" | "PERIOD_REVERSED";

export interface PolicyDraft {
  /// SR-08, SR-09 (rulings 12 and 13, G2): whether the specification panel is used, and whether the bill is built on screen. Null: not set.
  specPanelUsed?: boolean | null;
  onScreenBillUsed?: boolean | null;
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

/**
 * Field-keyed faults, so the form marks the field. `permitList` is the taxonomy the
 * tender-documents policy names as its regulator-permit list (64-C1): it is left out of
 * classification, so no exercise carries a value in it and the panel must not read it.
 */
export function scopePolicyFaults(p: PolicyDraft, known: { qualifications: readonly string[]; offices: readonly string[]; lists: readonly string[]; permitList?: string | null }): (Finding<ConfigFault> & { field: string })[] {
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
    else if (p[f] != null && known.permitList != null && p[f] === known.permitList) out.push({ code: "PERMIT_LIST", level: "block", field: f });
  }
  return out;
}

/// What is stored: each provenance only beside a value. A value cleared takes its provenance
/// with it, so "Not set" never reads as stated, observed or assumed (as `scopeRuleToSave`).
export function scopePolicyToSave<P extends PolicyDraft>(p: P): P {
  return {
    ...p,
    measurementStandardProvenance: p.measurementStandardLabel == null ? null : p.measurementStandardProvenance,
    estimateLeadProvenance: p.estimateLeadDays == null ? null : p.estimateLeadProvenance,
    panelSignatoryLimitProvenance: p.panelSignatoryLimit == null ? null : p.panelSignatoryLimitProvenance,
  };
}

/// What a holding's trail calls its qualification: the qualification's name, never its code;
/// one no longer configured says so.
export function qualificationName(rows: readonly { code: string; nameEn: string }[], code: string): string {
  return rows.find((q) => q.code === code)?.nameEn ?? "A qualification no longer configured";
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
  PERMIT_LIST: "That is the permit list named under Configuration, Tender documents. The panel would find no value in it. Choose another list, or name a different permit list there first.",
  PERIOD_REVERSED: "The last day cannot be before the first.",
};

export type ScopeRuleFault = "PROVENANCE_REQUIRED" | "UNKNOWN_COMMITTEE" | "UNKNOWN_ACT";

/// A method's scope rule as the form gives it: the answer, the committee, and the act the
/// committee discharges (overrides BD-62-16's officer choice), the act with its own provenance.
export interface ScopeRuleDraft {
  required: boolean | null;
  provenance: Provenance | null;
  committeeCode: string | null;
  act: string | null;
  actProvenance: Provenance | null;
}

/**
 * A method's scope-approval rule (OD-9), three-state: yes, no or not set. A set answer says
 * where it comes from; a committee, where the answer is yes, must be one configured (left
 * empty it reads "Committee not set" and blocks, never a guess). The act, where the answer is
 * yes, is one of the authority acts and says where it comes from (left empty it reads "Act
 * not set" and blocks). A committee or act named beside "no" or "not set" is not kept
 * (`scopeRuleToSave`).
 */
export function scopeRuleFaults(r: ScopeRuleDraft, known: { committees: readonly string[]; acts: readonly string[] }): (Finding<ScopeRuleFault> & { field: string })[] {
  const out: (Finding<ScopeRuleFault> & { field: string })[] = [];
  if (r.required != null && r.provenance == null) out.push({ code: "PROVENANCE_REQUIRED", level: "block", field: "scopeApprovalProvenance" });
  if (r.required === true && r.committeeCode != null && !known.committees.includes(r.committeeCode)) out.push({ code: "UNKNOWN_COMMITTEE", level: "block", field: "scopeCommitteeCode" });
  if (r.required === true && r.act != null) {
    if (!known.acts.includes(r.act)) out.push({ code: "UNKNOWN_ACT", level: "block", field: "scopeAct" });
    if (r.actProvenance == null) out.push({ code: "PROVENANCE_REQUIRED", level: "block", field: "scopeActProvenance" });
  }
  return out;
}

/// What is stored: provenance only with an answer, a committee and an act only with a yes,
/// and the act's provenance only beside the act.
export function scopeRuleToSave(r: ScopeRuleDraft) {
  const act = r.required === true ? r.act : null;
  return {
    scopeApprovalRequired: r.required,
    scopeApprovalProvenance: r.required == null ? null : r.provenance,
    scopeCommitteeCode: r.required === true ? r.committeeCode : null,
    scopeAct: act,
    scopeActProvenance: act == null ? null : r.actProvenance,
  };
}

export const SCOPE_RULE_FAULT_TEXT: Readonly<Record<ScopeRuleFault, string>> = {
  PROVENANCE_REQUIRED: CONFIG_FAULT_TEXT.PROVENANCE_REQUIRED,
  UNKNOWN_COMMITTEE: "That committee is not configured. Choose one from Configuration, Committees.",
  UNKNOWN_ACT: "Choose one of the acts listed.",
};

/// A policy field's value reads as unset: "Not set", "Not set: no late estimate is accepted", or no limit.
export const isUnsetValue = (v: string) => v === NOT_SET || v.startsWith(`${NOT_SET}:`) || v === NO_LIMIT;

/// How many settings the page shows as not set, for its header: every policy field that reads as
/// unset, and every rule (a method's estimate rule, its scope rule, a basis's bill rule) not set
/// and not retired. A retired row is not a decision anyone is waiting on.
export function unsetCount(i: { policyValues: readonly string[]; rules: readonly { unset: boolean; retired: boolean }[] }): number {
  return i.policyValues.filter(isUnsetValue).length + i.rules.filter((r) => r.unset && !r.retired).length;
}

/// The policy fields whose absence holds work back (62-C4): a bill cannot be finalised without its
/// standard and its preparer's qualification. The rest keep their own "Not set" line and are not
/// counted: the estimate's lead time is a warning until 6.7, the two offices matter once sign-in
/// exists, the two lists and the benchmark's name fall back to words, "no limit" on verifiers is an
/// answer, and an unset override office means no late estimate is accepted, which is never a gap.
/// SR-08, SR-09 (G2): the two switches are counted too. Unset, an exercise made now pins "not set" and cannot be submitted until the setting is made.
export const POLICY_FIELDS_HOLDING_WORK_BACK: readonly string[] = ["Specification panel used", "On-screen bill used", "Measurement standard", "Qualification a bill's preparer holds"];

/// The rows a list shows: the retired ones only when asked for.
export const visibleRows = <T,>(rows: readonly T[], isRetired: (r: T) => boolean, showRetired: boolean): T[] => (showRetired ? [...rows] : rows.filter((r) => !isRetired(r)));
