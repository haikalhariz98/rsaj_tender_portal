import { describe, expect, it } from "vitest";

import { commitmentFault } from "./commitment";

const steps = [
  { sequence: 1, roleLabel: "Head of Department", decision: "DONE" as const },
  { sequence: 2, roleLabel: "Head of Division", decision: "PENDING" as const },
];

describe("no commitment before approval (FR-REQ-016)", () => {
  it("names the outstanding step", () => {
    expect(commitmentFault({ status: "PENDING_APPROVAL" }, { status: "PENDING", steps })).toEqual({ code: "NOT_APPROVED", outstanding: "Head of Division" });
  });

  it("allows a commitment once the route is approved", () => {
    expect(commitmentFault({ status: "APPROVED" }, { status: "APPROVED", steps: steps.map((s) => ({ ...s, decision: "DONE" as const })) })).toBeNull();
  });

  it("refuses a requisition that was never routed", () => {
    expect(commitmentFault({ status: "REGISTERED" }, null)).toEqual({ code: "NO_APPROVAL_ROUTE" });
  });
});
