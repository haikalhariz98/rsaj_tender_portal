import { describe, expect, it } from "vitest";

import { cancelFaults } from "./change";
import { windowFindingText } from "./labels";

/**
 * 6.7 C-9 (flagged against accepted 6.5, new tests): cancelling after the opening. An Opened exercise
 * may be cancelled through its window_change route, with the reason and the refund answer (the exit
 * for an empty box, or every bid not carried); one whose opening is in progress only once that
 * opening is adjourned. A live award still stands in the way (BD-29).
 */

const base = { reason: "Every bid was not carried", feeRefund: false, changePending: false, awardStands: null, today: "2026-11-20" };
const codes = (x: Partial<Parameters<typeof cancelFaults>[0]> & { status: Parameters<typeof cancelFaults>[0]["status"] }) => cancelFaults({ ...base, ...x }).map((f) => f.code);

describe("cancelling once the bids are opened (C-9)", () => {
  it("Opened: asked through the route as any published exercise", () => expect(codes({ status: "OPENED" })).toEqual([]));
  it("opening in progress: refused until adjourned, then asked", () => {
    expect(codes({ status: "OPENING_IN_PROGRESS" })).toEqual(["OPENING_NOT_ADJOURNED"]);
    expect(codes({ status: "OPENING_IN_PROGRESS", openingAdjourned: false })).toEqual(["OPENING_NOT_ADJOURNED"]);
    expect(codes({ status: "OPENING_IN_PROGRESS", openingAdjourned: true })).toEqual([]);
    expect(windowFindingText({ code: "OPENING_NOT_ADJOURNED", level: "block" })).toMatch(/Adjourn the opening first/);
  });
  it("still needs the reason, the refund answer, and no live award (BD-29)", () => {
    expect(codes({ status: "OPENED", reason: " ", feeRefund: null, awardStands: "AW/1" })).toEqual(["REASON_REQUIRED", "REFUND_NOT_ANSWERED", "AWARD_STANDS"]);
  });
});
