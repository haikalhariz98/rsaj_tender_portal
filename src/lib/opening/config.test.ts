import { describe, expect, it } from "vitest";

import {
  committeePanelFaults,
  committeePanelToSave,
  methodOpeningFaults,
  methodOpeningToSave,
  OPENING_CONFIG_FAULT_TEXT,
  openingPolicyFaults,
  openingPolicyNotSet,
  openingPolicyToSave,
  openingRulesNotSet,
  personUnitFault,
  type CommitteePanelDraft,
  type OpeningPolicyDraft,
} from "./config";

const codes = (fs: readonly { code: string; field: string }[]) => fs.map((f) => `${f.code}@${f.field}`);

describe("a method's opening rules", () => {
  const known = { committees: ["opening_panel"] };
  it("all unset is allowed: each holds back what it governs, and nothing is defaulted", () => {
    expect(methodOpeningFaults({ committeeCode: null, committeeProvenance: null, unpurchased: null, unpurchasedProvenance: null }, known)).toEqual([]);
  });
  it("a committee must be configured, and say where it came from", () => {
    expect(codes(methodOpeningFaults({ committeeCode: "nope", committeeProvenance: null, unpurchased: null, unpurchasedProvenance: null }, known))).toEqual(["UNKNOWN_COMMITTEE@openingCommitteeCode", "PROVENANCE_REQUIRED@openingCommitteeProvenance"]);
    expect(methodOpeningFaults({ committeeCode: "opening_panel", committeeProvenance: "ASSUMED", unpurchased: null, unpurchasedProvenance: null }, known)).toEqual([]);
  });
  it("a consequence says where it came from", () => {
    expect(codes(methodOpeningFaults({ committeeCode: null, committeeProvenance: null, unpurchased: "ELIMINATE", unpurchasedProvenance: null }, known))).toEqual(["PROVENANCE_REQUIRED@unpurchasedProvenance"]);
    expect(methodOpeningFaults({ committeeCode: null, committeeProvenance: null, unpurchased: "REPORT", unpurchasedProvenance: "STATED" }, known)).toEqual([]);
  });
  it("an unset value is stored without provenance", () => {
    expect(methodOpeningToSave({ committeeCode: null, committeeProvenance: "STATED", unpurchased: null, unpurchasedProvenance: "ASSUMED" })).toEqual({ openingCommitteeCode: null, openingCommitteeProvenance: null, unpurchasedBidConsequence: null, unpurchasedProvenance: null });
  });
  it("counts two rules per method", () => {
    expect(openingRulesNotSet([{ openingCommitteeCode: null, unpurchasedBidConsequence: null }, { openingCommitteeCode: "x", unpurchasedBidConsequence: null }, { openingCommitteeCode: "x", unpurchasedBidConsequence: "REPORT" }])).toBe(3);
  });
});

describe("the opening policy (OD-9)", () => {
  const empty: OpeningPolicyDraft = { invitedCountReading: null, invitedCountProvenance: null, qualifiedLabelEn: null, qualifiedLabelMs: null, notQualifiedLabelEn: null, notQualifiedLabelMs: null, lowestLabelEn: null, lowestLabelMs: null, labelsProvenance: null };
  it("empty is allowed, and the reading not set is counted (it blocks finalising)", () => {
    expect(openingPolicyFaults(empty)).toEqual([]);
    expect(openingPolicyNotSet(null)).toBe(1);
    expect(openingPolicyNotSet({ invitedCountReading: null })).toBe(1);
    expect(openingPolicyNotSet({ invitedCountReading: "INVITEES" })).toBe(0);
  });
  it("a reading says where it came from", () => {
    expect(codes(openingPolicyFaults({ ...empty, invitedCountReading: "PURCHASERS" }))).toEqual(["PROVENANCE_REQUIRED@invitedCountProvenance"]);
  });
  it("a label says where the words came from; a Malay word needs its English one", () => {
    expect(codes(openingPolicyFaults({ ...empty, qualifiedLabelEn: "Qualified" }))).toEqual(["PROVENANCE_REQUIRED@labelsProvenance"]);
    expect(codes(openingPolicyFaults({ ...empty, lowestLabelMs: "Terendah", labelsProvenance: "ASSUMED" }))).toEqual(["LABEL_MS_WITHOUT_EN@lowestLabelEn"]);
    expect(openingPolicyFaults({ ...empty, lowestLabelEn: "Lowest", lowestLabelMs: "Terendah", labelsProvenance: "ASSUMED" })).toEqual([]);
  });
  it("drops provenance with nothing to qualify", () => {
    expect(openingPolicyToSave({ ...empty, invitedCountProvenance: "STATED", labelsProvenance: "STATED" })).toMatchObject({ invitedCountProvenance: null, labelsProvenance: null });
  });
});

describe("a committee's opening panel (FR-OPN-002, FR-CTE-011, C-6)", () => {
  const empty: CommitteePanelDraft = { panelSize: null, panelSizeProvenance: null, panelExclusionRule: null, panelExcludesUnitCode: null, panelExclusionProvenance: null };
  const units = { units: ["finance", "projects"] };
  it("unset is allowed", () => {
    expect(committeePanelFaults(empty, units, "", false)).toEqual([]);
  });
  it("a size is at least one, exactly one passes, and it says where it came from", () => {
    expect(codes(committeePanelFaults({ ...empty, panelSize: 0, panelSizeProvenance: "STATED" }, units, "r", true))).toEqual(["PANEL_SIZE_BELOW_ONE@panelSize"]);
    expect(committeePanelFaults({ ...empty, panelSize: 1, panelSizeProvenance: "STATED" }, units, "r", true)).toEqual([]);
    expect(codes(committeePanelFaults({ ...empty, panelSize: 2 }, units, "r", true))).toEqual(["PROVENANCE_REQUIRED@panelSizeProvenance"]);
  });
  it("a rule that applies names a configured unit; one that does not names none", () => {
    expect(codes(committeePanelFaults({ ...empty, panelExclusionRule: true, panelExclusionProvenance: "ASSUMED" }, units, "r", true))).toEqual(["EXCLUDED_UNIT_REQUIRED@panelExcludesUnitCode"]);
    expect(codes(committeePanelFaults({ ...empty, panelExclusionRule: true, panelExcludesUnitCode: "nowhere", panelExclusionProvenance: "ASSUMED" }, units, "r", true))).toEqual(["EXCLUDED_UNIT_UNKNOWN@panelExcludesUnitCode"]);
    expect(codes(committeePanelFaults({ ...empty, panelExclusionRule: false, panelExcludesUnitCode: "finance", panelExclusionProvenance: "ASSUMED" }, units, "r", true))).toEqual(["EXCLUDED_UNIT_WITHOUT_RULE@panelExcludesUnitCode"]);
    expect(codes(committeePanelFaults({ ...empty, panelExclusionRule: false }, units, "r", true))).toEqual(["PROVENANCE_REQUIRED@panelExclusionProvenance"]);
    expect(committeePanelFaults({ ...empty, panelExclusionRule: true, panelExcludesUnitCode: "projects", panelExclusionProvenance: "OBSERVED" }, units, "r", true)).toEqual([]);
  });
  it("a change asks for a reason; saving nothing changed does not", () => {
    expect(codes(committeePanelFaults({ ...empty, panelSize: 2, panelSizeProvenance: "STATED" }, units, "  ", true))).toEqual(["REASON_REQUIRED@reason"]);
    expect(committeePanelFaults(empty, units, "", false)).toEqual([]);
  });
  it("stores no unit without a rule and no provenance without a value", () => {
    expect(committeePanelToSave({ panelSize: null, panelSizeProvenance: "STATED", panelExclusionRule: null, panelExcludesUnitCode: "finance", panelExclusionProvenance: "STATED" })).toEqual(empty);
  });
});

describe("a person's unit", () => {
  it("not recorded is allowed; a code must be configured", () => {
    expect(personUnitFault(null, ["finance"])).toBeNull();
    expect(personUnitFault("finance", ["finance"])).toBeNull();
    expect(personUnitFault("gone", ["finance"])).toBe("UNIT_UNKNOWN");
  });
});

describe("words", () => {
  it("every fault has its words, and none names a configuration key", () => {
    for (const t of Object.values(OPENING_CONFIG_FAULT_TEXT)) expect(t).toMatch(/^[A-Z][^_]+\.$/);
  });
});
