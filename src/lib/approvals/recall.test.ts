import { describe, expect, it } from "vitest";

import { recallFault, RECALL_FAULT_TEXT, type RecallFacts } from "./recall";

const open: RecallFacts = {
  routeStatus: "PENDING",
  steps: [{ decision: "PENDING" }, { decision: "PENDING" }],
  tabledAwaitingDecision: 0,
  committeeDecided: 0,
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

  it("refuses once the committee has decided the matter, though no step cites the decision yet (a vote can be recorded while an earlier step is pending)", () => {
    expect(recallFault({ ...open, committeeDecided: 1 })).toBe("COMMITTEE_DECIDED");
    expect(RECALL_FAULT_TEXT.COMMITTEE_DECIDED).toMatch(/committee has already decided/);
    // It is said before who is asking: nobody may pull back a matter the committee has decided.
    expect(recallFault({ ...open, committeeDecided: 1, actorPersonId: "somebody-else" })).toBe("COMMITTEE_DECIDED");
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

describe("the requisition records who sent it, so a clerk who keyed it for a requester without an account can recall it", () => {
  it("submitRequisition attributes the sender as the signed-in officer's own act and stores it on the route", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/requisitions/actions.ts", "utf8");
    const body = src.slice(src.indexOf("export async function submitRequisition"), src.indexOf("export async function checkCommitteeGates"));
    expect(body).toMatch(/beginAct\(actor, data, "ApprovalInstance\.submittedBy", \{ personField: "personId", onBehalf: false \}\)/);
    expect(body).toMatch(/submittedByPersonId: act\.subjectPersonId/);
    expect(body).toMatch(/await act\.write\(tx, instance\.id\)/);
  });
});
