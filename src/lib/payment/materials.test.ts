import { describe, expect, it } from "vitest";

import { parseSen, senToDecimalString } from "@/lib/money";

import { afterCutOff, materialsAllowance, materialsPct, materialVerdict, type MaterialLine } from "./materials";

/// FR-PAY-005, 007 and the 75% ruling. FIXTURE ONLY: 75% is RSAJ's figure (its seed sets it STATED), never shipped.
const line = (value: string, over: Partial<MaterialLine> = {}): MaterialLine => ({ value: parseSen(value), protectedOnSite: true, notTooEarly: true, formsPartOfWorks: true, temporary: false, submittedOn: "2026-07-10", ...over });

describe("unfixed materials", () => {
  it("only a line with all three answers yes, and not temporary works, is valued", () => {
    expect(materialVerdict(line("1.00"))).toBe("ELIGIBLE");
    expect(materialVerdict(line("1.00", { temporary: true }))).toBe("TEMPORARY");
    expect(materialVerdict(line("1.00", { protectedOnSite: false }))).toBe("NOT_PROTECTED");
    expect(materialVerdict(line("1.00", { notTooEarly: false }))).toBe("TOO_EARLY");
    expect(materialVerdict(line("1.00", { formsPartOfWorks: false }))).toBe("NOT_PART_OF_WORKS");
    expect(materialVerdict(line("1.00", { notTooEarly: null }))).toBe("NOT_ANSWERED");
  });
  it("75% × 20,000.00 = 15,000.00; ineligible lines shown, not valued", () => {
    const r = materialsAllowance([line("20000.00"), line("5000.00", { temporary: true })], materialsPct(null, "75"));
    expect(senToDecimalString(r.eligibleValue)).toBe("20000.00");
    expect(senToDecimalString(r.allowance!)).toBe("15000.00");
  });
  it("the contract's own figure (baseline, B8) wins over the organisation's default", () => {
    expect(materialsPct("80", "75")).toEqual({ state: "SET", pct: "80", source: "CONTRACT" });
    expect(materialsPct(null, "75")).toEqual({ state: "SET", pct: "75", source: "POLICY" });
  });
  it("unset: NOT_SET refuses the materials line, never 0%; with no eligible line there is nothing to refuse", () => {
    const r = materialsAllowance([line("20000.00")], materialsPct(null, null));
    expect(r.allowance).toBeNull();
    expect(r.faults.map((f) => f.code)).toEqual(["MATERIALS_PCT_NOT_SET"]);
    expect(materialsAllowance([line("1.00", { temporary: true })], materialsPct(null, null))).toEqual({ eligibleValue: 0n, allowance: 0n, faults: [] });
  });
  it("half up to the sen", () => {
    expect(senToDecimalString(materialsAllowance([line("0.03")], materialsPct(null, "75")).allowance!)).toBe("0.02");
  });
  it("the cut-off is hard: a list after the valuation day goes to the next cycle; on the day is in", () => {
    expect(afterCutOff("2026-07-10", "2026-07-10")).toBe(false);
    expect(afterCutOff("2026-07-11", "2026-07-10")).toBe(true);
  });
});
