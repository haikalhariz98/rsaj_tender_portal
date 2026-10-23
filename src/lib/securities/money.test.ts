import { describe, expect, it } from "vitest";

import { parseSen, senToDecimalString } from "@/lib/money";

import { PercentFormatError, pctOfSen } from "./money";

describe("percentages", () => {
  it("takes a plain percentage", () => {
    expect(senToDecimalString(pctOfSen(parseSen("1000.00"), "10"))).toBe("100.00");
    expect(senToDecimalString(pctOfSen(parseSen("1000.00"), "5"))).toBe("50.00");
  });

  it("rounds half up to the sen", () => {
    // 3.333% of 1.00 is 0.03333 ringgit -> 3.333 sen -> 3 sen.
    expect(senToDecimalString(pctOfSen(parseSen("1.00"), "3.333"))).toBe("0.03");
    // 2.5% of 1.00 is 2.5 sen, which rounds up.
    expect(senToDecimalString(pctOfSen(parseSen("1.00"), "2.5"))).toBe("0.03");
  });

  it("carries four decimal places of percentage, as the columns do", () => {
    expect(senToDecimalString(pctOfSen(parseSen("1000000.00"), "0.0125"))).toBe("125.00");
  });

  it("handles a negative base without losing the sign", () => {
    expect(senToDecimalString(pctOfSen(parseSen("-1000.00"), "10"))).toBe("-100.00");
  });

  it("refuses a percentage that is not a number", () => {
    expect(() => pctOfSen(100n, "NaN")).toThrow(PercentFormatError);
  });
});
