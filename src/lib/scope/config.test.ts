import { describe, expect, it } from "vitest";

import { CONFIG_FAULT_TEXT, holdingFault, qualificationName, scopePolicyFaults, scopePolicyToSave, scopeRuleFaults, scopeRuleToSave, SCOPE_RULE_FAULT_TEXT, type PolicyDraft } from "./config";

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
  const known = { committees: ["TECH", "BOARD"], acts: ["R", "A"] };
  const noAct = { act: null, actProvenance: null } as const;
  it("a set answer needs its provenance; not set needs none", () => {
    expect(scopeRuleFaults({ required: null, provenance: null, committeeCode: null, ...noAct }, known)).toEqual([]);
    expect(scopeRuleFaults({ required: false, provenance: null, committeeCode: null, ...noAct }, known).map((f) => f.code)).toEqual(["PROVENANCE_REQUIRED"]);
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "TECH", ...noAct }, known)).toEqual([]);
  });
  it("a committee named with a yes must be configured; a yes with none is saved and reads Committee not set", () => {
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "GONE", ...noAct }, known).map((f) => f.field)).toEqual(["scopeCommitteeCode"]);
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: null, ...noAct }, known)).toEqual([]);
  });
  it("stores provenance only with an answer and a committee only with a yes", () => {
    expect(scopeRuleToSave({ required: null, provenance: "STATED", committeeCode: "TECH", ...noAct })).toEqual({ scopeApprovalRequired: null, scopeApprovalProvenance: null, scopeCommitteeCode: null, scopeAct: null, scopeActProvenance: null });
    expect(scopeRuleToSave({ required: false, provenance: "STATED", committeeCode: "TECH", ...noAct })).toEqual({ scopeApprovalRequired: false, scopeApprovalProvenance: "STATED", scopeCommitteeCode: null, scopeAct: null, scopeActProvenance: null });
    expect(scopeRuleToSave({ required: true, provenance: "ASSUMED", committeeCode: "TECH", ...noAct })).toEqual({ scopeApprovalRequired: true, scopeApprovalProvenance: "ASSUMED", scopeCommitteeCode: "TECH", scopeAct: null, scopeActProvenance: null });
    expect(SCOPE_RULE_FAULT_TEXT.UNKNOWN_COMMITTEE).toMatch(/Configuration, Committees/);
  });
  it("the act (overrides BD-62-16): one of the acts, with its own provenance, kept only with a yes", () => {
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "TECH", act: "A", actProvenance: "ASSUMED" }, known)).toEqual([]);
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "TECH", act: "A", actProvenance: null }, known).map((f) => f.field)).toEqual(["scopeActProvenance"]);
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "TECH", act: "X", actProvenance: "ASSUMED" }, known).map((f) => f.code)).toEqual(["UNKNOWN_ACT"]);
    // A yes with no act is saved and reads Act not set; an act beside no is not judged, and not kept.
    expect(scopeRuleFaults({ required: true, provenance: "ASSUMED", committeeCode: "TECH", act: null, actProvenance: null }, known)).toEqual([]);
    expect(scopeRuleFaults({ required: false, provenance: "ASSUMED", committeeCode: null, act: "X", actProvenance: null }, known)).toEqual([]);
    expect(scopeRuleToSave({ required: true, provenance: "ASSUMED", committeeCode: "TECH", act: "A", actProvenance: "STATED" })).toMatchObject({ scopeAct: "A", scopeActProvenance: "STATED" });
    expect(scopeRuleToSave({ required: false, provenance: "ASSUMED", committeeCode: null, act: "A", actProvenance: "STATED" })).toMatchObject({ scopeAct: null, scopeActProvenance: null });
    expect(scopeRuleToSave({ required: true, provenance: "ASSUMED", committeeCode: "TECH", act: null, actProvenance: "STATED" })).toMatchObject({ scopeAct: null, scopeActProvenance: null });
    expect(SCOPE_RULE_FAULT_TEXT.UNKNOWN_ACT).not.toMatch(/[A-Z]{2,}_/);
  });
});

describe("a holding's trail names its qualification", () => {
  const rows = [{ code: "QQM", nameEn: "Qualified quantity measurer" }];
  it("by name, never by code; one no longer configured says so", () => {
    expect(qualificationName(rows, "QQM")).toBe("Qualified quantity measurer");
    expect(qualificationName(rows, "OLD_CODE")).toBe("A qualification no longer configured");
    expect(qualificationName([], "QQM")).not.toContain("QQM");
  });
});

describe("saving the scope policy: a cleared value takes its provenance with it", () => {
  it("each provenance is kept only beside its value", () => {
    const cleared = scopePolicyToSave({ ...unset, measurementStandardProvenance: "STATED", estimateLeadProvenance: "ASSUMED", panelSignatoryLimitProvenance: "OBSERVED" });
    expect(cleared.measurementStandardProvenance).toBeNull();
    expect(cleared.estimateLeadProvenance).toBeNull();
    expect(cleared.panelSignatoryLimitProvenance).toBeNull();
    const set = scopePolicyToSave({ ...unset, measurementStandardLabel: "SMM", measurementStandardProvenance: "STATED", estimateLeadDays: 0, estimateLeadProvenance: "ASSUMED", panelSignatoryLimit: 6, panelSignatoryLimitProvenance: "OBSERVED" });
    expect([set.measurementStandardProvenance, set.estimateLeadProvenance, set.panelSignatoryLimitProvenance]).toEqual(["STATED", "ASSUMED", "OBSERVED"]);
  });
  it("other fields pass through unchanged", () => {
    const p = { ...unset, bqPreparerQualificationCode: "QQM", notes: "kept" };
    expect(scopePolicyToSave(p)).toEqual(p);
  });
});

describe("unsetCount and visibleRows", () => {
  it("counts every policy field that reads as unset, and every rule not set and not retired", async () => {
    const { unsetCount, visibleRows, isUnsetValue } = await import("./config");
    expect(isUnsetValue("Not set")).toBe(true);
    expect(isUnsetValue("Not set: no late estimate is accepted")).toBe(true);
    expect(isUnsetValue("No limit set")).toBe(true);
    expect(isUnsetValue("7 days")).toBe(false);
    expect(
      unsetCount({
        policyValues: ["Demo standard", "Not set", "Not set: no late estimate is accepted", "6", "No limit set"],
        rules: [{ unset: true, retired: false }, { unset: true, retired: true }, { unset: false, retired: false }],
      }),
    ).toBe(4);
    const rows = [{ n: "a", r: false }, { n: "b", r: true }];
    expect(visibleRows(rows, (x) => x.r, false).map((x) => x.n)).toEqual(["a"]);
    expect(visibleRows(rows, (x) => x.r, true).map((x) => x.n)).toEqual(["a", "b"]);
  });
});

describe("62-C4: what the header counts", () => {
  it("names only the policy fields whose absence holds a bill back, and never the override office", async () => {
    const { POLICY_FIELDS_HOLDING_WORK_BACK, unsetCount } = await import("./config");
    expect([...POLICY_FIELDS_HOLDING_WORK_BACK]).toEqual(["Measurement standard", "Qualification a bill's preparer holds"]);
    expect(POLICY_FIELDS_HOLDING_WORK_BACK).not.toContain("Office that may accept a late estimate");
    expect(POLICY_FIELDS_HOLDING_WORK_BACK).not.toContain("Most verifiers on a specification panel");
    // An unset override office, with every other optional setting unset, adds nothing.
    expect(unsetCount({ policyValues: ["Demo standard", "A qualification"], rules: [] })).toBe(0);
    expect(unsetCount({ policyValues: ["Not set", "A qualification"], rules: [{ unset: true, retired: false }] })).toBe(2);
  });
});
