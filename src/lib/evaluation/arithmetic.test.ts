import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { ceilingExclusion } from "./ceiling";
import { variance, lowestPrice } from "./commercial";
import { cprBand, cprEntryFaults, CPR_SOURCE_TEXT } from "./cpr";
import { averageBalance, capitalBand, capitalBase, capitalRatio, minimumCapital } from "./financial";
import { formatFixed, parseFixed } from "./fixed";
import { bandsOf } from "./model";
import { estimateFromSchedule, saving } from "./saving";
import { composite, markFault, passes, shownFigure, stagePercent } from "./score";
import { FIVE_PHASE } from "./ta109-fixture";

/**
 * Every evaluation calculation (§8.11), on the spec's worked examples (bold in plan §3). RSAJ's figures
 * appear only here and in the fixture, never in a seed or the demo (X-10(d)).
 */

const F = parseFixed;
const RM = parseSen;
const fasa3 = bandsOf(FIVE_PHASE.bandSets.find((s) => s.code === "FASA3")!);
const cprBands = bandsOf(FIVE_PHASE.bandSets.find((s) => s.code === "CPR")!);
const label = (r: ReturnType<typeof capitalBand>) => (r.placed ? r.band.labelEn : r.reason);

describe("score.ts: stage figures, pass marks and the composite (TA 109)", () => {
  it("technical criteria summing to 80.35 of 100 pass at 70; financial 92.00 passes at 60; the composite 85.01 passes at 60", () => {
    const tech = stagePercent([F("18"), F("16.35"), F("24"), F("22")], F("100"))!;
    expect(formatFixed(tech)).toBe("80.3500");
    expect(passes(shownFigure(tech, 2)!, F("70"), true)).toEqual({ passed: true });
    const fin = stagePercent([F("55"), F("37")], F("100"))!;
    expect(formatFixed(fin)).toBe("92.0000");
    expect(passes(fin, F("60"), true)).toEqual({ passed: true });
    const comp = composite([{ percent: tech, weight: F("60") }, { percent: fin, weight: F("40") }]);
    expect(formatFixed(shownFigure(comp, 2)!, 2)).toBe("85.01");
    expect(passes(shownFigure(comp, 2)!, F("60"), true)).toEqual({ passed: true });
  });
  it("technical 69.99 fails stage 3, though the composite would pass: out of the running", () => {
    const tech = F("69.99");
    expect(passes(shownFigure(tech, 2)!, F("70"), true)).toEqual({ passed: false });
    const comp = composite([{ percent: tech, weight: F("60") }, { percent: F("92"), weight: F("40") }]);
    expect(passes(shownFigure(comp, 2)!, F("60"), true)).toEqual({ passed: true });
  });
  it("the figure judged is the figure shown: 69.995 shows 70.00 at two places and passes; at four places it fails", () => {
    expect(passes(shownFigure(F("69.995"), 2)!, F("70"), true)).toEqual({ passed: true });
    expect(passes(shownFigure(F("69.995"), 4)!, F("70"), true)).toEqual({ passed: false });
  });
  it("exactly on the mark: inclusive passes, exclusive fails, unset is not judged", () => {
    expect(passes(F("70"), F("70"), true)).toEqual({ passed: true });
    expect(passes(F("70"), F("70"), false)).toEqual({ passed: false });
    expect(passes(F("70"), F("70"), null)).toEqual({ fault: { code: "PASS_RULE_NOT_SET", level: "block" } });
    expect(passes(F("10"), null, null)).toEqual({ passed: true });
  });
  it("a score above its maximum is refused, never capped; places unset show nothing", () => {
    expect(markFault(F("20.01"), F("20"))?.code).toBe("ABOVE_MAX");
    expect(markFault(F("-1"), F("20"))?.code).toBe("NEGATIVE");
    expect(markFault(F("20"), F("20"))).toBeNull();
    expect(shownFigure(F("1"), null)).toBeNull();
    expect(stagePercent([F("1")], null)).toBeNull();
  });
});

describe("financial.ts: the minimum-capital test", () => {
  it("10 % of 1,077,508.60 = 107,750.86 (tender, base the tender amount)", () => {
    expect(minimumCapital(RM("1077508.60"), F("10"))).toBe(RM("107750.86"));
  });
  it("estimate 330,000.00 × 3 % = 9,900.00; × 5 % = 16,500.00", () => {
    expect(minimumCapital(RM("330000.00"), F("3"))).toBe(RM("9900.00"));
    expect(minimumCapital(RM("330000.00"), F("5"))).toBe(RM("16500.00"));
  });
  it("balances 10,000.00 / 12,000.00 / 14,000.01 average 12,000.00, half up to the sen", () => {
    expect(averageBalance(RM("10000.00"), RM("12000.00"), RM("14000.01"))).toBe(RM("12000.00"));
    expect(averageBalance(RM("0.01"), RM("0.01"), RM("0.00"))).toBe(RM("0.01"));
  });
  it("the ratio is the average as a percentage of the base; 12 % falls in the written gap; 2.9 % at 3 % is Gagal", () => {
    expect(formatFixed(capitalRatio(RM("12000.00"), RM("330000.00"))!)).toBe("3.6364");
    expect(label(capitalBand(F("12"), F("3"), fasa3))).toBe("NOT_BANDED");
    expect(label(capitalBand(F("2.9"), F("3"), fasa3))).toBe("Gagal");
    // At 5 % the same capital is below the minimum: 12,000.00 < 16,500.00.
    expect(label(capitalBand(capitalRatio(RM("12000.00"), RM("330000.00"))!, F("5"), fasa3))).toBe("Gagal");
    expect(capitalRatio(RM("1"), 0n)).toBeNull();
  });
  it("the company estimate is a base only once disclosed", () => {
    expect(capitalBase("COMPANY_ESTIMATE", RM("1"), { sealed: true })).toEqual({ fault: "ESTIMATE_SEALED" });
    expect(capitalBase("COMPANY_ESTIMATE", RM("1"), { notRequired: true })).toEqual({ fault: "ESTIMATE_NOT_AVAILABLE" });
    expect(capitalBase("COMPANY_ESTIMATE", RM("1"), { value: RM("330000.00") })).toEqual({ base: RM("330000.00") });
    expect(capitalBase("TENDER_AMOUNT", RM("1077508.60"), { sealed: true })).toEqual({ base: RM("1077508.60") });
    expect(capitalBase(null, RM("1"), { sealed: true })).toEqual({ fault: "BASE_NOT_SET" });
  });
});

describe("commercial.ts: variances", () => {
  it("estimate 330,000.00: 280,500.00 → −15.0000 %; 379,500.00 → +15.0000 %", () => {
    const v = variance(RM("280500.00"), RM("330000.00"));
    expect(v.difference).toBe(RM("-49500.00"));
    expect(formatFixed(v.pct!)).toBe("-15.0000");
    expect(formatFixed(variance(RM("379500.00"), RM("330000.00")).pct!)).toBe("15.0000");
    expect(formatFixed(variance(RM("280499.99"), RM("330000.00")).pct!)).toBe("-15.0000");
    expect(formatFixed(variance(RM("379500.01"), RM("330000.00")).pct!)).toBe("15.0000");
  });
  it("against the lowest: lowest 280,500.00, a bid of 300,000.00 → +19,500.00, +6.9519 %", () => {
    const lowest = lowestPrice([RM("300000.00"), RM("280500.00"), RM("310000.00")])!;
    expect(lowest).toBe(RM("280500.00"));
    const v = variance(RM("300000.00"), lowest);
    expect(v.difference).toBe(RM("19500.00"));
    expect(formatFixed(v.pct!)).toBe("6.9519");
    expect(lowestPrice([])).toBeNull();
  });
});

describe("cpr.ts: the contractor performance percentage (OD-4)", () => {
  it("half-open bands: 79.5 Baik, 80 Terbaik, 39.99 Gagal; no bands set, nothing banded", () => {
    const l = (r: ReturnType<typeof cprBand>) => ("fault" in r ? r.fault.code : r.placed ? r.band.labelEn : r.reason);
    expect(l(cprBand(F("79.5"), cprBands))).toBe("Baik");
    expect(l(cprBand(F("80"), cprBands))).toBe("Terbaik");
    expect(l(cprBand(F("39.99"), cprBands))).toBe("Gagal");
    expect(l(cprBand(F("50"), null))).toBe("BANDS_NOT_SET");
    expect(l(cprBand(null, cprBands))).toBe("CPR_NOT_ENTERED");
  });
  it("an entered value with no live report attached is refused, and the screen says where it came from", () => {
    expect(cprEntryFaults(F("85"), 0).map((f) => f.code)).toEqual(["CPR_EVIDENCE_REQUIRED"]);
    expect(cprEntryFaults(F("85"), 1)).toEqual([]);
    expect(cprEntryFaults(F("100.0001"), 1).map((f) => f.code)).toEqual(["CPR_RANGE"]);
    expect(CPR_SOURCE_TEXT).toMatch(/performance register is not built/);
  });
});

describe("ceiling.ts: a quotation bid above the exercise's own ceiling (FR-EVL-019)", () => {
  const B = RM("300000.00");
  it("operator GT: the boundary itself is evaluated, a sen above is excluded", () => {
    expect(ceilingExclusion(RM("300000.00"), { regime: "quotation", boundary: B, operator: "GT" })).toEqual({ excluded: false });
    expect(ceilingExclusion(RM("300000.01"), { regime: "quotation", boundary: B, operator: "GT" })).toEqual({ excluded: true, boundary: B, operator: "GT" });
  });
  it("operator GTE: the boundary itself is excluded", () => {
    expect(ceilingExclusion(RM("300000.00"), { regime: "quotation", boundary: B, operator: "GTE" })).toEqual({ excluded: true, boundary: B, operator: "GTE" });
    expect(ceilingExclusion(RM("299999.99"), { regime: "quotation", boundary: B, operator: "GTE" })).toEqual({ excluded: false });
  });
  it("a tender is never excluded; a quotation whose boundary was never recorded is not judged", () => {
    expect(ceilingExclusion(RM("9000000.00"), { regime: "tender", boundary: B, operator: "GT" })).toEqual({ excluded: false });
    expect(ceilingExclusion(RM("1.00"), { regime: "quotation", boundary: null, operator: "GT" })).toEqual({ fault: { code: "BOUNDARY_NOT_RECORDED", level: "block" } });
  });
  it("the regime ceiling is never a literal in the evaluation code (grep)", () => {
    const dir = join(process.cwd(), "src/lib/evaluation");
    const bad = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && /300[,_]?000/.test(readFileSync(join(dir, f), "utf8")));
    expect(bad).toEqual([]);
  });
});

describe("saving.ts (FR-EVL-018)", () => {
  it("330,000.00 against 297,000.00: 33,000.00, 10.0000 %", () => {
    const s = saving({ value: RM("330000.00"), label: null }, RM("297000.00"));
    expect(s).toEqual({ amount: RM("33000.00"), pct: F("10") });
  });
  it("a sealed estimate says so; none required, no saving is stated", () => {
    expect(saving({ sealed: true }, RM("1.00"))).toEqual({ sealed: true });
    expect(saving({ notRequired: true }, RM("1.00"))).toEqual({ noEstimate: true });
  });
  it("the estimate is read from the frozen schedule's benchmark only, never guessed", () => {
    expect(estimateFromSchedule({ benchmark: { sealed: false, label: "Anggaran Syarikat", companyEstimate: "330000.00" } })).toEqual({ value: RM("330000.00"), label: "Anggaran Syarikat" });
    expect(estimateFromSchedule({ benchmark: { notRequired: true } })).toEqual({ notRequired: true });
    expect(estimateFromSchedule({ benchmark: { sealed: true } })).toEqual({ sealed: true });
    expect(estimateFromSchedule({ benchmark: { sealed: false, companyEstimate: "1e5" } })).toEqual({ sealed: true });
    expect(estimateFromSchedule(null)).toEqual({ sealed: true });
  });
});
