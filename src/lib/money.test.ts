import { describe, expect, it } from "vitest";

import {
  addSen,
  compareSen,
  formatSen,
  MoneyFormatError,
  parseSen,
  percentOfSen,
  senToDecimalString,
  subtractSen,
  compareAmounts,
  senFromAmount,
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
