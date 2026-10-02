import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { bandFor, comparePercent, inPercentBandExact, onPercent, RatioError, ratioPercentText, type ExactRatio } from "./percent-band";

/**
 * ADR 0024: a percentage band is judged on the exact ratio of two amounts, never on a float or on a
 * figure rounded for display. Each edge case below fails if the ratio is read as a JavaScript number
 * or rounded to two places before it is judged.
 */

const ratio = (num: string, den: string): ExactRatio => ({ num: parseSen(num), den: parseSen(den) });
const TWO_WEEKS = { pctMin: null, pctMax: "20", days: 14 };
const SIX_WEEKS = { pctMin: "20", pctMax: null, days: 42 };
const QUOTATION = [TWO_WEEKS, SIX_WEEKS];

describe("comparePercent: integers only", () => {
  it("20,000.00 of 100,000.00 is exactly 20%", () => {
    expect(comparePercent(ratio("20000.00", "100000.00"), "20")).toBe(0);
    expect(comparePercent(ratio("20000.00", "100000.00"), "20.0000")).toBe(0);
    expect(onPercent(ratio("20000.00", "100000.00"), "20")).toBe(true);
  });
  it("one sen either side of 20% is either side of it", () => {
    expect(comparePercent(ratio("20000.01", "100000.00"), "20")).toBe(1);
    expect(comparePercent(ratio("19999.99", "100000.00"), "20")).toBe(-1);
  });
  it("edges that a float misreads: 7,000.00 / 100,000.00 at 7%, 29,000.00 / 100,000.00 at 29%, 21,000.00 / 300,000.00 at 7%", () => {
    // 0.07 * 100 = 7.000000000000001 and 0.29 * 100 = 28.999999999999996 in binary floating point.
    expect(0.07 * 100 === 7).toBe(false);
    expect(0.29 * 100 === 29).toBe(false);
    expect(comparePercent(ratio("7000.00", "100000.00"), "7")).toBe(0);
    expect(comparePercent(ratio("29000.00", "100000.00"), "29")).toBe(0);
    expect(comparePercent(ratio("21000.00", "300000.00"), "7")).toBe(0);
  });
  it("a denominator of nothing is refused, never divided by", () => {
    expect(() => comparePercent({ num: 1n, den: 0n }, "1")).toThrow(RatioError);
  });
});

describe("inPercentBandExact: which side of the edge is the caller's, both tested", () => {
  const at20 = ratio("20000.00", "100000.00");
  it("upper edge inclusive, (min, max]: exactly 20% is in the band up to 20", () => {
    expect(inPercentBandExact(at20, null, "20", true)).toBe(true);
    expect(inPercentBandExact(at20, "20", null, true)).toBe(false);
  });
  it("lower edge inclusive, [min, max): exactly 20% is in the band from 20", () => {
    expect(inPercentBandExact(at20, null, "20", false)).toBe(false);
    expect(inPercentBandExact(at20, "20", null, false)).toBe(true);
  });
  it("off the edge both readings agree", () => {
    for (const side of [true, false]) {
      expect(inPercentBandExact(ratio("20010.00", "100000.00"), "20", null, side)).toBe(true);
      expect(inPercentBandExact(ratio("19990.00", "100000.00"), null, "20", side)).toBe(true);
    }
  });
  it("open edges", () => {
    expect(inPercentBandExact(ratio("1.00", "3.00"), null, null, true)).toBe(true);
  });
});

describe("bandFor", () => {
  it("rulings test: 20.00% → 2 weeks, 20.01% → 6 weeks, with the upper edge inclusive", () => {
    const a = bandFor(ratio("20000.00", "100000.00"), QUOTATION, true);
    const b = bandFor(ratio("20010.00", "100000.00"), QUOTATION, true);
    expect(a).toEqual({ state: "IN", band: TWO_WEEKS });
    expect(b).toEqual({ state: "IN", band: SIX_WEEKS });
  });
  it("20.004% is above 20%: a figure rounded to 20.00 for display is never what is judged", () => {
    const r = ratio("20004.00", "100000.00");
    expect(ratioPercentText(r)).toBe("20.00");
    expect(bandFor(r, QUOTATION, true)).toEqual({ state: "IN", band: SIX_WEEKS });
  });
  it("the lower edge inclusive puts exactly 20.00% in the 6-week band", () => {
    expect(bandFor(ratio("20000.00", "100000.00"), QUOTATION, false)).toEqual({ state: "IN", band: SIX_WEEKS });
  });
  it("side not decided: exactly on an edge has no band; off every edge it still has one", () => {
    expect(bandFor(ratio("20000.00", "100000.00"), QUOTATION, null)).toEqual({ state: "EDGE_UNDECIDED", edge: "20" });
    expect(bandFor(ratio("15000.00", "100000.00"), QUOTATION, null)).toEqual({ state: "IN", band: TWO_WEEKS });
  });
  it("no band covers it, or two do", () => {
    expect(bandFor(ratio("5.00", "100.00"), [{ pctMin: "10", pctMax: null }], true)).toEqual({ state: "NONE" });
    const a = { pctMin: null, pctMax: "30" };
    const b = { pctMin: "10", pctMax: null };
    expect(bandFor(ratio("20.00", "100.00"), [a, b], true)).toEqual({ state: "OVERLAP", bands: [a, b] });
  });
});

describe("ratioPercentText (display only)", () => {
  it("rounds half up", () => {
    expect(ratioPercentText(ratio("20005.00", "100000.00"))).toBe("20.01");
    expect(ratioPercentText(ratio("1.00", "3.00"))).toBe("33.33");
    expect(ratioPercentText(ratio("2.00", "3.00"))).toBe("66.67");
  });
});
