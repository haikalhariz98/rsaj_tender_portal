import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { SK004_LIABILITY_BANDS } from "./fixture";
import { applicableRequirements, insuranceFaults, type PolicyContext, type PolicyInput, type Requirement, wcSumCheck } from "./insurance";

const RM = parseSen;
const req = (code: string, kind: Requirement["kind"], extra: Partial<Requirement> = {}): Requirement => ({ code, nameEn: code, kind, contractTypeCode: null, required: true, percent: null, tailMonths: 3, tailDays: 14, ...extra });

const ctx = (extra: Partial<PolicyContext> = {}): PolicyContext => ({
  requirement: req("works", "WORKS"),
  contractPrice: RM("2100000"),
  bands: SK004_LIABILITY_BANDS,
  wcBasis: null,
  issuers: [{ id: "ins1", retiredOn: null }],
  start: "2026-03-01",
  completion: { n: 24, unit: "MONTHS" },
  dlpMonths: 12,
  ...extra,
});
const policy = (extra: Partial<PolicyInput> = {}): PolicyInput => ({
  kind: "WORKS", substitutesFor: null, issuerId: "ins1", lodgedOn: "2026-02-20", sumInsured: RM("2150000"), appendixAmount: RM("50000"), requiredLimit: null, raisedJustification: "", periodEnd: "2029-06-15", ...extra,
});

describe("which policies apply (FR-AWD-013)", () => {
  it("a contract type's own row takes the place of the general row of that kind", () => {
    const reqs = [req("works", "WORKS"), req("pl", "PUBLIC_LIABILITY"), req("db_works", "WORKS", { contractTypeCode: "design_build", tailDays: 28 })];
    expect(applicableRequirements(reqs, "design_build").map((r) => r.code)).toEqual(["db_works", "pl"]);
    expect(applicableRequirements(reqs, "works").map((r) => r.code)).toEqual(["works", "pl"]);
  });
  it("a row marked not required is not asked for", () => {
    expect(applicableRequirements([req("wc", "WORKMENS_COMPENSATION", { required: false })], null)).toEqual([]);
  });
});

describe("verifying a policy", () => {
  it("a works policy at price plus appendix, running to completion + DLP + tail, passes", () => {
    expect(insuranceFaults(policy(), ctx())).toEqual([]);
  });
  it("a works sum below the price plus the appendix amount is refused", () => {
    expect(insuranceFaults(policy({ sumInsured: RM("2149999.99") }), ctx())).toEqual(["SUM_BELOW_REQUIRED"]);
  });
  it("a policy ending before the required day is refused, and an unset DLP is not set", () => {
    expect(insuranceFaults(policy({ periodEnd: "2029-06-14" }), ctx())).toEqual(["PERIOD_TOO_SHORT"]);
    expect(insuranceFaults(policy(), ctx({ dlpMonths: null }))).toEqual(["PERIOD_NOT_SET"]);
  });
  it("a CAR policy accepted for the works policy is judged as the works policy", () => {
    expect(insuranceFaults(policy({ kind: "CAR", substitutesFor: "WORKS" }), ctx())).toEqual([]);
    expect(insuranceFaults(policy({ kind: "PUBLIC_LIABILITY", substitutesFor: "WORKS", sumInsured: RM("200000") }), ctx({ requirement: req("pl", "PUBLIC_LIABILITY") }))).toContain("BAD_SUBSTITUTION");
  });
  it("public liability must meet the band's limit, raised only with a justification", () => {
    const pl = (x: Partial<PolicyInput>) => insuranceFaults(policy({ kind: "PUBLIC_LIABILITY", appendixAmount: null, ...x }), ctx({ requirement: req("pl", "PUBLIC_LIABILITY") }));
    expect(pl({ sumInsured: RM("200000") })).toEqual([]);
    expect(pl({ sumInsured: RM("199999") })).toEqual(["BELOW_LIMIT"]);
    expect(pl({ sumInsured: RM("500000"), requiredLimit: RM("500000") })).toEqual(["LIMIT_JUSTIFICATION_REQUIRED"]);
    expect(pl({ sumInsured: RM("200000"), requiredLimit: RM("100000") })).toEqual(["LIMIT_LOWERED"]);
  });
  it("public liability on a price in the printed table's gap is refused, not placed", () => {
    expect(insuranceFaults(policy({ kind: "PUBLIC_LIABILITY", sumInsured: RM("25000") }), ctx({ requirement: req("pl", "PUBLIC_LIABILITY"), contractPrice: RM("25000.50") }))).toEqual(["NO_BAND"]);
  });
  it("workmen's compensation with no basis chosen is not set (D4)", () => {
    const wc = (x: Partial<PolicyContext>) => insuranceFaults(policy({ kind: "WORKMENS_COMPENSATION", sumInsured: RM("210000") }), ctx({ requirement: req("wc", "WORKMENS_COMPENSATION", { percent: "10" }), ...x }));
    expect(wc({})).toEqual(["WC_BASIS_NOT_SET"]);
    expect(wc({ wcBasis: "PERCENT_OF_CONTRACT" })).toEqual([]);
    expect(wc({ wcBasis: "UNCOVERED_WAGES" })).toEqual([]);
    expect(insuranceFaults(policy({ kind: "WORKMENS_COMPENSATION", sumInsured: RM("1") }), ctx({ requirement: req("wc", "WORKMENS_COMPENSATION"), wcBasis: "PERCENT_OF_CONTRACT" }))).toEqual(["WC_PERCENT_NOT_SET"]);
  });
  it("an insurer not on the approved list is refused", () => {
    expect(insuranceFaults(policy({ issuerId: null }), ctx())).toEqual(["ISSUER_NOT_APPROVED"]);
  });
});

describe("workmen's compensation on uncovered wages (BD-15)", () => {
  it("is not checked, never passed; a percentage basis is checked; unset is not set", () => {
    expect(wcSumCheck("UNCOVERED_WAGES")).toBe("NOT_CHECKED");
    expect(wcSumCheck("PERCENT_OF_CONTRACT")).toBe("CHECKED");
    expect(wcSumCheck(null)).toBe("NOT_SET");
  });
});
