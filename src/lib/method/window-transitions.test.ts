import { describe, expect, it } from "vitest";

import { EXERCISE_TRANSITIONS, transitionFault } from "./exercise";
import { findingText } from "./labels";

/**
 * 6.5 (§7.3.2, FR-ADV-001, 002, 016): approved for tendering → advertised or invited only by
 * publishing, with nothing blocking; advertised or invited → cancelled only by the approving step
 * of a cancellation on the window_change route, with a reason. The cancel act that ends a draft or
 * an exercise in preparation cannot end a published one.
 */

const today = "2026-10-01";
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("publishing opens the window", () => {
  it.each(["ADVERTISED", "INVITED"] as const)("approved for tendering → %s only by publishing, with nothing blocking", (to) => {
    expect(transitionFault("APPROVED_FOR_TENDERING", to, { today, via: "PUBLICATION", publishFaults: 0 })).toEqual([]);
    expect(codes(transitionFault("APPROVED_FOR_TENDERING", to, { today, publishFaults: 0 }))).toEqual(["NOT_BY_THIS_ACT"]);
    expect(codes(transitionFault("APPROVED_FOR_TENDERING", to, { today, via: "APPROVAL", publishFaults: 0 }))).toEqual(["NOT_BY_THIS_ACT"]);
    expect(codes(transitionFault("APPROVED_FOR_TENDERING", to, { today, via: "PUBLICATION", publishFaults: 3 }))).toEqual(["PUBLISH_NOT_READY"]);
    // Not judged is not ready.
    expect(codes(transitionFault("APPROVED_FOR_TENDERING", to, { today, via: "PUBLICATION" }))).toEqual(["PUBLISH_NOT_READY"]);
  });

  it("is never skipped to: not from preparation, not from with approval, not between the two paths", () => {
    expect(codes(transitionFault("DOCUMENTS_IN_PREPARATION", "ADVERTISED", { today, via: "PUBLICATION", publishFaults: 0 }))).toEqual(["NOT_ALLOWED"]);
    expect(codes(transitionFault("PENDING_APPROVAL_FOR_TENDERING", "INVITED", { today, via: "PUBLICATION", publishFaults: 0 }))).toEqual(["NOT_ALLOWED"]);
    expect(codes(transitionFault("ADVERTISED", "INVITED", { today, via: "PUBLICATION", publishFaults: 0 }))).toEqual(["NOT_ALLOWED"]);
    expect(codes(transitionFault("INVITED", "APPROVED_FOR_TENDERING", { today, via: "RETURN" }))).toEqual(["NOT_ALLOWED"]);
  });

  it("needs the organisation's day", () => {
    expect(codes(transitionFault("APPROVED_FOR_TENDERING", "ADVERTISED", { today: null, via: "PUBLICATION", publishFaults: 0 }))).toEqual(["TIME_ZONE_UNSET"]);
  });
});

describe("cancelling a published exercise (FR-ADV-016)", () => {
  it.each(["ADVERTISED", "INVITED"] as const)("%s → cancelled only through the window-change route, with a reason", (from) => {
    expect(EXERCISE_TRANSITIONS[from]).toEqual(["CANCELLED"]);
    expect(transitionFault(from, "CANCELLED", { today, via: "WINDOW_CANCELLATION", reason: "Scope withdrawn" })).toEqual([]);
    // The plain cancel act (a reason, no route) is refused: it names where cancelling is done.
    const plain = transitionFault(from, "CANCELLED", { today, reason: "Scope withdrawn" });
    expect(codes(plain)).toEqual(["NOT_BY_THIS_ACT"]);
    expect(findingText(plain[0])).toMatch(/Invitation tab/);
    expect(codes(transitionFault(from, "CANCELLED", { today, via: "WINDOW_CANCELLATION", reason: "  " }))).toEqual(["CANCEL_REASON_REQUIRED"]);
  });

  it("before publication the plain cancel act still ends the exercise (unchanged)", () => {
    expect(transitionFault("APPROVED_FOR_TENDERING", "CANCELLED", { today, reason: "Need withdrawn" })).toEqual([]);
  });

  it("each act's refusal has words", () => {
    for (const act of ["PUBLICATION", "WINDOW_CANCELLATION"]) expect(findingText({ code: "NOT_BY_THIS_ACT", level: "block", data: { act } })).not.toMatch(/route for tendering is rejected/);
    expect(findingText({ code: "PUBLISH_NOT_READY", level: "block" })).toMatch(/Invitation tab/);
  });
});
