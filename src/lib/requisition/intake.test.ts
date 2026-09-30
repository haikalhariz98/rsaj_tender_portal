import { describe, expect, it } from "vitest";

import type { CodeFormat } from "@/lib/organisation/types";

import type { Lookups } from "./fields";
import { intakeFaults, type ExternalRequisition } from "./intake";

const from = new Date("2024-01-01T00:00:00Z");
const on = new Date("2026-09-30T00:00:00Z");
const LOOKUPS: Lookups = {
  units: [{ code: "DEPT", nameEn: "", nameMs: null, kind: "DEPARTMENT", parentCode: null, costCentreCode: null, headPersonId: null, registrationNumber: null, taxReference: null, telephone: null, financialYearStart: null, address: "", operatingLicence: null, governingSource: "", provenance: "STATED", notes: "", sortOrder: 0, effectiveFrom: from, effectiveTo: null }],
  costCentres: [{ code: "CC-1", orgUnitCode: "DEPT", effectiveFrom: from, effectiveTo: null }],
  accountCodes: [{ code: "6100100", effectiveFrom: from, effectiveTo: null }],
  sites: [],
  budgetCodes: [],
  people: [{ id: "p1", isActive: true }],
  fundingRoutes: [{ code: "opex", retiredOn: null }],
};
const FORMATS: CodeFormat[] = [{ key: "erp_requisition_no", pattern: "PROC\\d{10}", example: "", description: "", provenance: "STATED" }];

const payload = (over: Partial<ExternalRequisition> = {}): ExternalRequisition => ({
  title: "Chlorine", justification: "Stock", needStatement: "Plant", requestingUnitCode: "DEPT", sectionUnitCode: null,
  requestingPersonId: "p1", costCentreCode: "CC-1", accountCode: "6100100", budgetCodeId: null, siteCode: null,
  placeOfDelivery: "Plant", dateRequired: "2026-10-30", estimatedValue: "1000.00", fundingRouteCode: "opex",
  lines: [{ description: "Chlorine", quantity: null, unit: null, estimatedUnitPrice: null, estimatedAmount: "1000.00" }],
  erpRequisitionNo: "PROC2026154676", erpNoteNo: "NM/2026/00001",
  budget: { asAt: "2026-09-01", actualBudget: "5000.00", balanceAsAt: "3000.00", approvedAccount: "2000.00", projectedBalance: "2000.00" },
  trail: [
    { roleLabel: "Head of Department", act: "R", actorName: "A", actorPersonId: null, decidedOn: "2026-09-02" },
    { roleLabel: "Head of Division", act: "A", actorName: "B", actorPersonId: null, decidedOn: "2026-09-03" },
  ],
  ...over,
});

describe("a requisition received from the finance system (INT-01)", () => {
  it("accepts a complete, approved payload", () => {
    expect(intakeFaults(payload(), LOOKUPS, FORMATS, on, "2026-09-30")).toEqual([]);
  });

  it("requires the finance system's numbers, in their configured shape", () => {
    const f = intakeFaults(payload({ erpRequisitionNo: "", erpNoteNo: "" }), LOOKUPS, FORMATS, on, "2026-09-30");
    expect(f.map((x) => x.field)).toEqual(expect.arrayContaining(["erpRequisitionNo", "erpNoteNo"]));
    expect(intakeFaults(payload({ erpRequisitionNo: "PROC1" }), LOOKUPS, FORMATS, on, "2026-09-30")).toEqual([{ field: "erpRequisitionNo", message: "MALFORMED" }]);
  });

  it("requires a trail that ends in an approval, dated no later than today", () => {
    expect(intakeFaults(payload({ trail: [] }), LOOKUPS, FORMATS, on, "2026-09-30").map((x) => x.message)).toContain("TRAIL_REQUIRED");
    const recommendOnly = payload({ trail: [{ roleLabel: "HoD", act: "R", actorName: "A", actorPersonId: null, decidedOn: "2026-09-02" }] });
    expect(intakeFaults(recommendOnly, LOOKUPS, FORMATS, on, "2026-09-30").map((x) => x.message)).toContain("NOT_APPROVED");
    const future = payload({ trail: [{ roleLabel: "HoD", act: "A", actorName: "A", actorPersonId: null, decidedOn: "2026-10-02" }] });
    expect(intakeFaults(future, LOOKUPS, FORMATS, on, "2026-09-30").map((x) => x.message)).toContain("FUTURE_DATE");
  });

  it("requires the balance as at a date, and waits for a time zone", () => {
    expect(intakeFaults(payload({ budget: { ...payload().budget, balanceAsAt: "" } }), LOOKUPS, FORMATS, on, "2026-09-30").map((x) => x.field)).toContain("budget.balanceAsAt");
    expect(intakeFaults(payload(), LOOKUPS, FORMATS, on, null)).toHaveLength(1);
  });
});
