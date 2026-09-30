import { describe, expect, it } from "vitest";

import { approvalRouteLabel, RETURNED_AT_APPROVAL_LABEL, returnedAtApproval, trailRouteStatusLabel } from "./labels";

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
