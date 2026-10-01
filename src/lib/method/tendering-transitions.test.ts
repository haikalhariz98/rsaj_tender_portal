import { describe, expect, it } from "vitest";

import { EXERCISE_TRANSITIONS, transitionFault } from "./exercise";
import { findingText } from "./labels";

/**
 * Plan 6.4 test 10 (§7.3.2, Q-3): Documents in preparation → Pending approval for
 * tendering only by submitting; Pending → Approved only by the approving step, with the
 * dates; Pending → Documents in preparation only by a rejection (returned for amendment);
 * Cancelled from all three. And `documentPackKind` unset blocks the move into preparation.
 */

const today = "2026-10-01";
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const prep = { today, methodSet: true, typeSet: true, basisSet: true, proposalRequired: false, ambiguousTaxonomies: 0, blockingFaults: 0 };

describe("into preparation needs the method's document pack (6.4)", () => {
  it("unset, or not given, blocks naming the setting", () => {
    expect(codes(transitionFault("DRAFT", "DOCUMENTS_IN_PREPARATION", prep))).toEqual(["DOCUMENTS_RULE_NOT_SET"]);
    expect(codes(transitionFault("DRAFT", "DOCUMENTS_IN_PREPARATION", { ...prep, packKind: null }))).toEqual(["DOCUMENTS_RULE_NOT_SET"]);
    expect(findingText({ code: "DOCUMENTS_RULE_NOT_SET", level: "block" })).toMatch(/Sourcing methods/);
  });
  it.each(["TENDER", "QUOTATION", "NONE"] as const)("%s, set, lets it move", (packKind) => {
    expect(transitionFault("DRAFT", "DOCUMENTS_IN_PREPARATION", { ...prep, packKind })).toEqual([]);
  });
});

describe("the tendering moves, each by one act", () => {
  it("submission: only by submitting, and only with nothing blocking the pack", () => {
    expect(transitionFault("DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", { today, via: "SUBMISSION", packFaults: 0 })).toEqual([]);
    expect(codes(transitionFault("DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", { today, packFaults: 0 }))).toEqual(["NOT_BY_THIS_ACT"]);
    expect(codes(transitionFault("DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", { today, via: "APPROVAL", packFaults: 0 }))).toEqual(["NOT_BY_THIS_ACT"]);
    expect(codes(transitionFault("DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", { today, via: "SUBMISSION", packFaults: 2 }))).toEqual(["PACK_NOT_READY"]);
    // Not judged is not ready.
    expect(codes(transitionFault("DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", { today, via: "SUBMISSION" }))).toEqual(["PACK_NOT_READY"]);
  });

  it("approval: only by the approving step, and only with the dates", () => {
    expect(transitionFault("PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", { today, via: "APPROVAL", datesSet: true })).toEqual([]);
    expect(codes(transitionFault("PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", { today, via: "APPROVAL", datesSet: false }))).toEqual(["DATES_REQUIRED"]);
    expect(codes(transitionFault("PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING", { today, via: "SUBMISSION", datesSet: true }))).toEqual(["NOT_BY_THIS_ACT"]);
  });

  it("return for amendment: only by a rejection", () => {
    expect(transitionFault("PENDING_APPROVAL_FOR_TENDERING", "DOCUMENTS_IN_PREPARATION", { today, via: "RETURN" })).toEqual([]);
    expect(codes(transitionFault("PENDING_APPROVAL_FOR_TENDERING", "DOCUMENTS_IN_PREPARATION", { today }))).toEqual(["NOT_BY_THIS_ACT"]);
  });

  it("cancellation from all three, with a reason", () => {
    for (const from of ["DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "APPROVED_FOR_TENDERING"] as const) {
      expect(transitionFault(from, "CANCELLED", { today, reason: "Need withdrawn" })).toEqual([]);
      expect(codes(transitionFault(from, "CANCELLED", { today, reason: " " }))).toEqual(["CANCEL_REASON_REQUIRED"]);
    }
  });

  it("nothing else: no way back from approved, no skipping approval, cancelled is terminal", () => {
    expect(codes(transitionFault("APPROVED_FOR_TENDERING", "DOCUMENTS_IN_PREPARATION", { today, via: "RETURN" }))).toEqual(["NOT_ALLOWED"]);
    expect(codes(transitionFault("DOCUMENTS_IN_PREPARATION", "APPROVED_FOR_TENDERING", { today, via: "APPROVAL", datesSet: true }))).toEqual(["NOT_ALLOWED"]);
    expect(codes(transitionFault("DRAFT", "PENDING_APPROVAL_FOR_TENDERING", { today, via: "SUBMISSION", packFaults: 0 }))).toEqual(["NOT_ALLOWED"]);
    expect(codes(transitionFault("CANCELLED", "DOCUMENTS_IN_PREPARATION", { today, via: "RETURN" }))).toEqual(["TERMINAL"]);
    expect(EXERCISE_TRANSITIONS.APPROVED_FOR_TENDERING).toEqual(["CANCELLED"]);
  });
});
