import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  addSen,
  compareSen,
  compareSenOrNone,
  formatSen,
  MoneyFormatError,
  parseSen,
  percentOfSen,
  senToDecimalString,
  subtractSen,
  compareAmounts,
  senFromAmount,
  fitsMoneyColumn,
  MONEY_COLUMN_MAX_SEN,
} from "./money";

describe("parsing", () => {
  it("reads whole ringgit and sen", () => {
    expect(parseSen("0")).toBe(0n);
    expect(parseSen("1")).toBe(100n);
    expect(parseSen("1.5")).toBe(150n);
    expect(parseSen("1.05")).toBe(105n);
  });

  it("accepts thousands separators", () => {
    expect(parseSen("1,250,000.00")).toBe(125_000_000n);
  });

  it("keeps a figure far beyond what a float holds exactly", () => {
    // 2^53 sen is about RM90 trillion; a contract sum will not reach it, but an
    // accumulated total across a portfolio can, and the arithmetic must not drift.
    expect(parseSen("99999999999999.99")).toBe(9_999_999_999_999_999n);
    expect(senToDecimalString(parseSen("99999999999999.99"))).toBe("99999999999999.99");
  });

  it("refuses more than two decimal places rather than rounding them away", () => {
    expect(() => parseSen("10.005")).toThrow(MoneyFormatError);
  });

  it("refuses anything that is not an amount", () => {
    for (const bad of ["", "abc", "1.2.3", "RM5", "1 000"]) {
      expect(() => parseSen(bad)).toThrow(MoneyFormatError);
    }
  });

  it("reads a negative amount, which a correction can be", () => {
    expect(parseSen("-12.34")).toBe(-1234n);
    expect(senToDecimalString(-1234n)).toBe("-12.34");
  });
});

describe("arithmetic", () => {
  it("adds without the drift a float would introduce", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. In sen it simply does.
    expect(addSen(parseSen("0.10"), parseSen("0.20"))).toBe(parseSen("0.30"));
  });

  it("stays exact over many small commitments", () => {
    const ten = Array.from({ length: 1000 }, () => parseSen("0.07"));
    expect(senToDecimalString(addSen(...ten))).toBe("70.00");
  });

  it("subtracts to a balance", () => {
    expect(senToDecimalString(subtractSen(parseSen("1000.00"), parseSen("999.99")))).toBe("0.01");
  });

  it("allows a balance to go negative rather than clamping it", () => {
    // An over-commitment is a real condition the screen must be able to show.
    expect(senToDecimalString(subtractSen(parseSen("100.00"), parseSen("150.00")))).toBe("-50.00");
  });

  it("orders amounts", () => {
    expect(compareSen(parseSen("1.00"), parseSen("1.01"))).toBe(-1);
    expect(compareSen(parseSen("1.01"), parseSen("1.00"))).toBe(1);
    expect(compareSen(parseSen("1.00"), parseSen("1.00"))).toBe(0);
  });
});

describe("percentages", () => {
  it("takes a plain percentage", () => {
    expect(senToDecimalString(percentOfSen(parseSen("1000.00"), 10))).toBe("100.00");
    expect(senToDecimalString(percentOfSen(parseSen("1000.00"), 5))).toBe("50.00");
  });

  it("rounds half up to the sen", () => {
    // 3.333% of 1.00 is 0.03333 ringgit -> 3.333 sen -> 3 sen.
    expect(senToDecimalString(percentOfSen(parseSen("1.00"), 3.333))).toBe("0.03");
    // 2.5% of 1.00 is 2.5 sen, which rounds up.
    expect(senToDecimalString(percentOfSen(parseSen("1.00"), 2.5))).toBe("0.03");
  });

  it("carries four decimal places of percentage, as the columns do", () => {
    expect(senToDecimalString(percentOfSen(parseSen("1000000.00"), 0.0125))).toBe("125.00");
  });

  it("handles a negative base without losing the sign", () => {
    expect(senToDecimalString(percentOfSen(parseSen("-1000.00"), 10))).toBe("-100.00");
  });

  it("refuses a percentage that is not a number", () => {
    expect(() => percentOfSen(100n, Number.NaN)).toThrow(MoneyFormatError);
  });
});

describe("display", () => {
  it("groups thousands and always shows sen", () => {
    expect(formatSen(parseSen("1250000"))).toBe("RM1,250,000.00");
    expect(formatSen(parseSen("0.05"))).toBe("RM0.05");
  });

  it("uses a minus sign a reader will recognise", () => {
    expect(formatSen(parseSen("-1.00"))).toBe("−RM1.00");
  });

  it("takes the currency rather than assuming one", () => {
    expect(formatSen(parseSen("5.00"), "$")).toBe("$5.00");
  });
});

describe("comparing amounts exactly", () => {
  it("bridges a two-decimal band edge to sen without drift", () => {
    expect(senFromAmount(300000.01)).toBe(30000001n);
    expect(senFromAmount(0.1 + 0.2)).toBe(30n);
  });

  it("compares decimal strings exactly", () => {
    expect(compareAmounts("300000.00", "300000")).toBe(0);
    expect(compareAmounts("1,000,000.01", "1000000")).toBe(1);
    expect(compareAmounts("15000", "300000")).toBe(-1);
  });
});

describe("formatMoney: one display format", () => {
  it("drops sen only where there are none", async () => {
    const { formatMoney } = await import("./money");
    expect(formatMoney(parseSen("300000"))).toBe("RM300,000");
    expect(formatMoney(parseSen("300000.01"))).toBe("RM300,000.01");
    expect(formatMoney(parseSen("0.50"))).toBe("RM0.50");
  });
});

describe("fitsMoneyColumn: the Decimal(18, 2) a money column holds", () => {
  it("16 digits before the point fit; 17 do not; either sign", () => {
    expect(fitsMoneyColumn(parseSen("9999999999999999.99"))).toBe(true);
    expect(fitsMoneyColumn(MONEY_COLUMN_MAX_SEN)).toBe(true);
    expect(fitsMoneyColumn(MONEY_COLUMN_MAX_SEN + 1n)).toBe(false);
    expect(fitsMoneyColumn(parseSen("10000000000000000.00"))).toBe(false);
    expect(fitsMoneyColumn(-MONEY_COLUMN_MAX_SEN)).toBe(true);
    expect(fitsMoneyColumn(-MONEY_COLUMN_MAX_SEN - 1n)).toBe(false);
    expect(fitsMoneyColumn(0n)).toBe(true);
  });
});

describe("run 3 residual C3: a list sorts money in sen exactly", () => {
  it("compares sen as integers, none first, where a float would tie", () => {
    // 2^53 + 1 sen and 2^53 sen are equal as floats; as sen they are not.
    const big = 9_007_199_254_740_993n;
    expect(Number(big) === Number(big - 1n)).toBe(true);
    expect(compareSenOrNone(big - 1n, big)).toBe(-1);
    expect(compareSenOrNone(big, big - 1n)).toBe(1);
    expect(compareSenOrNone(big, big)).toBe(0);
    expect(compareSenOrNone(null, 0n)).toBe(-1);
    expect(compareSenOrNone(0n, null)).toBe(1);
    expect(compareSenOrNone(null, null)).toBe(0);
    const sums = ["48000000", "-100", "7500001", "48000001"].map(BigInt);
    expect([...sums].sort(compareSenOrNone).map(String)).toEqual(["-100", "7500001", "48000000", "48000001"]);
  });
  it("the contract list's money is sen in the cell, never a Number()", () => {
    const src = readFileSync(path.join(__dirname, "../app/projects/page.tsx"), "utf8");
    expect(src).not.toMatch(/Number\(/);
    // AC-17 (C9): one money cell for a case, the contract's sum once there is a contract and the awarded value before it, in sen.
    expect(src).toContain('sum: { kind: "money", sen: money.toString() }');
    expect(src).toContain("const money = c ? senFromDecimal(c.contractSum) : a ? senFromDecimal(a.awardedValue) : 0n;");
    expect(src).toContain('estimate: { kind: "money", sen: senFromDecimal(v.estimate).toString() }');
  });
});
