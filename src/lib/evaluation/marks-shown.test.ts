import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { formatMark, parseFixed } from "./fixed";

/**
 * 6.8 review carry 68-C2: an individual mark is shown as entered, at the evaluation's frozen places
 * (E-5), never padded to the column's four places and never rounded below what was entered.
 */

describe("a mark as entered (68-C2)", () => {
  it("at the frozen places where it was entered with fewer", () => {
    expect(formatMark(parseFixed("18"), 2)).toBe("18.00");
    expect(formatMark(parseFixed("12.5"), 2)).toBe("12.50");
    expect(formatMark(parseFixed("7"), 0)).toBe("7");
  });
  it("with more places where it was entered with more: never rounded to fewer", () => {
    expect(formatMark(parseFixed("12.125"), 2)).toBe("12.125");
    expect(formatMark(parseFixed("0.0001"), 2)).toBe("0.0001");
    expect(formatMark(parseFixed("19.9999"), 0)).toBe("19.9999");
  });
  it("places not frozen: exactly as entered", () => {
    expect(formatMark(parseFixed("18.0000"), null)).toBe("18");
    expect(formatMark(parseFixed("18.25"), null)).toBe("18.25");
  });
  it("the tab and the frozen report both show marks through it, never at four places (source scan)", () => {
    const read = readFileSync(join(process.cwd(), "src/lib/evaluation/read.ts"), "utf8");
    expect(read).toMatch(/formatMark\(sc\.marks, dp\)/);
    expect(read).not.toMatch(/formatFixed\(sc\.marks, 4\)/);
    const report = readFileSync(join(process.cwd(), "src/lib/evaluation/report.ts"), "utf8");
    expect(report).toMatch(/formatMark\(sc\.marks, dp\)/);
  });
});
