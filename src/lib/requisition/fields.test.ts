import { describe, expect, it } from "vitest";

import type { CodeFormat, OrgUnit } from "@/lib/organisation/types";

import { blocking, erpRefFaults, fundingSourceFaults, requisitionFaults, type Lookups, type RequisitionDraft } from "./fields";
import { fieldFaultText } from "./labels";

const from = new Date("2024-01-01T00:00:00Z");
const on = new Date("2026-09-30T00:00:00Z");
const fmt = (key: string, pattern: string): CodeFormat => ({ key, pattern, example: "", description: "", provenance: "STATED" });
// The shapes the specification describes, as test formats (never shipped).
const FORMATS = [
  fmt("cost_centre", "\\d\\.\\d{2}\\.\\d{2}\\.\\d{2}\\.\\d{3}"),
  fmt("account_code", "\\d{7}"),
  fmt("erp_requisition_no", "PROC\\d{10}"),
  fmt("erp_note_no", "NM/\\d{4}/\\d{5}"),
];

const unit = (code: string, kind: OrgUnit["kind"], parentCode: string | null): OrgUnit => ({
  code, nameEn: code, nameMs: null, kind, parentCode, costCentreCode: null, headPersonId: null, registrationNumber: null,
  taxReference: null, telephone: null, financialYearStart: null, address: "", operatingLicence: null, governingSource: "",
  provenance: "STATED", notes: "", sortOrder: 0, effectiveFrom: from, effectiveTo: null,
});

const LOOKUPS: Lookups = {
  units: [unit("DIV", "DIVISION", null), unit("DEPT", "DEPARTMENT", "DIV"), unit("SEC", "SECTION", "DEPT")],
  costCentres: [{ code: "1.16.04.06.009", orgUnitCode: "DEPT", effectiveFrom: from, effectiveTo: null }, { code: "1.16.04.06", orgUnitCode: null, effectiveFrom: from, effectiveTo: null }],
  accountCodes: [{ code: "6100599", effectiveFrom: from, effectiveTo: null }, { code: "610059", effectiveFrom: from, effectiveTo: null }],
  sites: [],
  budgetCodes: [{ id: "b1", accountCode: "6100599", isActive: true, effectiveFrom: from, effectiveTo: null }],
  people: [{ id: "p1", isActive: true }, { id: "gone", isActive: false }],
  fundingRoutes: [{ code: "opex", retiredOn: null }],
};

const draft = (over: Partial<RequisitionDraft> = {}): RequisitionDraft => ({
  title: "Pump spares", justification: "Worn impellers", needStatement: "Two pumps down",
  requestingUnitCode: "DEPT", sectionUnitCode: "SEC", requestingPersonId: "p1",
  costCentreCode: "1.16.04.06.009", accountCode: "6100599", budgetCodeId: "b1", siteCode: null,
  placeOfDelivery: "Depot", dateRequired: "2026-11-01", estimatedValue: "1500.00", fundingRouteCode: "opex",
  lines: [
    { description: "Impeller", quantity: "2", unit: "each", estimatedUnitPrice: "500.00", estimatedAmount: "1000.00" },
    { description: "Seals", quantity: null, unit: null, estimatedUnitPrice: null, estimatedAmount: "500.00" },
  ],
  ...over,
});

const codes = (d: RequisitionDraft, opts?: { complete: boolean }) => requisitionFaults(d, LOOKUPS, FORMATS, on, opts).map((f) => `${f.field}:${f.code}`);

describe("a requisition's fields (FR-REQ-001)", () => {
  it("passes when every field is there and the lines sum", () => {
    expect(codes(draft())).toEqual([]);
  });

  it("requires every field and at least one line", () => {
    const c = codes(draft({ title: "", placeOfDelivery: " ", costCentreCode: null, lines: [] }));
    expect(c).toEqual(expect.arrayContaining(["title:REQUIRED", "placeOfDelivery:REQUIRED", "costCentreCode:REQUIRED", "lines:NO_LINES"]));
  });

  // Founder, 2026-10-06: the need statement is no longer asked for.
  it("does not require a need statement", () => {
    expect(codes(draft({ needStatement: "" }))).toEqual([]);
  });

  it("requires the lines to sum to the estimated value", () => {
    expect(codes(draft({ estimatedValue: "1500.01" }))).toContain("lines:LINES_DO_NOT_SUM");
  });

  it("lets a draft be saved half-written, but not with a value that is wrong", () => {
    expect(codes(draft({ title: "", estimatedValue: "9" }), { complete: false })).toEqual([]);
    expect(codes(draft({ costCentreCode: "9.99" }), { complete: false })).toContain("costCentreCode:NOT_IN_FORCE");
  });

  it("checks a five-segment cost centre: 1.16.04.06.009 passes, 1.16.04.06 fails", () => {
    expect(codes(draft())).not.toContain("costCentreCode:MALFORMED");
    expect(codes(draft({ costCentreCode: "1.16.04.06" }))).toContain("costCentreCode:MALFORMED");
  });

  it("checks a seven-digit account: 6100599 passes, 610059 fails", () => {
    expect(codes(draft({ accountCode: "610059", budgetCodeId: null }))).toContain("accountCode:MALFORMED");
    expect(codes(draft())).not.toContain("accountCode:MALFORMED");
  });

  it("warns, never passes, where no format is configured", () => {
    const faults = requisitionFaults(draft(), LOOKUPS, [], on);
    expect(faults.map((f) => f.code)).toContain("NO_FORMAT");
    expect(blocking(faults)).toEqual([]);
  });

  it("requires the account to be the budget code's own", () => {
    const l = { ...LOOKUPS, budgetCodes: [{ ...LOOKUPS.budgetCodes[0], accountCode: "7000000" }] };
    expect(requisitionFaults(draft(), l, FORMATS, on).map((f) => f.code)).toContain("ACCOUNT_NOT_BUDGET_CODE_ACCOUNT");
  });

  it("requires a department, a section under it, and an active requester", () => {
    expect(codes(draft({ requestingUnitCode: "DIV", sectionUnitCode: null }))).toContain("requestingUnitCode:NOT_A_DEPARTMENT");
    expect(codes(draft({ sectionUnitCode: "DIV" }))).toContain("sectionUnitCode:SECTION_NOT_UNDER_UNIT");
    expect(codes(draft({ requestingPersonId: "gone" }))).toContain("requestingPersonId:INACTIVE_PERSON");
  });
});

describe("finance-system references (FR-REQ-002)", () => {
  it("accepts a global counter that runs on across the year: PROC2025150424 then PROC2026154676", () => {
    expect(erpRefFaults("PROC2025150424", null, FORMATS)).toEqual([]);
    expect(erpRefFaults("PROC2026154676", null, FORMATS)).toEqual([]);
  });

  it("accepts NM/2026/00001 and refuses a malformed note number", () => {
    expect(erpRefFaults(null, "NM/2026/00001", FORMATS)).toEqual([]);
    expect(erpRefFaults(null, "NM/26/1", FORMATS).map((f) => f.code)).toEqual(["MALFORMED"]);
  });

  it("says no format is configured rather than passing", () => {
    expect(erpRefFaults("PROC2026154676", null, []).map((f) => f.code)).toEqual(["NO_FORMAT"]);
  });
});

describe("the funding source (SF-02, ADR 0046 FS-4)", () => {
  const SOURCES: Lookups = {
    ...LOOKUPS,
    fundingSources: [
      { id: "sukuk", nameEn: "Sukuk", categoriesRestricted: true, eligibleCategoryCodes: ["WATER"], retiredOn: null },
      { id: "internal", nameEn: "Internal", categoriesRestricted: false, eligibleCategoryCodes: [], retiredOn: null },
      { id: "grant", nameEn: "Grant", categoriesRestricted: null, eligibleCategoryCodes: [], retiredOn: null },
      { id: "old", nameEn: "Old", categoriesRestricted: false, eligibleCategoryCodes: [], retiredOn: on },
      { id: "oldSukuk", nameEn: "Old sukuk", categoriesRestricted: true, eligibleCategoryCodes: ["WATER"], retiredOn: on },
    ],
    projectCategories: [{ code: "WATER", retiredOn: null }, { code: "OFFICE", retiredOn: null }, { code: "GONE", retiredOn: on }],
  };
  const fs = (over: Partial<RequisitionDraft>, opts?: { complete: boolean }) => requisitionFaults(draft(over), SOURCES, FORMATS, on, opts).map((f) => `${f.field}:${f.code}`);

  it("is optional, and an eligible or unrestricted source passes", () => {
    expect(fs({})).toEqual([]);
    expect(fs({ fundingSourceId: "sukuk", projectCategoryCode: "WATER" })).toEqual([]);
    expect(fs({ fundingSourceId: "internal" })).toEqual([]);
  });

  it("an ineligible category blocks, and a restricted source needs a category to leave Draft", () => {
    expect(fs({ fundingSourceId: "sukuk", projectCategoryCode: "OFFICE" })).toEqual(["fundingSourceId:NOT_ELIGIBLE"]);
    expect(fs({ fundingSourceId: "sukuk" })).toEqual(["projectCategoryCode:CATEGORY_REQUIRED"]);
    expect(fs({ fundingSourceId: "sukuk" }, { complete: false })).toEqual([]);
  });

  it("an unset eligibility warns and never blocks", () => {
    const faults = requisitionFaults(draft({ fundingSourceId: "grant", projectCategoryCode: "OFFICE" }), SOURCES, FORMATS, on);
    expect(faults.map((f) => f.code)).toEqual(["ELIGIBILITY_NOT_SET"]);
    expect(blocking(faults)).toEqual([]);
    // Review finding 3: the words name the source.
    expect(fieldFaultText(faults[0])).toBe("Eligibility not set for Grant, so the project category is not checked.");
  });

  it("a source the act keeps is not refused for being retired since, and its eligibility is still judged (amendment 14)", () => {
    const kept = (over: Partial<RequisitionDraft>) => fundingSourceFaults(draft(over), SOURCES, on, true, { sourceKept: true }).map((f) => `${f.field}:${f.code}`);
    expect(kept({ fundingSourceId: "old", projectCategoryCode: "OFFICE" })).toEqual([]);
    expect(kept({ fundingSourceId: "oldSukuk", projectCategoryCode: "WATER" })).toEqual([]);
    expect(kept({ fundingSourceId: "oldSukuk", projectCategoryCode: "OFFICE" })).toEqual(["fundingSourceId:NOT_ELIGIBLE"]);
    expect(kept({ fundingSourceId: "nope" })).toEqual(["fundingSourceId:NOT_IN_FORCE"]);
    expect(fundingSourceFaults(draft({ fundingSourceId: "old" }), SOURCES, on, true).map((f) => f.code)).toEqual(["NOT_IN_FORCE"]);
  });

  it("a retired or unknown source or category is not in force", () => {
    expect(fs({ fundingSourceId: "old" })).toEqual(["fundingSourceId:NOT_IN_FORCE"]);
    expect(fs({ fundingSourceId: "nope" })).toEqual(["fundingSourceId:NOT_IN_FORCE"]);
    expect(fs({ fundingSourceId: "internal", projectCategoryCode: "GONE" })).toEqual(["projectCategoryCode:NOT_IN_FORCE"]);
  });
});
