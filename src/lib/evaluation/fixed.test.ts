import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { compareFixed, divRound, FixedFormatError, fixedOf, formatFixed, mulPct, parseFixed, pctText, ratioPct, roundHalfUp, senTimesPct, sumFixed } from "./fixed";

/**
 * Fixed point at four places (plan §3 `fixed.ts`, E-5). The spec's worked example (TA 109, a test
 * fixture only): the technical stage 80.35 at 60 % and the financial stage 92.00 at 40 % give
 * 48.2100 + 36.8000 = 85.0100, shown as 85.01 at two places.
 */

const F = parseFixed;

describe("parsing", () => {
  it("reads up to four places and refuses a fifth rather than rounding it", () => {
    expect(F("80.35")).toBe(803500n);
    expect(F("-15")).toBe(-150000n);
    expect(F("0.0001")).toBe(1n);
    expect(() => F("1.00001")).toThrow(FixedFormatError);
    expect(() => F("1e3")).toThrow(FixedFormatError);
    expect(() => F("")).toThrow(FixedFormatError);
    expect(fixedOf(null)).toBeNull();
    expect(fixedOf({ toString: () => "12.5" })).toBe(125000n);
  });
});

describe("arithmetic without a float", () => {
  it("0.1 + 0.2 is 0.3 exactly", () => {
    expect(sumFixed(F("0.1"), F("0.2"))).toBe(F("0.3"));
  });
  it("the TA 109 composite: (80.35 × 60 %) + (92.00 × 40 %) = 48.2100 + 36.8000 = 85.0100", () => {
    const tech = mulPct(F("80.35"), F("60"));
    const fin = mulPct(F("92.00"), F("40"));
    expect(formatFixed(tech)).toBe("48.2100");
    expect(formatFixed(fin)).toBe("36.8000");
    expect(formatFixed(sumFixed(tech, fin))).toBe("85.0100");
    expect(formatFixed(sumFixed(tech, fin), 2)).toBe("85.01");
  });
  it("rounds half up, once: 2.345 → 2.35 at two places; 2.3449 → 2.34", () => {
    expect(formatFixed(roundHalfUp(F("2.345"), 2), 4)).toBe("2.3500");
    expect(formatFixed(F("2.3449"), 2)).toBe("2.34");
    expect(formatFixed(F("69.995"), 2)).toBe("70.00");
  });
  it("a half goes away from zero, so a negative rounds as its positive twin does", () => {
    expect(formatFixed(F("-2.345"), 2)).toBe("-2.35");
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(5n, 2n)).toBe(3n);
  });
  it("a ratio of two amounts, from their sen: 19,500.00 of 280,500.00 is 6.9519 %", () => {
    expect(formatFixed(ratioPct(parseSen("19500.00"), parseSen("280500.00"))!)).toBe("6.9519");
    expect(ratioPct(1n, 0n)).toBeNull();
  });
  it("a percentage of an amount, to the sen: 10 % of 1,077,508.60 = 107,750.86", () => {
    expect(senTimesPct(parseSen("1077508.60"), F("10"))).toBe(parseSen("107750.86"));
    expect(senTimesPct(parseSen("330000.00"), F("3"))).toBe(parseSen("9900.00"));
    expect(senTimesPct(parseSen("330000.00"), F("5"))).toBe(parseSen("16500.00"));
  });
  it("compares and writes percentages", () => {
    expect(compareFixed(F("70"), F("69.9999"))).toBe(1);
    expect(pctText(F("-15"), 4, true)).toBe("−15.0000%");
    expect(pctText(F("6.9519"), 4, true)).toBe("+6.9519%");
    expect(pctText(F("0"), 2, true)).toBe("0.00%");
    expect(pctText(F("-0.004"), 2, true)).toBe("0.00%");
  });
  it("refuses places outside 0–4", () => {
    expect(() => roundHalfUp(1n, 5)).toThrow(RangeError);
  });
});

describe("no evaluation rule reads a score as a JavaScript number (plan §3)", () => {
  it("src/lib/evaluation calls neither Number(), parseFloat nor toFixed outside its tests", () => {
    const dir = join(process.cwd(), "src/lib/evaluation");
    const bad = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .flatMap((f) => (/\bNumber\(|\bparseFloat\(|\.toFixed\(/.test(readFileSync(join(dir, f), "utf8")) ? [f] : []));
    expect(bad).toEqual([]);
  });
});
