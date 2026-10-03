import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { adjustmentsMovedFaults, valuableVariation, variationFaults } from "./variation-check";

/**
 * FR-PAY-008 and FR-PAD-003 at valuation (6.13 Part A step 4): an unapproved variation is not valuable; the value to
 * date beyond the revised contract sum (original plus issued adjustments only) needs a Variation Order Certificate
 * first; and a certificate's issue refuses if the issued adjustments it read have moved, in either order.
 */

const S = parseSen;

describe("FR-PAY-008", () => {
  it("only approved variation lines are valuable", () => {
    expect(valuableVariation([{ approved: true, value: S("1000.00") }, { approved: false, value: S("500.00") }])).toBe(S("1000.00"));
    expect(variationFaults({ valuedTotal: 0n, revisedSum: S("1.00"), unapproved: 1 }).map((f) => f.code)).toEqual(["VARIATION_NOT_APPROVED"]);
  });
  it("beyond the revised sum needs a Variation Order Certificate; exactly on it does not (fixture: 1,077,508.60 + 37,800.00 = 1,115,308.60)", () => {
    const revised = S("1077508.60") + S("57800.00") - S("20000.00");
    expect(revised).toBe(S("1115308.60"));
    expect(variationFaults({ valuedTotal: revised, revisedSum: revised, unapproved: 0 })).toEqual([]);
    expect(variationFaults({ valuedTotal: revised + 1n, revisedSum: revised, unapproved: 0 }).map((f) => f.code)).toEqual(["VOC_REQUIRED"]);
  });
});

describe("FR-PAD-003: the issued adjustments a certificate read", () => {
  it("unchanged: none", () => expect(adjustmentsMovedFaults(["a", "b"], ["b", "a"])).toEqual([]));
  it("one issued after the certificate was raised: refused (the certificate would stand on the earlier sum)", () => {
    expect(adjustmentsMovedFaults(["a"], ["a", "b"])).toEqual([{ code: "ADJUSTMENTS_MOVED", level: "block", data: { added: 1, gone: 0 } }]);
  });
  it("the other order: one read that is no longer issued", () => {
    expect(adjustmentsMovedFaults(["a", "b"], ["a"])).toEqual([{ code: "ADJUSTMENTS_MOVED", level: "block", data: { added: 0, gone: 1 } }]);
  });
  it("a certificate raised before any adjustment, issued after one: refused", () => {
    expect(adjustmentsMovedFaults([], ["a"]).map((f) => f.code)).toEqual(["ADJUSTMENTS_MOVED"]);
  });
});
