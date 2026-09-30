import { describe, expect, it } from "vitest";

import { committeeCitationFault, returnedRouteCitationNotes } from "./committee-step";
import { resolveMatterRef } from "./matter-link";

describe("linking a committee matter to its requisition (ruling BD-18)", () => {
  it("links exactly one open requisition", () => {
    expect(resolveMatterRef([{ id: "r1", status: "PENDING_APPROVAL" }])).toEqual({ ok: true, requisitionId: "r1" });
  });

  it("refuses two matches as ambiguous, and none as not found", () => {
    expect(resolveMatterRef([{ id: "r1", status: "APPROVED" }, { id: "r2", status: "DRAFT" }])).toEqual({ ok: false, fault: "AMBIGUOUS" });
    expect(resolveMatterRef([])).toEqual({ ok: false, fault: "NOT_FOUND" });
  });

  it("refuses a cancelled or closed requisition", () => {
    expect(resolveMatterRef([{ id: "r1", status: "CANCELLED" }])).toEqual({ ok: false, fault: "CLOSED" });
    expect(resolveMatterRef([{ id: "r1", status: "CLOSED" }])).toEqual({ ok: false, fault: "CLOSED" });
  });
});

describe("which committee decision may discharge a step (code review, item 1)", () => {
  const req = { id: "r1", estimatedValue: "62000.00" };
  const step = { committeeCode: "BOARD", act: "A" };
  const matter = { id: "d1", requisitionId: "r1", matterKind: "REQUISITION", domain: "requisition", act: "A", amount: "62000", committeeCode: "BOARD" };

  it("accepts the matter tabled for this requisition, act and value", () => {
    expect(committeeCitationFault(matter, step, req, [])).toBeNull();
    expect(committeeCitationFault({ ...matter, amount: null }, step, req, [])).toBeNull();
  });

  it("refuses another requisition's matter, another kind, committee, act or amount", () => {
    expect(committeeCitationFault({ ...matter, requisitionId: "r2" }, step, req, [])).toBe("NOT_THIS_REQUISITION");
    expect(committeeCitationFault({ ...matter, domain: "appointment" }, step, req, [])).toBe("NOT_A_REQUISITION_MATTER");
    expect(committeeCitationFault({ ...matter, committeeCode: "TENDER_BOARD" }, step, req, [])).toBe("OTHER_COMMITTEE");
    expect(committeeCitationFault({ ...matter, act: "R" }, step, req, [])).toBe("OTHER_ACT");
    expect(committeeCitationFault({ ...matter, amount: "60000" }, step, req, [])).toBe("OTHER_AMOUNT");
  });

  it("lets one decision discharge one step only", () => {
    expect(committeeCitationFault(matter, step, req, ["d1"])).toBe("ALREADY_CITED");
  });
});

describe("citation: the checks the code re-review asked to see alone (round 3)", () => {
  const matter = { id: "d1", requisitionId: "r1", matterKind: "REQUISITION", domain: "requisition", act: "A", amount: "62000.00", committeeCode: "BOARD" };
  const step = { committeeCode: "BOARD", act: "A" };
  const req = { id: "r1", estimatedValue: "62000.00" };

  it("refuses a matter whose kind alone differs", () => {
    expect(committeeCitationFault({ ...matter, matterKind: "EXERCISE" }, step, req, [])).toBe("NOT_A_REQUISITION_MATTER");
    expect(committeeCitationFault({ ...matter, matterKind: null }, step, req, [])).toBe("NOT_A_REQUISITION_MATTER");
  });

  it("compares the amount exactly, in sen, not as floats", () => {
    // One sen apart, and equal as doubles: Number() would call these the same amount.
    const big = { ...req, estimatedValue: "90071992547409.93" };
    expect(Number("90071992547409.93")).toBe(Number("90071992547409.94"));
    expect(committeeCitationFault({ ...matter, amount: "90071992547409.94" }, step, big, [])).toBe("OTHER_AMOUNT");
    expect(committeeCitationFault({ ...matter, amount: "90071992547409.93" }, step, big, [])).toBeNull();
    expect(committeeCitationFault({ ...matter, amount: "62,000" }, step, req, [])).toBeNull();
  });
});

describe("a decision cited on a route returned at approval (ruling R2)", () => {
  const matter = { id: "d1", requisitionId: "r1", matterKind: "REQUISITION", domain: "requisition", act: "A", amount: null, committeeCode: "BOARD" };
  const step = { committeeCode: "BOARD", act: "A" };
  const req = { id: "r1", estimatedValue: "62000.00" };

  it("is not re-citable on the resubmitted route", () => {
    expect(committeeCitationFault(matter, step, req, ["d1"], ["d1"])).toBe("CITED_ON_RETURNED_ROUTE");
    expect(committeeCitationFault(matter, step, req, [], ["d2"])).toBeNull();
  });

  it("says so beside the returned route, from the step's snapshot", () => {
    const d = new Date("2026-08-20T00:00:00.000Z");
    const steps = [
      { committeeDecisionId: null, decidedByName: "A. Rahman", roleLabel: "Head of Department", decidedOn: d },
      { committeeDecisionId: "d1", decidedByName: "Board of Directors", roleLabel: "Board", decidedOn: d },
    ];
    expect(returnedRouteCitationNotes({ returnedAtApproval: true, steps })).toEqual([
      "The Board of Directors's decision of 20 Aug 2026 was cited on the returned route and cannot discharge this one; table the matter again.",
    ]);
    expect(returnedRouteCitationNotes({ returnedAtApproval: false, steps })).toEqual([]);
  });
});
