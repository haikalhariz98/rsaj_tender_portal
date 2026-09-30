import { describe, expect, it } from "vitest";

import { TRANSITIONS, transitionFault } from "./status";

const today = "2026-09-30";

describe("the requisition state machine (§7.3.1)", () => {
  it.each([
    ["DRAFT", "ENDORSED"],
    ["DRAFT", "CANCELLED"],
    ["ENDORSED", "REGISTERED"],
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

  it("registers only with the finance system's numbers when they are required, and not at all while unset (OD-10)", () => {
    expect(transitionFault("ENDORSED", "REGISTERED", { today, erpReferenceRequired: null })).toMatchObject({ code: "ERP_POLICY_NOT_SET" });
    expect(transitionFault("ENDORSED", "REGISTERED", { today, erpReferenceRequired: true, erpRequisitionNo: "PROC1", erpNoteNo: null })).toEqual({ code: "ERP_REFS_REQUIRED", missing: ["erpNoteNo"] });
    expect(transitionFault("ENDORSED", "REGISTERED", { today, erpReferenceRequired: true, erpRequisitionNo: "PROC1", erpNoteNo: "NM1" })).toBeNull();
    expect(transitionFault("ENDORSED", "REGISTERED", { today, erpReferenceRequired: false })).toBeNull();
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
