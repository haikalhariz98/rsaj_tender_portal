import { describe, expect, it } from "vitest";

import { bodyConfigFaults, conditionsHoldingWorkBack, conditionsPolicyFaults, conditionsPolicyFaultText, taxonomyUses } from "./config-conditions";

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("configuring a registration body (FR-DOC-005: configured bodies, never columns per regulator)", () => {
  it("a code of its own, a name and where it comes from", () => {
    const b = { code: "companies_registry", labelEn: "the companies registry", provenance: "STATED" };
    expect(bodyConfigFaults(b, [])).toEqual([]);
    expect(codes(bodyConfigFaults({ ...b, code: "Companies Registry" }, []))).toEqual(["CODE_REQUIRED"]);
    expect(codes(bodyConfigFaults(b, [{ id: "x", code: "companies_registry" }]))).toEqual(["CODE_TAKEN"]);
    expect(bodyConfigFaults({ ...b, id: "x" }, [{ id: "x", code: "companies_registry" }])).toEqual([]);
    expect(codes(bodyConfigFaults({ ...b, labelEn: " ", provenance: null }, []))).toEqual(["LABEL_REQUIRED", "PROVENANCE_REQUIRED"]);
  });
});

describe("the policy's increment-2 values", () => {
  const none = { restrictionLabelEn: null, restrictionStampTextEn: null, restrictionStampTextMs: null, restrictionProvenance: null, assuranceRequired: null, assuranceProvenance: null, regulatorPermitTaxonomyCode: null };
  it("nothing set is valid (and reads Not set where used)", () => {
    expect(conditionsPolicyFaults(none, [])).toEqual([]);
  });
  it("restriction wording and the assurance answer each say where they come from; the permit list is a configured taxonomy", () => {
    expect(codes(conditionsPolicyFaults({ ...none, restrictionStampTextMs: "TERHAD" }, []))).toEqual(["PROVENANCE_REQUIRED"]);
    expect(conditionsPolicyFaults({ ...none, restrictionStampTextMs: "TERHAD", restrictionProvenance: "STATED" }, [])).toEqual([]);
    expect(codes(conditionsPolicyFaults({ ...none, assuranceRequired: false }, []))).toEqual(["PROVENANCE_REQUIRED"]);
    expect(codes(conditionsPolicyFaults({ ...none, regulatorPermitTaxonomyCode: "permits" }, ["other"]))).toEqual(["TAXONOMY_UNKNOWN"]);
    expect(conditionsPolicyFaults({ ...none, regulatorPermitTaxonomyCode: "permits" }, ["permits"])).toEqual([]);
  });
});

describe("what holds every submission back (62-C4's rule for the header)", () => {
  it("the assurance answer unset, and each live clause whose 'mandatory' is unset", () => {
    expect(conditionsHoldingWorkBack(null, [], "2026-10-01")).toBe(1);
    expect(conditionsHoldingWorkBack(false, [], "2026-10-01")).toBe(0);
    expect(conditionsHoldingWorkBack(true, [{ retiredOn: null, mandatoryInAgreements: null }, { retiredOn: "2026-09-01", mandatoryInAgreements: null }, { retiredOn: null, mandatoryInAgreements: true }], "2026-10-01")).toBe(1);
  });
});

describe("the permit list must be a plain list, not a classification (C2: carry 6)", () => {
  const none = { restrictionLabelEn: null, restrictionStampTextEn: null, restrictionStampTextMs: null, restrictionProvenance: null, assuranceRequired: null, assuranceProvenance: null, regulatorPermitTaxonomyCode: "permits" };
  const mappings = [{ taxonomyCode: "kind", whenTaxonomyCode: null }, { taxonomyCode: "other", whenTaxonomyCode: "permits" }];
  const uses = (m: typeof mappings, ex: { taxonomyCode: string }[] = [], pol: { name: string; codes: (string | null)[] }[] = []) => taxonomyUses(["permits", "kind"], m, ex, pol);

  it("a taxonomy with no mapping, no exercise and no policy is accepted", () => {
    expect(conditionsPolicyFaults(none, ["permits", "kind"], uses([{ taxonomyCode: "kind", whenTaxonomyCode: null }]))).toEqual([]);
  });
  it("a taxonomy that contract types are mapped into is refused, whether it is the value's or the condition's", () => {
    const asValue = uses([{ taxonomyCode: "permits", whenTaxonomyCode: null }]);
    expect(codes(conditionsPolicyFaults(none, ["permits"], asValue))).toEqual(["TAXONOMY_CLASSIFIES"]);
    expect(codes(conditionsPolicyFaults(none, ["permits"], uses(mappings)))).toEqual(["TAXONOMY_CLASSIFIES"]);
    expect(conditionsPolicyFaultText(conditionsPolicyFaults(none, ["permits"], asValue)[0])).toBe("1 mapping row maps contract types into that list, so it classifies contracts. Choose a plain list, or add a new one under Reference data.");
  });
  it("a taxonomy exercises are already classified in is refused", () => {
    expect(codes(conditionsPolicyFaults(none, ["permits"], uses([], [{ taxonomyCode: "permits" }, { taxonomyCode: "permits" }])))).toEqual(["TAXONOMY_CLASSIFIED_EXERCISES"]);
  });
  it("a taxonomy another policy names is refused, naming the policy", () => {
    const fs = conditionsPolicyFaults(none, ["permits"], uses([], [], [{ name: "scope policy's panel contract kind", codes: ["permits", null] }]));
    expect(codes(fs)).toEqual(["TAXONOMY_NAMED_BY_POLICY"]);
    expect(conditionsPolicyFaultText(fs[0])).toContain("scope policy's panel contract kind");
  });
  it("without usage facts nothing is refused (the unknown-taxonomy check still is)", () => {
    expect(conditionsPolicyFaults(none, ["permits"])).toEqual([]);
    expect(codes(conditionsPolicyFaults(none, ["kind"], uses(mappings)))).toEqual(["TAXONOMY_UNKNOWN"]);
  });
});
