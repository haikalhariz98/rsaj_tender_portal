import { describe, expect, it } from "vitest";

import { fundingGate, type FundingRouteRow } from "./funding";

const on = new Date("2026-09-30T00:00:00Z");
const route = (over: Partial<FundingRouteRow> = {}): FundingRouteRow => ({
  code: "r", nameEn: "Route", nameMs: null, organisationProcures: true, routeDecidedExternally: false, supersedesAuthority: false,
  trigger: "", governingSource: "", provenance: "STATED", notes: "", sortOrder: 0, retiredOn: null,
  requiresExternalAuthorityRef: false, externalAuthorityRefLabel: null, ...over,
});

describe("the funding gate (FR-REQ-004, FR-REQ-005)", () => {
  it("requires a funding route", () => {
    expect(fundingGate(null, { externalAuthorityRef: null }, on).faults).toEqual([{ code: "FUNDING_REQUIRED" }]);
  });

  it("does not permit sourcing on a route where the organisation only keeps records", () => {
    const g = fundingGate(route({ organisationProcures: false, supersedesAuthority: true }), { externalAuthorityRef: null }, on);
    expect(g.posture).toBe("RECORDS_ONLY");
    expect(g.sourcingPermitted).toBe(false);
    expect(g.supersedesAuthority).toBe(true);
  });

  it("holds progress until the external authority is recorded, named as the customer names it", () => {
    const r = route({ requiresExternalAuthorityRef: true, externalAuthorityRefLabel: "Funder execution letter" });
    expect(fundingGate(r, { externalAuthorityRef: " " }, on).faults).toEqual([{ code: "EXTERNAL_REF_MISSING", label: "Funder execution letter" }]);
    expect(fundingGate(r, { externalAuthorityRef: "PEL/1" }, on).faults).toEqual([]);
  });

  it("refuses a retired route", () => {
    expect(fundingGate(route({ retiredOn: new Date("2026-01-01T00:00:00Z") }), { externalAuthorityRef: null }, on).faults[0].code).toBe("ROUTE_RETIRED");
  });
});
