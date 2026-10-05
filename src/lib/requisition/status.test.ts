import { describe, expect, it } from "vitest";

import { TRANSITIONS, transitionFault } from "./status";

const today = "2026-09-30";

describe("the requisition state machine (§7.3.1)", () => {
  it.each([
    ["DRAFT", "ENDORSED"],
    ["DRAFT", "CANCELLED"],
    ["ENDORSED", "BUDGET_CHECKED"],
    ["ENDORSED", "OVER_BUDGET"],
    ["ENDORSED", "RETURNED"],
    ["RETURNED", "DRAFT"],
    ["REGISTERED", "BUDGET_CHECKED"],
    ["BUDGET_CHECKED", "PENDING_APPROVAL"],
    ["BUDGET_CHECKED", "OVER_BUDGET"],
    ["OVER_BUDGET", "PENDING_APPROVAL"],
    ["OVER_BUDGET", "CANCELLED"],
    ["PENDING_APPROVAL", "APPROVED"],
    ["PENDING_APPROVAL", "REJECTED"],
    ["PENDING_APPROVAL", "RECALLED"],
    ["REJECTED", "DRAFT"],
    ["REJECTED", "CLOSED"],
    ["RECALLED", "DRAFT"],
    ["APPROVED", "SOURCING"],
    ["SOURCING", "FULFILLED"],
    ["SOURCING", "PARTIALLY_FULFILLED"],
    ["FULFILLED", "CLOSED"],
  ] as const)("allows %s to %s", (from, to) => {
    expect(TRANSITIONS[from]).toContain(to);
  });

  it("refuses Approved back to Draft, and anything out of a terminal state", () => {
    expect(transitionFault("APPROVED", "DRAFT", { today })).toMatchObject({ code: "NOT_ALLOWED" });
    expect(transitionFault("CANCELLED", "DRAFT", { today })).toMatchObject({ code: "NOT_ALLOWED" });
    expect(transitionFault("PENDING_APPROVAL", "CANCELLED", { today })).toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("leaves Draft only complete and fully endorsed; unset tiers block", () => {
    expect(transitionFault("DRAFT", "ENDORSED", { today, fieldFaults: 2, endorsementFaults: 0, tiersSet: true })).toMatchObject({ code: "FIELDS_INCOMPLETE" });
    expect(transitionFault("DRAFT", "ENDORSED", { today, fieldFaults: 0, tiersSet: false })).toMatchObject({ code: "ENDORSEMENT_TIERS_NOT_SET" });
    expect(transitionFault("DRAFT", "ENDORSED", { today, fieldFaults: 0, endorsementFaults: 1, tiersSet: true })).toMatchObject({ code: "ENDORSEMENTS_INCOMPLETE" });
    expect(transitionFault("DRAFT", "ENDORSED", { today, fieldFaults: 0, endorsementFaults: 0, tiersSet: true })).toBeNull();
  });

  // Founder, 2026-10-05: the finance-system numbers were removed (the OD-10 setting and its act),
  // and then the Register step itself, which only stood for that registration. What stays
  // pinned: an endorsed requisition is budget-checked directly, and none is newly registered;
  // one registered before still goes on to its budget check.
  it("checks an endorsed requisition's budget directly; nothing is newly registered", () => {
    expect(transitionFault("ENDORSED", "BUDGET_CHECKED", { today })).toBeNull();
    expect(transitionFault("ENDORSED", "REGISTERED", { today })).toMatchObject({ code: "NOT_ALLOWED" });
    expect(transitionFault("REGISTERED", "BUDGET_CHECKED", { today })).toBeNull();
  });

  it("returns only with a reason, a recipient and a date not in the future (FR-REQ-010)", () => {
    expect(transitionFault("ENDORSED", "RETURNED", { today, reason: "", returnedToPersonId: null, returnedOn: null })).toEqual({ code: "RETURN_DETAILS_REQUIRED", missing: ["reason", "recipient", "date"] });
    expect(transitionFault("ENDORSED", "RETURNED", { today, reason: "No estimate", returnedToPersonId: "p1", returnedOn: "2026-10-01" })).toEqual({ code: "FUTURE_DATE" });
    expect(transitionFault("ENDORSED", "RETURNED", { today, reason: "No estimate", returnedToPersonId: "p1", returnedOn: today })).toBeNull();
  });

  it("recalls only before the first decision (FR-APR-017)", () => {
    expect(transitionFault("PENDING_APPROVAL", "RECALLED", { today, anyStepDone: true })).toEqual({ code: "STEP_ALREADY_DECIDED" });
    expect(transitionFault("PENDING_APPROVAL", "RECALLED", { today, anyStepDone: false })).toBeNull();
  });

  it("cancels only with a reason", () => {
    expect(transitionFault("DRAFT", "CANCELLED", { today, reason: " " })).toEqual({ code: "REASON_REQUIRED" });
  });

  it("refuses date-sensitive acts while the organisation's time zone is unset", () => {
    expect(transitionFault("DRAFT", "ENDORSED", { today: null, fieldFaults: 0, endorsementFaults: 0, tiersSet: true })).toEqual({ code: "TIME_ZONE_UNSET" });
    expect(transitionFault("PENDING_APPROVAL", "APPROVED", { today: null })).toEqual({ code: "TIME_ZONE_UNSET" });
  });
});

describe("the close-out edges (ruling C1, FR-APR-016, FR-REQ-012)", () => {
  it("refuses Rejected back to Pending approval without a successor route", () => {
    expect(transitionFault("REJECTED", "PENDING_APPROVAL", { today })).toEqual({ code: "SUCCESSOR_REQUIRED" });
    expect(transitionFault("REJECTED", "PENDING_APPROVAL", { today, successor: false })).toEqual({ code: "SUCCESSOR_REQUIRED" });
    expect(transitionFault("REJECTED", "PENDING_APPROVAL", { today, successor: true })).toBeNull();
  });

  it("never moves Pending approval straight to Draft or Closed: a rejection lands on Rejected first", () => {
    expect(transitionFault("PENDING_APPROVAL", "DRAFT", { today })).toMatchObject({ code: "NOT_ALLOWED" });
    expect(transitionFault("PENDING_APPROVAL", "CLOSED", { today, reason: "x" })).toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("closes an approved requisition only when a gate ended it, and with a reason", () => {
    expect(transitionFault("APPROVED", "CLOSED", { today, reason: "Not required" })).toEqual({ code: "GATE_NOT_ENDED" });
    expect(transitionFault("APPROVED", "CLOSED", { today, gateEnded: true, reason: " " })).toEqual({ code: "REASON_REQUIRED" });
    expect(transitionFault("APPROVED", "CLOSED", { today, gateEnded: true, reason: "Not required" })).toBeNull();
  });

  it("closes a rejected requisition only with a reason", () => {
    expect(transitionFault("REJECTED", "CLOSED", { today })).toEqual({ code: "REASON_REQUIRED" });
    expect(transitionFault("REJECTED", "CLOSED", { today, reason: "Terminated" })).toBeNull();
  });
});

describe("no edits while a successor route is open (ruling C3)", () => {
  it("refuses while a route continuing a rejected one is pending, and not otherwise", async () => {
    const { successorOpenFault } = await import("./status");
    expect(successorOpenFault([{ status: "PENDING", supersedesInstanceId: "r1" }, { status: "REJECTED", supersedesInstanceId: null }])).toBe("SUCCESSOR_OPEN");
    expect(successorOpenFault([{ status: "PENDING", supersedesInstanceId: null }])).toBeNull();
    expect(successorOpenFault([{ status: "APPROVED", supersedesInstanceId: "r1" }])).toBeNull();
  });
});
