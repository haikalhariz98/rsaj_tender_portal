import { describe, expect, it } from "vitest";

import { cancelFaults } from "./change";

/**
 * 6.8 E-10 (flagged, against accepted 6.5; new test): an exercise under evaluation, or evaluated, is
 * cancelled by the same window-change route as before; an award standing still holds it back.
 */
describe("cancelling an exercise in evaluation", () => {
  const base = { reason: "Scope withdrawn", feeRefund: true, changePending: false, awardStands: null, today: "2026-11-30", openingAdjourned: false, openingInProgress: false };
  it.each(["UNDER_EVALUATION", "EVALUATED"] as const)("%s: nothing blocks", (status) => {
    expect(cancelFaults({ ...base, status })).toEqual([]);
  });
  it("an award standing on it still blocks", () => {
    expect(cancelFaults({ ...base, status: "EVALUATED", awardStands: "AWD/1" }).map((f) => f.code)).toEqual(["AWARD_STANDS"]);
  });
});
