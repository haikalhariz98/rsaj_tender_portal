import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { sourcingPhases, type SourcingFlowInput } from "./flow";
import type { FlowRoute } from "./lifecycle";
import { TENDERING_APPROVAL_DOMAIN } from "./types";

const submitted: FlowRoute = { id: "r1", domain: TENDERING_APPROVAL_DOMAIN, status: "APPROVED", openedAt: dayToDate("2026-09-18"), steps: [{ roleLabel: "Head of department", decision: "DONE" }] };
const base = (over: Partial<SourcingFlowInput> = {}): SourcingFlowInput => ({
  status: "DRAFT",
  packKind: "QUOTATION",
  path: "ADVERTISED",
  windowPhase: null,
  routes: [],
  awards: [],
  on: {},
  requisition: { status: "APPROVED", reference: "PR-0001", statusLabel: "Approved" },
  ...over,
});
const view = (i: SourcingFlowInput) => sourcingPhases(i).map((s) => `${s.label}:${s.state}`);

describe("the five phases fold the twelve steps (SP-14)", () => {
  it("a new draft: Prepare is current at step 4 of 12, the rest wait", () => {
    expect(view(base())).toEqual(["Prepare:current", "Publish:waiting", "Bids:waiting", "Evaluate:waiting", "Award:waiting"]);
    expect(sourcingPhases(base())[0]).toMatchObject({ owner: "Secretariat", sub: "Step 4 of 12: Scope and estimate" });
    expect(sourcingPhases(base())[1].sub).toBeUndefined();
  });
  it("approval for tendering is the Publish phase", () => {
    expect(view(base({ status: "PENDING_APPROVAL_FOR_TENDERING", routes: [{ ...submitted, status: "PENDING" }] }))[1]).toBe("Publish:current");
    expect(sourcingPhases(base({ status: "APPROVED_FOR_TENDERING" }))[1].sub).toBe("Step 7 of 12: Published");
  });
  it("published and open: Publish is done and Bids is current", () => {
    expect(view(base({ status: "ADVERTISED", windowPhase: "OPEN_FOR_PURCHASE" }))).toEqual(["Prepare:done", "Publish:done", "Bids:current", "Evaluate:waiting", "Award:waiting"]);
  });
  it("opened: the schedule of tenders follows, and Evaluate is in hand", () => {
    expect(view(base({ status: "OPENED", windowPhase: "CLOSED" }))).toEqual(["Prepare:done", "Publish:done", "Bids:done", "Evaluate:current", "Award:waiting"]);
    expect(sourcingPhases(base({ status: "OPENED", windowPhase: "CLOSED" }))[3].owner).toBe("Evaluation committee");
  });
  it("an award that stands ends it", () => {
    expect(view(base({ status: "EVALUATED", windowPhase: "CLOSED", awards: [{ status: "APPROVED", reference: "A-1" }] })).at(-1)).toBe("Award:done");
  });
  it("a requisition not yet approved keeps Prepare current", () => {
    const p = sourcingPhases(base({ requisition: { status: "PENDING_APPROVAL", reference: "PR-2", statusLabel: "Pending approval" } }));
    expect(p[0]).toMatchObject({ state: "current", sub: "Step 2 of 12: Requisition approved" });
  });
  it("a method with no pack has no Publish, Bids or Evaluate phase", () => {
    expect(view(base({ status: "DOCUMENTS_IN_PREPARATION", packKind: "NONE", on: { prepared: "12 Sep 2026" } }))).toEqual(["Prepare:current", "Award:waiting"]);
  });
  it("an owner configured for a phase replaces the default", () => {
    expect(sourcingPhases(base(), { PREPARE: "Procurement unit" })[0].owner).toBe("Procurement unit");
  });
  it("a cancelled exercise keeps the phases its records prove, then Cancelled", () => {
    expect(view(base({ status: "CANCELLED", on: { prepared: "x" }, routes: [submitted] }))).toEqual(["Prepare:done", "Cancelled:rejected"]);
    // Approved for tendering, never published: Publish is only part proven, so it is not done.
    expect(view(base({ status: "CANCELLED", routes: [submitted], on: { prepared: "x", approvedForTendering: "x" } }))).toEqual(["Prepare:done", "Publish:waiting", "Cancelled:rejected"]);
    expect(view(base({ status: "CANCELLED", routes: [submitted], on: { prepared: "x", approvedForTendering: "x", published: "x", opened: "x" } }))).toEqual(["Prepare:done", "Publish:done", "Bids:done", "Cancelled:rejected"]);
    expect(view(base({ status: "CANCELLED" }))).toEqual(["Prepare:waiting", "Cancelled:rejected"]);
  });
});
