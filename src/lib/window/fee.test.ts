import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { feeBasisTotal, feeFaults, lineAmount, quantityMilli } from "./fee";
import { SPEC_FLOORS } from "./fixture";
import { windowFindingText } from "./labels";

/**
 * FR-ADV-008 (SK002 7.4.2(d), OD-6 A): the basis totalled in sen, the fee entered, the regime's
 * floor refused below, the basis warned below. Worked example: a finance person can check it.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const sen = (rm: string) => parseSen(rm);
const amount = (l: Parameters<typeof lineAmount>[0]) => {
  const r = lineAmount(l);
  if ("fault" in r) throw new Error(r.fault);
  return r.amount;
};

describe("the cost basis, worked", () => {
  it("40 sheets of A1 at RM3.50, binding RM25.00 and administration RM100.00 total RM265.00", () => {
    const lines = [
      { amount: amount({ quantity: "40", unitCost: sen("3.50"), lump: null }) }, // 40 × 3.50 = 140.00
      { amount: amount({ quantity: null, unitCost: null, lump: sen("25.00") }) },
      { amount: amount({ quantity: null, unitCost: null, lump: sen("100.00") }) },
    ];
    expect(lines.map((l) => l.amount)).toEqual([14_000n, 2_500n, 10_000n]);
    expect(feeBasisTotal(lines)).toBe(26_500n);
  });
  it("a fractional quantity is rounded once, half up, to the sen", () => {
    // 2.5 × RM0.15 = RM0.375 → RM0.38
    expect(amount({ quantity: "2.5", unitCost: sen("0.15"), lump: null })).toBe(38n);
    // 1.333 × RM3.00 = RM3.999 → RM4.00
    expect(amount({ quantity: "1.333", unitCost: sen("3.00"), lump: null })).toBe(400n);
  });
  it("refuses what is not a line", () => {
    expect(lineAmount({ quantity: "0", unitCost: sen("1"), lump: null })).toEqual({ fault: "QUANTITY_NOT_VALID" });
    expect(lineAmount({ quantity: "1.2345", unitCost: sen("1"), lump: null })).toEqual({ fault: "QUANTITY_NOT_VALID" });
    expect(lineAmount({ quantity: null, unitCost: sen("1"), lump: null })).toEqual({ fault: "UNIT_COST_WITHOUT_QUANTITY" });
    expect(lineAmount({ quantity: null, unitCost: null, lump: null })).toEqual({ fault: "AMOUNT_REQUIRED" });
    expect(quantityMilli("12.5")).toBe(12_500n);
  });
});

describe("the fee against the floor (worked examples)", () => {
  const f = (fee: string | null, regime: string | null, basis = "0") => feeFaults({ fee: fee == null ? null : sen(fee), regime, floors: SPEC_FLOORS, basisTotal: sen(basis) });
  it("tender: RM249.99 is refused, RM250.00 passes", () => {
    expect(codes(f("249.99", "tender"))).toEqual(["BELOW_FLOOR"]);
    expect(windowFindingText(f("249.99", "tender")[0])).toBe("The fee RM249.99 is below the floor of RM250 for this band. Raise the fee.");
    expect(f("250.00", "tender")).toEqual([]);
  });
  it("quotation: RM49.99 is refused, RM50.00 passes; the prototype's RM30.00 quotation fee is refused", () => {
    expect(codes(f("49.99", "quotation"))).toEqual(["BELOW_FLOOR"]);
    expect(f("50.00", "quotation")).toEqual([]);
    expect(codes(f("30.00", "quotation"))).toEqual(["BELOW_FLOOR"]);
  });
  it("no floor for the regime blocks naming the setting; no regime blocks", () => {
    expect(codes(f("300.00", "below"))).toEqual(["FLOOR_NOT_SET"]);
    expect(windowFindingText(f("300.00", "below")[0])).toMatch(/Invitation controls/);
    expect(codes(f("300.00", null))).toEqual(["REGIME_NOT_DETERMINED"]);
  });
  it("below the basis warns, never refuses", () => {
    const r = f("250.00", "tender", "265.00");
    expect(r).toEqual([{ code: "FEE_BELOW_COST", level: "warn", data: { fee: "25000", basis: "26500" } }]);
  });
  it("a fee not set blocks", () => {
    expect(codes(f(null, "tender"))).toEqual(["FEE_NOT_SET"]);
  });
});
