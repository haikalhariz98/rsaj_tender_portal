import { describe, expect, it, vi } from "vitest";

// The hidden-exercise guard lives beside database readers; none is called here.
vi.mock("@/lib/db", () => ({ db: {} }));

import { exerciseNotHidden } from "@/lib/auth/sulit-store";
import { caseVisibilityWhere } from "@/lib/contract/case-visibility";
import { CASE_PIPELINE, REQUISITION_PIPELINE, SOURCING_PIPELINE_WHERE, casePipelineWhere } from "@/lib/dashboard/pipeline";
import { dayIn } from "@/lib/dates";

import { PAYABLE_KINDS, facetWhere, insightsWhere } from "./where";

const ORG = "org-1";
const hidden = ["ex-restricted"];
const none = { unit: null };
const fy = { from: "2026-01-01", to: "2027-01-01" };

describe("with no filter, the pipeline filters are Home's own (the counts match by construction)", () => {
  it("Requisitions card", () => {
    expect(insightsWhere.requisitionPipeline(ORG, none)).toEqual({ organisationId: ORG, status: { in: [...REQUISITION_PIPELINE] } });
  });
  it("Sourcing card, restricted exercises left out", () => {
    expect(insightsWhere.sourcingPipeline(ORG, none, hidden)).toEqual({ organisationId: ORG, ...exerciseNotHidden(hidden), ...SOURCING_PIPELINE_WHERE });
    expect(insightsWhere.sourcingPipeline(ORG, none, [])).toEqual({ organisationId: ORG, ...SOURCING_PIPELINE_WHERE });
  });
  it("Contracts card, each stage", () => {
    for (const stage of CASE_PIPELINE) expect(insightsWhere.cases(ORG, stage, none, hidden), stage).toEqual({ organisationId: ORG, ...casePipelineWhere(stage, hidden) });
  });
});

describe("filters compose without overwriting the visibility rule", () => {
  it("a department narrows a case stage inside AND, keeping the restricted-case OR", () => {
    const w = insightsWhere.cases(ORG, "ON_SITE", { unit: "WS" }, hidden);
    expect(w).toEqual({ organisationId: ORG, AND: [casePipelineWhere("ON_SITE", hidden), { exercise: { requisition: { requestingUnitCode: "WS" } } }] });
  });
  it("Completed and Closed cases carry the visibility rule too", () => {
    const w = insightsWhere.cases(ORG, "COMPLETED", none, hidden);
    expect(JSON.stringify(w)).toContain(JSON.stringify(caseVisibilityWhere(hidden)));
  });
  it("an exercise's department is its requisition's, and its method its own", () => {
    expect(insightsWhere.sourcingPipeline(ORG, { unit: "WS", method: "OPEN" }, [])).toMatchObject({ requisition: { requestingUnitCode: "WS" }, sourcingMethodCode: "OPEN" });
  });
  it("an award's, a payment's, a certificate's and a variation's department is its exercise's requisition's", () => {
    const vis = { AND: [caseVisibilityWhere(hidden), { exercise: { requisition: { requestingUnitCode: "WS" } } }] };
    expect(insightsWhere.awardsIssued(ORG, { unit: "WS" }, fy, null, hidden)).toMatchObject(vis);
    expect(insightsWhere.payments(ORG, { unit: "WS" }, fy, hidden).certificate).toEqual({ contract: { award: vis } });
    expect(insightsWhere.awaitingPayment(ORG, { unit: "WS" }, hidden).contract).toEqual({ award: vis });
    expect(insightsWhere.variationsOpen(ORG, { unit: "WS" }, hidden).contract).toEqual({ award: vis });
  });
  it("the funding source narrows requisitions by its code (ADR 0046)", () => {
    expect(facetWhere.requisition({ unit: null, source: "SUK" })).toEqual({ fundingSource: { code: "SUK" } });
    expect(facetWhere.requisition({ unit: "WS", route: "GOV", source: null })).toEqual({ requestingUnitCode: "WS", fundingRouteCode: "GOV" });
  });
  it("the funding route narrows requisitions and the approvals behind them", () => {
    expect(insightsWhere.requisitionsRaised(ORG, { unit: null, route: "GOV" }, fy)).toMatchObject({ fundingRouteCode: "GOV" });
    expect(insightsWhere.approvalsClosed(ORG, { unit: "WS", route: "GOV" }, fy, null).requisition).toEqual({ requestingUnitCode: "WS", fundingRouteCode: "GOV" });
    expect(insightsWhere.approvalsClosed(ORG, none, fy, null)).not.toHaveProperty("requisition");
  });
});

describe("every filter is the organisation's", () => {
  it("names the organisation, and budget movements reach it through their code", () => {
    const all = [
      insightsWhere.requisitionsRaised(ORG, none, fy),
      insightsWhere.requisitionsApproved(ORG, none, fy),
      insightsWhere.requisitionsNow(ORG, none, "PENDING_APPROVAL"),
      insightsWhere.requisitionPipeline(ORG, none),
      insightsWhere.approvalsClosed(ORG, none, fy, "Asia/Kuala_Lumpur"),
      insightsWhere.sourcingPipeline(ORG, none, hidden),
      insightsWhere.cases(ORG, "CLOSED", none, hidden),
      insightsWhere.awardsIssued(ORG, none, fy, null, hidden),
      insightsWhere.payments(ORG, none, fy, hidden),
      insightsWhere.awaitingPayment(ORG, none, hidden),
      insightsWhere.variationsOpen(ORG, none, hidden),
      insightsWhere.budgetCodes(ORG, null),
    ];
    for (const w of all) expect(w).toMatchObject({ organisationId: ORG });
    expect(insightsWhere.budgetMovements(ORG, "WS")).toEqual({ budgetCode: { organisationId: ORG, owningUnitCode: "WS" } });
  });
});

describe("year bounds", () => {
  it("a day column is compared with stored days, the end exclusive", () => {
    expect(insightsWhere.requisitionsRaised(ORG, none, fy).raisedOn).toEqual({ gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2027-01-01T00:00:00Z") });
    expect(insightsWhere.payments(ORG, none, fy, []).paidOn).toEqual({ gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2027-01-01T00:00:00Z") });
  });
  it("an instant is compared with the organisation's midnights: an award issued 31 Dec 20:00 UTC is in the new year in Kuala Lumpur", () => {
    const b = insightsWhere.awardsIssued(ORG, none, fy, "Asia/Kuala_Lumpur", []).issuedAt as { gte: Date; lt: Date };
    expect(b).toEqual({ gte: new Date("2025-12-31T16:00:00Z"), lt: new Date("2026-12-31T16:00:00Z") });
    const at = new Date("2025-12-31T20:00:00Z");
    expect(at >= b.gte && at < b.lt).toBe(true);
    expect(dayIn(at, "Asia/Kuala_Lumpur")).toBe("2026-01-01");
  });
  it("with no zone set, the midnights are UTC's", () => {
    expect(insightsWhere.approvalsClosed(ORG, none, fy, null).closedAt).toEqual({ gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2027-01-01T00:00:00Z") });
  });
});

describe("what is counted", () => {
  it("raised means not a draft; approved means an approved requisition route", () => {
    expect(insightsWhere.requisitionsRaised(ORG, none, fy).status).toEqual({ not: "DRAFT" });
    expect(insightsWhere.requisitionsApproved(ORG, none, fy).approvalInstances).toEqual({ some: { matterKind: "REQUISITION", status: "APPROVED" } });
  });
  it("awarded is issued or accepted; waiting for payment is an issued payable certificate with no payment", () => {
    expect(insightsWhere.awardsIssued(ORG, none, fy, null, []).status).toEqual({ in: ["ISSUED", "ACCEPTED"] });
    // Changed for close-out stage C (flagged, stricter): the final certificate is payable too.
    expect([...PAYABLE_KINDS].sort()).toEqual(["ADVANCE_PAYMENT", "FINAL", "INTERIM_PAYMENT"]);
    expect(insightsWhere.awaitingPayment(ORG, none, [])).toMatchObject({ status: "ISSUED", financePayment: { is: null } });
  });
});
