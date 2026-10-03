import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { percentLabel, percentLabelText, ratioOf, variationReading } from "./percent";

/**
 * OD-A2 (the basis and the base, shipped unset) and OD-A3 A (the exact ratio judged; "more than 10.00%" where the
 * rounded figure equals an edge the ratio is not on), §8.7. Figures are invented test fixtures.
 */

const S = parseSen;
const base = { original: S("750000.00"), adjustments: [], cumulativeApproved: 0n, event: "PRIOR" as const };

describe("the reading: which basis, which base (OD-A2)", () => {
  it("unset refuses, naming each setting; never a default", () => {
    const r = variationReading({ ...base, basis: null, base: null, value: S("90000.00") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.faults.map((f) => f.code)).toEqual(["VARIATION_BASIS_NOT_SET", "VARIATION_BASE_NOT_SET"]);
    const b = variationReading({ ...base, basis: "THIS_VARIATION", base: null, value: S("90000.00") });
    expect(!b.ok && b.faults.map((f) => f.code)).toEqual(["VARIATION_BASE_NOT_SET"]);
  });

  it("THIS_VARIATION over ORIGINAL (the demo's assumed reading): 90,000.00 / 750,000.00 = 12%", () => {
    const r = variationReading({ ...base, basis: "THIS_VARIATION", base: "ORIGINAL", value: S("90000.00"), cumulativeApproved: S("40000.00") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reading).toMatchObject({ num: "9000000", den: "75000000", baseAmount: "75000000", cumulative: false });
      expect(percentLabel(r.ratio, ["10", "15"]).figure).toBe("12.00");
    }
  });

  it("CUMULATIVE adds every other approved variation to this one; REVISED adds the issued adjustments to the base", () => {
    const r = variationReading({ ...base, basis: "CUMULATIVE", base: "REVISED", value: S("90000.00"), cumulativeApproved: S("40000.00"), adjustments: [S("37800.00"), S("-20000.00")] });
    expect(r.ok && r.reading).toMatchObject({ num: String(S("130000.00")), den: String(S("767800.00")), cumulative: true });
  });

  it("an increase is read as what is approved so far plus the increase; agreed rates and a re-measurement on their own value", () => {
    const inc = variationReading({ ...base, event: "INCREASE", basis: "THIS_VARIATION", base: "ORIGINAL", value: S("5000.00"), approvedSoFar: S("90000.00") });
    expect(inc.ok && inc.reading.num).toBe(String(S("95000.00")));
    const ag = variationReading({ ...base, event: "AGREED_RATE", basis: "CUMULATIVE", base: "ORIGINAL", value: S("5000.00"), cumulativeApproved: S("90000.00") });
    expect(ag.ok && ag.reading).toMatchObject({ num: String(S("5000.00")), cumulative: false });
  });

  it("a value of nothing and a base of nothing are refused", () => {
    expect(variationReading({ ...base, basis: "THIS_VARIATION", base: "ORIGINAL", value: 0n }).ok).toBe(false);
    expect(variationReading({ ...base, original: S("100.00"), adjustments: [S("-100.00")], basis: "THIS_VARIATION", base: "REVISED", value: S("1.00") }).ok).toBe(false);
  });
});

describe("the figure shown (OD-A3 A)", () => {
  const edges = ["5", "10", "15"];
  it("exactly 75,000.00 / 750,000.00 is 10.00%, on the edge", () => {
    const l = percentLabel({ num: S("75000.00"), den: S("750000.00") }, edges);
    expect(l).toEqual({ figure: "10.00", side: null, edge: "10" });
    expect(percentLabelText(l).en).toBe("10.00%");
  });
  it("75,000.01 rounds to 10.00 but is above the edge: “more than 10.00%”", () => {
    const l = percentLabel({ num: S("75000.01"), den: S("750000.00") }, edges);
    expect(percentLabelText(l)).toEqual({ en: "more than 10.00%", ms: "lebih daripada 10.00%" });
  });
  it("74,999.99 rounds to 10.00 but is below it: “less than 10.00%”", () => {
    expect(percentLabelText(percentLabel({ num: S("74999.99"), den: S("750000.00") }, edges)).en).toBe("less than 10.00%");
  });
  it("a figure on no edge reads as it is", () => {
    expect(percentLabelText(percentLabel({ num: S("288000.00"), den: S("2400000.00") }, ["10", "30"])).en).toBe("12.00%");
  });
  it("the frozen reading's ratio reads back exactly", () => {
    expect(ratioOf({ num: "7500001", den: "75000000" })).toEqual({ num: 7500001n, den: 75000000n });
  });
});
