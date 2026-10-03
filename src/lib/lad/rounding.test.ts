import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import * as interim from "@/lib/payment/interim";

import { LAD_ROUNDING_LIMIT, ladRoundingFaults } from "./rounding";

/**
 * BD-613-47 / BD-613-92: one rounding rule wherever the sources print "± Rounding" beside a damages figure: −RM1.00 <
 * r < RM1.00, and the figure plus its rounding never below nothing. Moved from payment/interim.ts at Part B run 0;
 * Part A's own test (payment/lad-rounding.test.ts) is unchanged and still passes through the re-export.
 *
 * Worked examples (fixtures, §8.9 as the plan's B5 sets them out): the Cost of Completion's cost of loss 71,655.08 with
 * a rounding of −0.08 gives 71,655.00; the Adjusted Original Contract Price's LAD imposed 8,081.40 with −0.40 gives
 * 8,081.00. Each is the same call as the interim's damages line.
 */
const s = parseSen;
const codes = (d: string, r: string) => ladRoundingFaults(s(d), s(r)).map((f) => f.code);

describe("the rounding beside a damages figure (lad/rounding.ts)", () => {
  it("is the very function Part A's interim certificate reads (moved, re-exported, not copied)", () => {
    expect(interim.ladRoundingFaults).toBe(ladRoundingFaults);
    expect(interim.LAD_ROUNDING_LIMIT).toBe(LAD_ROUNDING_LIMIT);
    expect(LAD_ROUNDING_LIMIT).toBe(100n);
  });
  it("§8.9's two roundings: the cost of loss and the LAD imposed (fixtures)", () => {
    expect(codes("71655.08", "-0.08")).toEqual([]);
    expect(codes("8081.40", "-0.40")).toEqual([]);
  });
  it("the edges, either side: ±0.99 accepted, ±1.00 refused", () => {
    for (const r of ["0.99", "-0.99", "0.00"]) expect(codes("100.00", r), r).toEqual([]);
    for (const r of ["1.00", "-1.00", "1.01", "-250.00"]) expect(codes("1000.00", r), r).toEqual(["LAD_ROUNDING_OUT_OF_RANGE"]);
  });
  it("never below nothing: exactly nothing accepted, one sen under refused", () => {
    expect(codes("0.40", "-0.40")).toEqual([]);
    expect(codes("0.40", "-0.41")).toEqual(["LAD_ROUNDING_BELOW_NOTHING"]);
    expect(codes("0.00", "0.00")).toEqual([]);
    // Both at once: out of range and below nothing.
    expect(codes("0.50", "-1.00")).toEqual(["LAD_ROUNDING_OUT_OF_RANGE", "LAD_ROUNDING_BELOW_NOTHING"]);
  });
  it("property: within range and not below nothing exactly when −100 < r < 100 sen and figure + r ≥ 0", () => {
    let seed = 47;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 2000; k++) {
      const d = BigInt(Math.floor(next() * 500));
      const r = BigInt(Math.floor(next() * 401) - 200);
      const want = [...(r <= -100n || r >= 100n ? ["LAD_ROUNDING_OUT_OF_RANGE"] : []), ...(d + r < 0n ? ["LAD_ROUNDING_BELOW_NOTHING"] : [])];
      expect(ladRoundingFaults(d, r).map((f) => f.code), `${d} ${r}`).toEqual(want);
    }
  });
  it("the finding carries the figures as sen strings, for the words", () => {
    expect(ladRoundingFaults(50n, -60n)).toEqual([{ code: "LAD_ROUNDING_BELOW_NOTHING", level: "block", data: { damages: "50", rounding: "-60" } }]);
  });
});
