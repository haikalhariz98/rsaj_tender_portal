import { describe, expect, it } from "vitest";

import { ladBasisMoved, type LadBasis } from "./frozen";

/** 6.13 Part B run 1b (ADR 0030 §6): an interim freezes the damages basis it was raised on; its issue refuses a moved one. */

const basis = (o: Partial<LadBasis> = {}): LadBasis => ({ decisions: [{ key: "WHOLE", id: "d1", supersededBy: null }], extensions: [], waiversApproved: [], waiversApplied: [], scopeDates: { WHOLE: "2026-08-31" }, segments: { WHOLE: "269.38" }, ...o });
const names = { extension: (id: string) => (id === "e1" ? "EOT/1" : id), waiver: (id: string) => (id === "w1" ? "CM/2" : id), scope: (k: string) => (k === "WHOLE" ? "the whole works" : k) };

describe("the frozen damages basis at the interim's issue", () => {
  it("unmoved: nothing", () => expect(ladBasisMoved(basis(), basis(), names)).toEqual([]));
  it("an EOT issued since: LAD_BASIS_MOVED naming it", () => {
    expect(ladBasisMoved(basis(), basis({ extensions: ["e1"], scopeDates: { WHOLE: "2026-09-14" }, decisions: [{ key: "WHOLE", id: "d1", supersededBy: "EOT/1" }] }), names)).toEqual([
      { code: "LAD_BASIS_MOVED", level: "block", data: { moved: "the extension of time EOT/1 issued; the decision on the whole works was superseded by EOT/1; the date for completion of the whole works moved to 14 Sep 2026" } },
    ]);
  });
  it("a waiver approved since, or a decision replaced, or the segments changed", () => {
    expect(ladBasisMoved(basis(), basis({ waiversApproved: ["w1"] }), names)[0].data?.moved).toBe("the waiver CM/2 was approved");
    expect(ladBasisMoved(basis(), basis({ decisions: [{ key: "WHOLE", id: "d2", supersededBy: null }] }), names)[0].data?.moved).toBe("the decision on the whole works was replaced");
    expect(ladBasisMoved(basis(), basis({ segments: { WHOLE: "269.38 to 9 Sep 2026; 215.50 from it" } }), names)[0].data?.moved).toBe("an occupation's confirmed rate changed the rate segments of the whole works");
  });
  it("a waiver applied on this very certificate is not a move", () => {
    expect(ladBasisMoved(basis({ waiversApplied: ["w1"] }), basis({ waiversApproved: [], waiversApplied: ["w1"] }), names)).toEqual([]);
  });
});
