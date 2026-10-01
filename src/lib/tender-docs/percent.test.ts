import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EMPTY_APPENDIX, appendixFaults } from "./appendix";
import { policyFaults, policyFaultText } from "./config";
import { isPct, PCT_COLUMN, pctFault, pctHint, pctRefusal } from "./percent";

/**
 * Each percentage is judged against the column it is stored in. Before, every field took
 * six places with no bound: a works insurance uplift or first-certificate percentage with
 * five or six places (Decimal(9,4)) was rounded on save without a word, and a liquidated
 * damages rate of 1,000 or more (Decimal(9,6)) overflowed the column and failed the save.
 */

describe("each field's column is the one the schema declares", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const model = (name: string) => schema.slice(schema.indexOf(`model ${name} {`), schema.indexOf("\n}", schema.indexOf(`model ${name} {`)));
  const declared = (modelName: string, column: string) => {
    const m = new RegExp(`\\n\\s*${column}\\s+Decimal\\?\\s+@db\\.Decimal\\((\\d+),\\s*(\\d+)\\)`).exec(model(modelName));
    if (!m) throw new Error(`${modelName}.${column} not found`);
    return { places: Number(m[2]), wholeDigits: Number(m[1]) - Number(m[2]) };
  };
  it.each([
    ["ConditionsAppendix", "ladPct", PCT_COLUMN.ladPct],
    ["AppendixSection", "ladPct", PCT_COLUMN.sectionLadPct],
    ["ConditionsAppendix", "worksInsuranceUpliftPct", PCT_COLUMN.worksInsuranceUpliftPct],
    ["TenderDocumentPolicy", "ladDailyPct", PCT_COLUMN.ladDailyPct],
    ["TenderDocumentPolicy", "firstCertificatePct", PCT_COLUMN.firstCertificatePct],
  ])("%s.%s", (modelName, column, expected) => {
    expect(declared(modelName, column)).toEqual(expected);
  });
});

describe("a percentage within its column: places and upper bound, each boundary", () => {
  it("Decimal(9,6): six places, below 1,000", () => {
    const c = PCT_COLUMN.ladPct;
    expect(pctFault("0.025", c)).toBeNull();
    expect(pctFault("0.000001", c)).toBeNull();
    expect(pctFault("0.0000001", c)).toBe("TOO_MANY_PLACES");
    expect(pctFault("999.999999", c)).toBeNull();
    expect(pctFault("1000", c)).toBe("TOO_LARGE");
    expect(pctFault("1000.0", c)).toBe("TOO_LARGE");
    // Leading zeros are not whole digits.
    expect(pctFault("000999", c)).toBeNull();
  });
  it("Decimal(9,4): four places, below 100,000", () => {
    const c = PCT_COLUMN.worksInsuranceUpliftPct;
    expect(pctFault("10.1234", c)).toBeNull();
    expect(pctFault("10.12345", c)).toBe("TOO_MANY_PLACES");
    expect(pctFault("10.123456", c)).toBe("TOO_MANY_PLACES");
    expect(pctFault("99999.9999", c)).toBeNull();
    expect(pctFault("100000", c)).toBe("TOO_LARGE");
    expect(pctFault("10.12345", PCT_COLUMN.firstCertificatePct)).toBe("TOO_MANY_PLACES");
  });
  it("not negative, not words", () => {
    for (const bad of ["-1", "ten", "1e3", "", "1.", ".5"]) expect(pctFault(bad, PCT_COLUMN.ladPct), bad).toBe("NOT_A_PERCENTAGE");
  });
  it("isPct with a column applies it; without one it reads any stored value to six places", () => {
    expect(isPct("1000", PCT_COLUMN.ladPct)).toBe(false);
    expect(isPct("1000")).toBe(true);
    expect(isPct("10.12345", PCT_COLUMN.worksInsuranceUpliftPct)).toBe(false);
    expect(isPct("10.12345")).toBe(true);
  });
});

describe("fixed refusal texts, by the field's label and column", () => {
  it("names the bound and the places", () => {
    expect(pctRefusal("Liquidated damages", PCT_COLUMN.ladPct)).toBe("Liquidated damages must be a percentage below 1,000, with at most 6 decimal places.");
    expect(pctRefusal("Works insurance uplift", PCT_COLUMN.worksInsuranceUpliftPct)).toBe("Works insurance uplift must be a percentage below 100,000, with at most 4 decimal places.");
    expect(pctHint(PCT_COLUMN.worksInsuranceUpliftPct)).toBe("Up to four decimal places, below 100,000.");
    expect(pctHint(PCT_COLUMN.ladDailyPct)).toBe("Up to six decimal places, below 1,000.");
  });
  it("the policy's percentages are refused by their own column, with their own text", () => {
    const none = { ladDailyPct: null, ladDailyPctProvenance: null, firstCertificateFloor: null, firstCertificatePct: null, firstCertificateProvenance: null, insuranceExtraMonths: null, insuranceExtraDays: null, insuranceExtraProvenance: null, dbInsuranceExtraMonths: null, dbInsuranceExtraDays: null, dbInsuranceExtraProvenance: null };
    const lad = policyFaults({ ...none, ladDailyPct: "1000", ladDailyPctProvenance: "ASSUMED" });
    expect(lad.map((f) => [f.code, f.data?.field])).toEqual([["PCT_NOT_VALID", "ladDailyPct"]]);
    expect(policyFaultText(lad[0])).toBe("The liquidated damages rate must be a percentage below 1,000, with at most 6 decimal places.");
    const first = policyFaults({ ...none, firstCertificateFloor: "1000.00", firstCertificatePct: "10.12345", firstCertificateProvenance: "ASSUMED" });
    expect(first.map((f) => [f.code, f.data?.field])).toEqual([["PCT_NOT_VALID", "firstCertificatePct"]]);
    expect(policyFaultText(first[0])).toBe("The first certificate's percentage must be a percentage below 100,000, with at most 4 decimal places.");
    expect(policyFaults({ ...none, firstCertificateFloor: "1000.00", firstCertificatePct: "10.1234", firstCertificateProvenance: "ASSUMED" })).toEqual([]);
  });
  it("the Appendix finds a percentage its column cannot hold not valid", () => {
    const codes = (x: Parameters<typeof appendixFaults>[0]) => appendixFaults(x).filter((f) => f.code === "FIELD_NOT_VALID" || f.code === "SECTION_LAD_NOT_SET").map((f) => f.data?.field ?? f.data?.section);
    expect(codes({ ...EMPTY_APPENDIX, ladKind: "PERCENT_OF_SUM_PER_DAY", ladPct: "1000" })).toEqual(["Liquidated damages, percentage of the contract sum a day"]);
    expect(codes({ ...EMPTY_APPENDIX, worksInsuranceUpliftKind: "PERCENT", worksInsuranceUpliftPct: "10.12345" })).toEqual(["Works insurance uplift percentage"]);
    expect(codes({ ...EMPTY_APPENDIX, sectionalCompletion: true, sections: [{ description: "Roof", ladKind: "PERCENT_OF_SUM_PER_DAY", ladAmount: null, ladPct: "1000" }] })).toEqual(["Roof"]);
  });
});

describe("the Appendix's acts refuse by the column, never the six-place reader alone", () => {
  it("each percentage field is checked against its own column", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/actions.ts"), "utf8");
    expect(src).toMatch(/pctField\("worksInsuranceUpliftPct"/);
    expect(src).toMatch(/pctField\("ladPct"/);
    expect(src).toMatch(/isPct\(v, PCT_COLUMN\[name\]\)/);
    expect(src).toMatch(/isPct\(ladPct, PCT_COLUMN\.sectionLadPct\)/);
    expect(src).not.toMatch(/isPct\([^,()]+\)/);
  });
});
