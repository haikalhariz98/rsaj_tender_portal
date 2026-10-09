import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { formatSen, parseSen } from "@/lib/money";
import { bqTotals } from "@/lib/scope/bq";
import type { BqLine } from "@/lib/scope/types";

import { APPENDIX_GROUP_FIELDS, appendixComplete, appendixFieldErrors, appendixFaults, appendixGroupFields, awardTermsFrom, EMPTY_APPENDIX, firstInterimMinimum, insurancePeriodEnd, ladDaily, ladSuggestion, worksInsuredSum, type AppendixFacts } from "./appendix";
import { formatPct, parsePct, pctOf } from "./percent";

const sen = parseSen;
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

/**
 * The spec's worked examples (RSAJ figures, test fixtures only — X-10 d), for a finance
 * reader to check by hand. Each figure is rounded once, half up to the sen.
 *
 *  §8.3  First interim certificate minimum = the lesser of the floor and a percentage of
 *        the builders' works value (BWV):
 *          BWV RM293,473.70 (6.2's worked bill: 317,973.70 − 18,000.00 − 6,500.00)
 *            10% = RM29,347.37; floor RM1,000.00 → RM1,000.00
 *          BWV RM8,500.00
 *            10% = RM850.00;    floor RM1,000.00 → RM850.00
 *
 *  §8.6  LAD 0.025% a day of RM1,077,508.60 = 1,077,508.60 × 0.025 ÷ 100
 *        = RM269.37715 → RM269.38 a day.
 *
 *  §8.10 Works insured sum = RM1,077,508.60 + 10% (RM107,750.86) = RM1,185,259.46.
 *        Insurance runs from 2027-01-04 through 12 months' completion, 12 months' DLP
 *        and 3 months 14 days beyond: 27 months to 2029-04-04, plus 14 days → 2029-04-18.
 */

const workedBill: BqLine[] = [
  { itemRef: "A", description: "Preliminaries", unit: "item", kind: "MEASURED", quantity: "1", rate: sen("45000.00"), provisional: false },
  { itemRef: "B", description: "Pipe laying", unit: "m", kind: "MEASURED", quantity: "1250.5", rate: sen("182.40"), provisional: false },
  { itemRef: "C", description: "Excavation under road", unit: "m3", kind: "MEASURED", quantity: "310", rate: sen("65.75"), provisional: true },
  { itemRef: "D", description: "Prime cost sum", unit: "sum", kind: "PRIME_COST_SUM", quantity: "1", rate: sen("18000.00"), provisional: false },
  { itemRef: "E", description: "Provisional sum", unit: "sum", kind: "PROVISIONAL_SUM", quantity: "1", rate: sen("6500.00"), provisional: false },
];
const FIRST_CERT = { floor: sen("1000.00"), pct: "10" };

describe("§8.3: the first interim certificate's minimum", () => {
  it("BWV RM293,473.70 at RM1,000.00 / 10% gives RM1,000.00", () => {
    const bwv = bqTotals(workedBill, null).buildersWorks;
    expect(formatSen(bwv)).toBe("RM293,473.70");
    expect(firstInterimMinimum(bwv, FIRST_CERT)).toBe(sen("1000.00"));
  });
  it("BWV RM8,500.00 gives RM850.00", () => {
    expect(firstInterimMinimum(sen("8500.00"), FIRST_CERT)).toBe(sen("850.00"));
  });
  it("exactly at the floor's share (RM10,000.00 × 10% = RM1,000.00) gives the floor, either way", () => {
    expect(firstInterimMinimum(sen("10000.00"), FIRST_CERT)).toBe(sen("1000.00"));
    expect(firstInterimMinimum(sen("10000.01"), FIRST_CERT)).toBe(sen("1000.00"));
    expect(firstInterimMinimum(sen("9999.99"), FIRST_CERT)).toBe(sen("1000.00"));
    expect(firstInterimMinimum(sen("9999.94"), FIRST_CERT)).toBe(sen("999.99"));
  });
  it("either half of the policy unset is not set, never a default", () => {
    expect(firstInterimMinimum(sen("8500.00"), { floor: null, pct: "10" })).toBe("NOT_SET");
    expect(firstInterimMinimum(sen("8500.00"), { floor: sen("1000.00"), pct: null })).toBe("NOT_SET");
  });
});

describe("§8.6: LAD a day (Q-6)", () => {
  it("0.025% of RM1,077,508.60 is RM269.377…, stated as RM269.38", () => {
    expect(pctOf(sen("1077508.60"), "0.025")).toBe(sen("269.38"));
    expect(ladDaily({ ladKind: "PERCENT_OF_SUM_PER_DAY", ladAmount: null, ladPct: "0.025" }, sen("1077508.60"))).toEqual({ kind: "PERCENT", pct: "0.025", sen: sen("269.38") });
  });
  it("a percentage with no contract sum is fixed at award, never figured against an estimate", () => {
    expect(ladDaily({ ladKind: "PERCENT_OF_SUM_PER_DAY", ladAmount: null, ladPct: "0.025" }, null)).toEqual({ kind: "PERCENT", pct: "0.025", sen: null });
  });
  it("an amount a day is that amount", () => {
    expect(ladDaily({ ladKind: "AMOUNT_PER_DAY", ladAmount: sen("500.00"), ladPct: null }, null)).toEqual({ kind: "AMOUNT", sen: sen("500.00") });
  });
  it("unset is not set", () => {
    expect(ladDaily({ ladKind: null, ladAmount: null, ladPct: null }, sen("1.00"))).toEqual({ kind: "NOT_SET" });
    expect(ladDaily({ ladKind: "AMOUNT_PER_DAY", ladAmount: null, ladPct: null }, sen("1.00"))).toEqual({ kind: "NOT_SET" });
  });
  it("the policy's suggestion needs a rate and a sum", () => {
    expect(ladSuggestion("0.025", sen("1077508.60"))).toEqual({ pct: "0.025", sen: sen("269.38") });
    expect(ladSuggestion(null, sen("1077508.60"))).toBe("NOT_SET");
    expect(ladSuggestion("0.025", null)).toBe("SUM_NOT_KNOWN");
  });
  it("half up to the sen, at the half and either side of it", () => {
    // 2.00 × 0.25% = 0.005 → 0.01; 1.00 × 0.25% = 0.0025 → 0.00.
    expect(pctOf(sen("2.00"), "0.25")).toBe(1n);
    expect(pctOf(sen("1.00"), "0.25")).toBe(0n);
    expect(pctOf(sen("1.98"), "0.25")).toBe(0n);
  });
  it("the prototype's 0.1% default and 10% cap appear in no source file (§8.6)", () => {
    const root = join(process.cwd(), "src/lib/tender-docs");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    for (const f of walk(root).filter((p) => !/\.test\.ts$/.test(p))) {
      const text = readFileSync(f, "utf8");
      expect(text, relative(root, f)).not.toMatch(/0\.1\s*%|\b0\.001\b|lad.{0,20}cap|cap.{0,20}10\s*%/i);
    }
  });
});

describe("§8.10: insurance", () => {
  it("works insured sum: RM1,077,508.60 + 10% = RM1,185,259.46", () => {
    expect(worksInsuredSum(sen("1077508.60"), { kind: "PERCENT", amount: null, pct: "10" })).toBe(sen("1185259.46"));
  });
  it("an amount uplift adds the amount; unset is not set", () => {
    expect(worksInsuredSum(sen("1000.00"), { kind: "AMOUNT", amount: sen("50.00"), pct: null })).toBe(sen("1050.00"));
    expect(worksInsuredSum(sen("1000.00"), { kind: null, amount: null, pct: null })).toBe("NOT_SET");
  });
  const policy = { extraMonths: 3, extraDays: 14, dbExtraMonths: null, dbExtraDays: null };
  it("from 2027-01-04, 12 + 12 months and 3 months 14 days beyond: 2029-04-18", () => {
    expect(insurancePeriodEnd("2027-01-04", 12, 12, policy, false)).toBe("2029-04-18");
  });
  it("the tail unset is not set, for design and build as for any contract", () => {
    expect(insurancePeriodEnd("2027-01-04", 12, 12, { extraMonths: null, extraDays: null, dbExtraMonths: null, dbExtraDays: null }, false)).toBe("NOT_SET");
    expect(insurancePeriodEnd("2027-01-04", 12, 12, policy, true)).toBe("NOT_SET");
  });
  it("months are summed and added once, clamped at the month's end, then days", () => {
    // 31 January + 1 month = 28 February (2027 is not a leap year), then + 1 day.
    expect(insurancePeriodEnd("2027-01-31", 1, null, { extraMonths: 0, extraDays: 1, dbExtraMonths: null, dbExtraDays: null }, false)).toBe("2027-03-01");
  });
});

const complete: AppendixFacts = {
  status: "DRAFT",
  ladOfficerRoleCode: "HOD_CP",
  eotOfficerRoleCode: "HOD_CP",
  terminationOfficerRoleCode: "CEO",
  warRiskOfficerRoleCode: "CEO",
  arbitrationOfficerRoleCode: "CEO",
  variationLimits: [{ label: "Head of Contract & Procurement", roleCode: "HOD_CP", committeeCode: null, limit: sen("50000.00") }],
  pcSumWorksApply: false,
  pcSumWorksText: "",
  tplMinimum: sen("1000000.00"),
  wcMinimum: sen("500000.00"),
  worksInsuranceUpliftKind: "PERCENT",
  worksInsuranceUpliftAmount: null,
  worksInsuranceUpliftPct: "10",
  insuranceExcess: sen("10000.00"),
  ladKind: "PERCENT_OF_SUM_PER_DAY",
  ladAmount: null,
  ladPct: "0.025",
  sectionalCompletion: false,
  sections: [],
  dlpApplies: true,
  dlpMonths: 12,
  firstInterimMinimum: sen("1000.00"),
  subsequentInterimMinimum: sen("1000.00"),
  honourCertificateDays: 30,
};

describe("FR-DOC-004: an Appendix incomplete blocks, naming each field", () => {
  it("an empty Appendix names every field it needs", () => {
    const f = appendixFaults(EMPTY_APPENDIX);
    expect(f.every((x) => x.level === "block")).toBe(true);
    expect(f.filter((x) => x.code === "FIELD_NOT_SET").map((x) => x.data?.field)).toEqual([
      "Officer empowered on damages for non-completion",
      "Officer empowered on delay and extension of time",
      "Officer empowered on termination",
      "Officer empowered on war or earthquake",
      "Officer empowered on arbitration",
      "Variation limits",
      "Work in prime cost sums the contractor may tender for",
      "Minimum third-party liability insurance",
      "Minimum workmen's compensation insurance",
      "Uplift to the contract sum for works insurance",
      "Permitted insurance excess",
      "How liquidated damages are stated",
      "Sectional completion",
      "Defects liability period",
      "Minimum value of work for the first interim certificate",
      "Minimum value of work for later interim certificates",
      "Days to honour an interim certificate",
    ]);
    expect(appendixComplete(EMPTY_APPENDIX)).toBe(false);
  });

  it("a complete Appendix has nothing blocking", () => {
    expect(appendixFaults(complete)).toEqual([]);
    expect(appendixComplete(complete)).toBe(true);
  });

  it("a kind chosen without its value names the value", () => {
    expect(appendixFaults({ ...complete, ladKind: "AMOUNT_PER_DAY", ladPct: null, ladAmount: null }).map((f) => f.data?.field)).toEqual(["Liquidated damages a day"]);
    expect(appendixFaults({ ...complete, ladPct: null }).map((f) => f.data?.field)).toEqual(["Liquidated damages, percentage of the contract sum a day"]);
    expect(appendixFaults({ ...complete, ladPct: "0.0250001" }).map((f) => f.code)).toEqual(["FIELD_NOT_VALID"]);
    expect(appendixFaults({ ...complete, worksInsuranceUpliftPct: null }).map((f) => f.data?.field)).toEqual(["Works insurance uplift percentage"]);
  });

  it("a DLP that applies needs its months; one that does not takes none", () => {
    expect(appendixFaults({ ...complete, dlpMonths: null }).map((f) => f.data?.field)).toEqual(["Defects liability period, months"]);
    expect(codes(appendixFaults({ ...complete, dlpApplies: false }))).toEqual(["DLP_MONTHS_NOT_EXPECTED"]);
    expect(appendixFaults({ ...complete, dlpApplies: false, dlpMonths: null })).toEqual([]);
  });

  it("sectional completion needs its sections, each with its LAD", () => {
    expect(codes(appendixFaults({ ...complete, sectionalCompletion: true }))).toEqual(["SECTIONS_REQUIRED"]);
    expect(appendixFaults({ ...complete, sectionalCompletion: true, sections: [{ description: "Reservoir", ladKind: "AMOUNT_PER_DAY", ladAmount: null, ladPct: null }] })).toEqual([
      { code: "SECTION_LAD_NOT_SET", level: "block", data: { section: "Reservoir" } },
    ]);
    expect(codes(appendixFaults({ ...complete, sections: [{ description: "Reservoir", ladKind: "AMOUNT_PER_DAY", ladAmount: sen("100.00"), ladPct: null }] }))).toEqual(["SECTIONS_NOT_EXPECTED"]);
  });

  it("prime cost sum work that applies says what it is; a variation limit names its limit", () => {
    expect(codes(appendixFaults({ ...complete, pcSumWorksApply: true }))).toEqual(["PC_SUM_TEXT_REQUIRED"]);
    expect(appendixFaults({ ...complete, variationLimits: [{ label: "Tender Board", roleCode: null, committeeCode: "TB", limit: null }] })).toEqual([
      { code: "VARIATION_LIMIT_NOT_SET", level: "block", data: { holder: "Tender Board" } },
    ]);
  });

  it("the award reads its terms from the Appendix (Q-1)", () => {
    expect(awardTermsFrom(complete)).toMatchObject({ ladKind: "PERCENT_OF_SUM_PER_DAY", ladPct: "0.025", dlpApplies: true, dlpMonths: 12 });
  });
});

describe("percentages to six places, exactly", () => {
  it("reads and prints them without a float", () => {
    expect(parsePct("0.025")).toBe(25000n);
    expect(parsePct("10")).toBe(10_000_000n);
    expect(formatPct("0.025000")).toBe("0.025%");
    expect(formatPct("10")).toBe("10%");
    expect(() => parsePct("-1")).toThrow();
    expect(() => parsePct("0.0000001")).toThrow();
  });
});

// SR-12: Save names each required field left empty, and asks for a conditional one only under its answer.
describe("appendixFieldErrors (SR-12)", () => {
  it("names every empty field of a card, one message each", () => {
    const e = appendixFieldErrors(EMPTY_APPENDIX, appendixGroupFields("officers"));
    expect(Object.keys(e).sort()).toEqual([...APPENDIX_GROUP_FIELDS.officers].sort());
  });
  it("asks for the amount only when the uplift is an amount, and the percentage only when it is a percentage", () => {
    const base = { ...EMPTY_APPENDIX, tplMinimum: 1n as never, wcMinimum: 1n as never, insuranceExcess: 1n as never };
    expect(Object.keys(appendixFieldErrors({ ...base, worksInsuranceUpliftKind: "AMOUNT" }, appendixGroupFields("insurance")))).toEqual(["worksInsuranceUpliftAmount"]);
    expect(Object.keys(appendixFieldErrors({ ...base, worksInsuranceUpliftKind: "PERCENT" }, appendixGroupFields("insurance")))).toEqual(["worksInsuranceUpliftPct"]);
  });
  it("asks for months only when a defects liability period applies, and the work only when prime cost sums apply", () => {
    expect(Object.keys(appendixFieldErrors({ ...EMPTY_APPENDIX, dlpApplies: false }, appendixGroupFields("dlp")))).toEqual([]);
    expect(Object.keys(appendixFieldErrors({ ...EMPTY_APPENDIX, dlpApplies: true }, appendixGroupFields("dlp")))).toEqual(["dlpMonths"]);
    expect(Object.keys(appendixFieldErrors({ ...EMPTY_APPENDIX, pcSumWorksApply: true }, appendixGroupFields("pc")))).toEqual(["pcSumWorksText"]);
  });
  it("only asks about the fields it is given", () => {
    expect(appendixFieldErrors(EMPTY_APPENDIX, [])).toEqual({});
  });
});
