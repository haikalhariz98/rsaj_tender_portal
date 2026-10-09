import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { sourcingFlow, type SourcingFlowInput } from "./flow";
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
const view = (i: SourcingFlowInput) => sourcingFlow(i).map((s) => `${s.label}:${s.state}`);

const ALL = ["Requisition raised", "Requisition approved", "Exercise drafted", "Scope and estimate", "Tender documents", "Approval for tendering", "Published", "Bids received", "Opening", "Jadual Tawaran", "Evaluation", "Award"];
const at = (current: number, labels = ALL) => labels.map((l, i) => `${l}:${i < current ? "done" : i === current ? "current" : "waiting"}`);

// Ruling 7 (GAP-F1, Sourcing Requirements v2 section 3): twelve steps, each derived from recorded state.
describe("the Overview flow follows section 3 of Sourcing Requirements v2", () => {
  it("a new draft: the requisition is raised and approved, the draft exists, scope and estimate is in hand", () => {
    expect(view(base())).toEqual(at(3));
  });
  it("tender documents in hand after the move into preparation", () => {
    expect(view(base({ status: "DOCUMENTS_IN_PREPARATION", routes: [] }))).toEqual(at(4));
  });
  it("approval for tendering in hand once the documents are submitted", () => {
    expect(view(base({ status: "PENDING_APPROVAL_FOR_TENDERING", routes: [{ ...submitted, status: "PENDING" }] }))).toEqual(at(5));
  });
  it("approved but not published: Published is the step in hand", () => {
    expect(view(base({ status: "APPROVED_FOR_TENDERING" }))).toEqual(at(6));
  });
  it("published and the window open: the bids are the step in hand, and Published is done", () => {
    expect(view(base({ status: "ADVERTISED", windowPhase: "OPEN_FOR_PURCHASE" }))).toEqual(at(7));
  });
  it("the window closed: the opening is next", () => {
    expect(view(base({ status: "ADVERTISED", windowPhase: "CLOSED" }))).toEqual(at(8));
  });
  it("the opening under way, then finalised: the Jadual Tawaran follows the opening and claims nothing before it", () => {
    expect(view(base({ status: "OPENING_IN_PROGRESS", windowPhase: "CLOSED" }))).toEqual(at(8));
    const opened = sourcingFlow(base({ status: "OPENED", windowPhase: "CLOSED" }));
    expect(opened.find((s) => s.key === "JADUAL")).toEqual({ key: "JADUAL", label: "Jadual Tawaran", sub: "Follows the opening", state: "done" });
    expect(view(base({ status: "OPENED", windowPhase: "CLOSED" }))).toEqual(at(10));
  });
  it("an invited exercise says it was invited in the Published step", () => {
    const steps = sourcingFlow(base({ status: "INVITED", path: "INVITED", windowPhase: "OPEN_FOR_PURCHASE", on: { published: "24 Sep 2026" } }));
    expect(steps.find((s) => s.key === "PUBLISHED")?.sub).toBe("Invited 24 Sep 2026");
  });
  it("names the requisition, and says what it is when it is not approved yet (never done)", () => {
    expect(sourcingFlow(base())[0]).toMatchObject({ sub: "PR-0001", state: "done" });
    const pending = sourcingFlow(base({ requisition: { status: "PENDING_APPROVAL", reference: "PR-0002", statusLabel: "Pending approval" } }));
    expect(pending[1]).toEqual({ key: "PR_APPROVED", label: "Requisition approved", sub: "Pending approval", state: "current" });
    expect(pending.filter((s) => s.state === "current")).toHaveLength(1);
  });
  it("an exercise past its draft is never shown with an unapproved requisition", () => {
    expect(sourcingFlow(base({ status: "DOCUMENTS_IN_PREPARATION", requisition: { status: "CLOSED", reference: "PR-0003", statusLabel: "Closed" } }))[1].state).toBe("done");
  });
  it("a method with no pack: the requisition, the draft, scope and estimate, the documents, then the award", () => {
    expect(view(base({ status: "DOCUMENTS_IN_PREPARATION", packKind: "NONE", on: { prepared: "12 Sep 2026" } }))).toEqual([
      "Requisition raised:done", "Requisition approved:done", "Exercise drafted:done", "Scope and estimate:done", "Tender documents:current", "Award:waiting",
    ]);
  });
  it("a draft whose method does not say which documents it needs keeps saying so", () => {
    const steps = sourcingFlow(base({ packKind: null }));
    expect(steps.find((s) => s.key === "DOCUMENTS")?.sub).toBe("Which documents: not set for the method");
  });
  it("a cancelled exercise shows only what its records prove, then Cancelled", () => {
    expect(view(base({ status: "CANCELLED", on: { prepared: "12 Sep 2026" }, routes: [submitted] }))).toEqual([
      "Requisition raised:done", "Requisition approved:done", "Exercise drafted:done", "Scope and estimate:done", "Tender documents:done", "Cancelled:rejected",
    ]);
    // Published, but never opened: the window is not claimed as received.
    const published = view(base({ status: "CANCELLED", routes: [submitted], on: { prepared: "x", approvedForTendering: "x", published: "x" } }));
    expect(published).toContain("Published:done");
    expect(published).not.toContain("Bids received:done");
    // Opened, then cancelled: the window and the opening stand.
    const opened = view(base({ status: "CANCELLED", routes: [submitted], on: { prepared: "x", approvedForTendering: "x", published: "x", opened: "x" } }));
    expect(opened).toEqual(expect.arrayContaining(["Bids received:done", "Opening:done", "Jadual Tawaran:done"]));
  });
  it("an award that stands ends the flow", () => {
    const steps = sourcingFlow(base({ status: "EVALUATED", windowPhase: "CLOSED", awards: [{ status: "APPROVED", reference: "A-1" }] }));
    expect(steps.at(-1)).toMatchObject({ label: "Award", state: "done" });
  });
});
