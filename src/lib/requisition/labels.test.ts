import { describe, expect, it } from "vitest";

import { approvalRouteLabel, RETURNED_AT_APPROVAL_LABEL, returnedAtApproval, trailRouteStatusLabel, undecidedStepText } from "./labels";

describe("an approval route's status label (BD-24 display ruling)", () => {
  const returned = [{ code: "SPLIT_NOT_SET", level: "warn" }, { code: "RETURNED_AT_APPROVAL", level: "err" }];
  it("reads a route closed by a budget return as returned at approval, never bare Recalled", () => {
    expect(approvalRouteLabel("RECALLED", returned)).toBe("Returned at approval (budget)");
    expect(approvalRouteLabel("RECALLED", returned)).not.toBe("Recalled");
    expect(RETURNED_AT_APPROVAL_LABEL).toBe("Returned at approval (budget)");
  });
  it("reads an officer's recall as Recalled", () => {
    expect(approvalRouteLabel("RECALLED", [])).toBe("Recalled");
    expect(approvalRouteLabel("RECALLED", null)).toBe("Recalled");
    expect(approvalRouteLabel("RECALLED", [{ code: "GOV_OVERRIDE" }])).toBe("Recalled");
  });
  it("leaves the other statuses alone, whatever the warnings", () => {
    expect(approvalRouteLabel("APPROVED", returned)).toBe("Approved");
    expect(approvalRouteLabel("PENDING", [])).toBe("In progress");
    expect(approvalRouteLabel("REJECTED", [])).toBe("Rejected");
  });
  it("tolerates warnings that are not a list", () => {
    expect(returnedAtApproval("RETURNED_AT_APPROVAL")).toBe(false);
    expect(returnedAtApproval({ code: "RETURNED_AT_APPROVAL" })).toBe(false);
    expect(returnedAtApproval([null, 3])).toBe(false);
  });
});

describe("an approval route's status on the History tab (BD-24 display ruling)", () => {
  it("reads the trail entry of a budget return as returned at approval", () => {
    const changes = [{ field: "status", after: "RECALLED" }, { field: "returnedAtApproval", after: "yes" }];
    expect(trailRouteStatusLabel("RECALLED", changes)).toBe("Returned at approval (budget)");
  });
  it("reads an officer's recall, and the status before it, as they were", () => {
    expect(trailRouteStatusLabel("RECALLED", [{ field: "status", after: "RECALLED" }])).toBe("Recalled");
    expect(trailRouteStatusLabel("PENDING", [{ field: "returnedAtApproval", after: "yes" }])).toBe("In progress");
  });
});

describe("an undecided step, by its route's state (6.1 acceptance item)", () => {
  it("awaits a decision only while the route is open", () => {
    expect(undecidedStepText({ status: "PENDING", warnings: [] }, false)).toBe("Awaiting a decision.");
    expect(undecidedStepText({ status: "PENDING", warnings: [] }, true)).toBe("Awaiting the committee's decision on a tabled matter.");
  });
  it("says why a closed route left it undecided, never awaiting", () => {
    expect(undecidedStepText({ status: "RECALLED", warnings: [{ code: "RETURNED_AT_APPROVAL" }] }, false)).toBe("Not decided — route returned at approval");
    expect(undecidedStepText({ status: "RECALLED", warnings: [] }, true)).toBe("Not decided — route recalled");
    expect(undecidedStepText({ status: "REJECTED", warnings: [] }, false)).toBe("Not decided — route rejected at an earlier step");
    for (const status of ["RECALLED", "REJECTED", "APPROVED"]) {
      expect(undecidedStepText({ status, warnings: [] }, false)).not.toMatch(/Awaiting/);
    }
  });
});
