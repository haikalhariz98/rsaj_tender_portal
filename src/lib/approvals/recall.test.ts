import { describe, expect, it } from "vitest";

import { recallFault, RECALL_FAULT_TEXT, type RecallFacts } from "./recall";

const open: RecallFacts = {
  routeStatus: "PENDING",
  steps: [{ decision: "PENDING" }, { decision: "PENDING" }],
  tabledAwaitingDecision: 0,
  originatorIds: ["sender"],
  actorPersonId: "sender",
  reason: "Sent in error",
};

describe("recall by the originator, before the first decision (FR-APR-017)", () => {
  it("lets the originator recall an open route nobody has decided", () => {
    expect(recallFault(open)).toBeNull();
  });

  it("refuses anyone who is not the originator, and says only the sender or the raiser can", () => {
    expect(recallFault({ ...open, actorPersonId: "somebody-else" })).toBe("NOT_THE_ORIGINATOR");
    expect(RECALL_FAULT_TEXT.NOT_THE_ORIGINATOR).toMatch(/Only the person who sent/);
  });

  it("refuses once any step has been decided: recall after a decision is refused", () => {
    expect(recallFault({ ...open, steps: [{ decision: "DONE" }, { decision: "PENDING" }] })).toBe("DECISION_RECORDED");
    expect(recallFault({ ...open, steps: [{ decision: "REJECTED" }] })).toBe("DECISION_RECORDED");
  });

  it("refuses while the matter is on a committee's agenda awaiting its vote", () => {
    expect(recallFault({ ...open, tabledAwaitingDecision: 1 })).toBe("ON_COMMITTEE_AGENDA");
  });

  it("refuses a route sent before its sender was recorded: no one is shown to be its originator", () => {
    expect(recallFault({ ...open, originatorIds: [] })).toBe("ORIGINATOR_NOT_RECORDED");
    expect(RECALL_FAULT_TEXT.ORIGINATOR_NOT_RECORDED).toMatch(/Nobody is recorded as having sent/);
  });

  it("refuses a route that is already closed, recalled or decided", () => {
    for (const routeStatus of ["APPROVED", "REJECTED", "RECALLED"]) expect(recallFault({ ...open, routeStatus })).toBe("ROUTE_NOT_OPEN");
  });

  it("asks for a reason, and a blank one is not a reason", () => {
    expect(recallFault({ ...open, reason: "" })).toBe("REASON_REQUIRED");
    expect(recallFault({ ...open, reason: "   " })).toBe("REASON_REQUIRED");
  });

  it("lets either of two recorded originators recall (the sender, or the officer who raised the request)", () => {
    expect(recallFault({ ...open, originatorIds: ["sender", "raiser"], actorPersonId: "raiser" })).toBeNull();
  });
});
