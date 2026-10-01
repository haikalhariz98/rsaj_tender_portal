import { describe, expect, it } from "vitest";

import { CONFIG_FAULT_TEXT, holdingFault, scopePolicyFaults, scopeRuleFaults, scopeRuleToSave, SCOPE_RULE_FAULT_TEXT, type PolicyDraft } from "./config";

const unset: PolicyDraft = {
  measurementStandardLabel: null, measurementStandardProvenance: null, bqPreparerQualificationCode: null, estimateLeadDays: null, estimateLeadProvenance: null,
  estimateCustodianRoleCode: null, estimateAuditRoleCode: null, estimateOverrideRoleCode: null, panelSignatoryLimit: null, panelSignatoryLimitProvenance: null,
  panelContractKindTaxonomyCode: null, panelProjectStatusTaxonomyCode: null,
};
const known = { qualifications: ["QS"], offices: ["HOD_CP"], lists: ["kind"] };
const fields = (p: Partial<PolicyDraft>) => scopePolicyFaults({ ...unset, ...p }, known).map((f) => `${f.field}:${f.code}`);

describe("the scope policy's own checks", () => {
  it("everything unset is a valid policy: nothing is assumed", () => {
    expect(fields({})).toEqual([]);
  });
  it("a set value says where it came from", () => {
    expect(fields({ estimateLeadDays: 7 })).toEqual(["estimateLeadProvenance:PROVENANCE_REQUIRED"]);
    expect(fields({ estimateLeadDays: 7, estimateLeadProvenance: "ASSUMED" })).toEqual([]);
    expect(fields({ measurementStandardLabel: "x" })).toEqual(["measurementStandardProvenance:PROVENANCE_REQUIRED"]);
    expect(fields({ panelSignatoryLimit: 6 })).toEqual(["panelSignatoryLimitProvenance:PROVENANCE_REQUIRED"]);
  });
  it("a lead of zero days is a lead; a negative one is not; a limit is at least one", () => {
    expect(fields({ estimateLeadDays: 0, estimateLeadProvenance: "STATED" })).toEqual([]);
    expect(fields({ estimateLeadDays: -1, estimateLeadProvenance: "STATED" })).toEqual(["estimateLeadDays:LEAD_NEGATIVE"]);
    expect(fields({ panelSignatoryLimit: 0, panelSignatoryLimitProvenance: "STATED" })).toEqual(["panelSignatoryLimit:LIMIT_BELOW_ONE"]);
  });
  it("codes name configured rows", () => {
    expect(fields({ bqPreparerQualificationCode: "XX", estimateOverrideRoleCode: "CEO", panelProjectStatusTaxonomyCode: "nope" })).toEqual([
      "bqPreparerQualificationCode:UNKNOWN_QUALIFICATION", "estimateOverrideRoleCode:UNKNOWN_OFFICE", "panelProjectStatusTaxonomyCode:UNKNOWN_LIST",
    ]);
    expect(fields({ bqPreparerQualificationCode: "QS", estimateCustodianRoleCode: "HOD_CP", panelContractKindTaxonomyCode: "kind" })).toEqual([]);
  });
  it("a holding's last day is not before its first; the same day is a one-day holding", () => {
    expect(holdingFault("2026-01-02", "2026-01-01")?.code).toBe("PERIOD_REVERSED");
    expect(holdingFault("2026-01-01", "2026-01-01")).toBeNull();
    expect(holdingFault("2026-01-01", null)).toBeNull();
  });
  it("every fault has words", () => {
    for (const t of Object.values(CONFIG_FAULT_TEXT)) expect(t).toMatch(/\.$/);
  });
});

describe("a method's scope-approval rule (OD-9), three-state", () => {
  const known = { committees: ["TECH", "BOARD"] };
  it("a set answer needs its provenance; not set needs none", () => {
    expect(scopeRuleFaults({ required: null, provenance: null, committeeCode: null }, known)).toEqual([]);
    expect(scopeRuleFaults({ required: false, provenance: null, committeeCode: null }, known).map((f) => f.code)).toEqual(["PROVENANCE_REQUIRED"]);
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "TECH" }, known)).toEqual([]);
  });
  it("a committee named with a yes must be configured; a yes with none is saved and reads Committee not set", () => {
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "GONE" }, known).map((f) => f.field)).toEqual(["scopeCommitteeCode"]);
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: null }, known)).toEqual([]);
  });
  it("stores provenance only with an answer and a committee only with a yes", () => {
    expect(scopeRuleToSave({ required: null, provenance: "STATED", committeeCode: "TECH" })).toEqual({ scopeApprovalRequired: null, scopeApprovalProvenance: null, scopeCommitteeCode: null });
    expect(scopeRuleToSave({ required: false, provenance: "STATED", committeeCode: "TECH" })).toEqual({ scopeApprovalRequired: false, scopeApprovalProvenance: "STATED", scopeCommitteeCode: null });
    expect(scopeRuleToSave({ required: true, provenance: "ASSUMED", committeeCode: "TECH" })).toEqual({ scopeApprovalRequired: true, scopeApprovalProvenance: "ASSUMED", scopeCommitteeCode: "TECH" });
    expect(SCOPE_RULE_FAULT_TEXT.UNKNOWN_COMMITTEE).toMatch(/Configuration, Committees/);
  });
});
