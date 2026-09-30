import { describe, expect, it } from "vitest";

import { committeeCitationFault } from "./committee-step";
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
