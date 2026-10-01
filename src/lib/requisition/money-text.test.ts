import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { historyMoneyText, linesSubtitle, MONEY_FIELDS } from "./money-text";

/// The largest figure a Decimal(18, 2) column holds (FormReader.money's 16-digit cap).
const CAP = "9999999999999999.99";

describe("requisition money on screen is exact (62-C3)", () => {
  it("History reads a stored amount at the 16-digit cap exactly, where a float shows RM10,000,000,000,000,000", () => {
    expect(historyMoneyText("estimatedValue", CAP)).toBe("RM9,999,999,999,999,999.99");
    // What Number() made of it: the sen are gone and the figure is one more than the cap.
    expect(Number(CAP)).toBe(1e16);
    expect(historyMoneyText("estimatedAmount", "1234567890123456.78")).toBe("RM1,234,567,890,123,456.78");
    expect(historyMoneyText("estimatedAmount", "-1234567890123456.78")).toBe("−RM1,234,567,890,123,456.78");
  });

  it("worked example a finance reader can check: whole ringgit without sen, sen where there are some", () => {
    expect(historyMoneyText("value", "300000")).toBe("RM300,000");
    expect(historyMoneyText("value", "300000.00")).toBe("RM300,000");
    expect(historyMoneyText("value", "300000.5")).toBe("RM300,000.50");
    expect(historyMoneyText("unitPrice", "0.10")).toBe("RM0.10");
  });

  it("only money fields, and only amounts, are read as money; anything else is left to the caller", () => {
    expect(historyMoneyText("status", "100")).toBeNull();
    expect(historyMoneyText("estimatedValue", "not an amount")).toBeNull();
    // More than two places is not an amount the portal writes: never rounded into one.
    expect(historyMoneyText("estimatedValue", "10.005")).toBeNull();
    for (const f of ["estimatedValue", "estimatedAmount", "unitPrice", "requestedAmount", "projectedBalance"]) expect(MONEY_FIELDS.has(f), f).toBe(true);
  });

  it("the Line items subtitle totals in sen and writes the total exactly at the cap", () => {
    expect(linesSubtitle(1, parseSen(CAP))).toBe("1 line, coming to RM9,999,999,999,999,999.99.");
    expect(linesSubtitle(2, parseSen("1500.25") + parseSen("499.75"))).toBe("2 lines, coming to RM2,000.");
    expect(linesSubtitle(0, 0n)).toBe("0 lines, coming to RM0.");
  });

  it("the requisition page uses these, and no longer turns History money or the lines total into a number", () => {
    const page = readFileSync(join(process.cwd(), "src/app/requisitions/[id]/page.tsx"), "utf8");
    expect(page).toMatch(/historyMoneyText\(field, value\)/);
    expect(page).toMatch(/linesSubtitle\(r\.lines\.length, lineTotal\)/);
    expect(page).not.toMatch(/formatRM\(Number\(value\)\)/);
    expect(page).not.toMatch(/Number\(lineTotal\)/);
    expect(page).not.toMatch(/const MONEY_FIELDS/);
  });
});
