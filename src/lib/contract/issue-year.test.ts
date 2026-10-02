import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";

import { CONTRACT_YEAR_WORDS, contractYearReading, issueDayOf, issueYearOf } from "./issue-year";

/**
 * 6.12 review S-1 (FR-CON-002): the issue year is the organisation's day of issue, never digits read out of
 * the number. A finance officer can check each case: the number, the day it was issued, the year shown.
 */

describe("the year a contract number was issued in", () => {
  it("XI202600799, a work indent's own number issued on 16 Sep 2026, was issued in 2026 (not 0799)", () => {
    const r = contractYearReading({ numberSource: "INDENT_NUMBER", numberedOn: dayToDate("2026-09-16"), contractDate: dayToDate("2026-09-30") });
    expect(r.issueYear).toBe(2026);
    // Not a series number: the screen gives no "year in the number" reading for it.
    expect(r.seriesNumber).toBe(false);
    expect(r.yearsDiffer).toBe(false);
  });

  it("an issue act at 23:30 UTC on 31 December is 1 January in Kuala Lumpur: the number is issued in the new year", () => {
    const at = new Date("2026-12-31T23:30:00.000Z");
    const day = issueDayOf(at, "Asia/Kuala_Lumpur");
    expect(day).toBe("2027-01-01");
    // The issue act stores that day (midnight UTC); read back, it is 2027 whatever zone reads it.
    expect(issueYearOf(dayToDate(day!))).toBe(2027);
  });

  it("the same instant is still 31 December in New York: issued in 2026 there", () => {
    const day = issueDayOf(new Date("2026-12-31T23:30:00.000Z"), "America/New_York");
    expect(day).toBe("2026-12-31");
    expect(issueYearOf(dayToDate(day!))).toBe(2026);
  });

  it("a stored day is never shifted by a zone west of UTC (68-C5): 1 January stays 2027", () => {
    expect(issueYearOf(dayToDate("2027-01-01"))).toBe(2027);
  });

  it("no time zone, no issue day: never UTC's", () => {
    expect(issueDayOf(new Date("2026-12-31T23:30:00.000Z"), null)).toBeNull();
  });

  it("December / January: a series number issued on 30 Dec 2026, signed on 4 Jan 2027, is flagged", () => {
    const r = contractYearReading({ numberSource: "SERIES", numberedOn: dayToDate("2026-12-30"), contractDate: dayToDate("2027-01-04") });
    expect(r).toEqual({ issueYear: 2026, seriesNumber: true, contractDateYear: 2027, yearsDiffer: true });
    expect(CONTRACT_YEAR_WORDS.differs(r.issueYear, r.contractDateYear!).en).toBe("The number was issued in 2026 and carries that year, but the Contract Date is in 2027.");
  });

  it("a series number signed in its issue year is not flagged; nor is one not yet signed", () => {
    expect(contractYearReading({ numberSource: "SERIES", numberedOn: dayToDate("2026-09-17"), contractDate: dayToDate("2026-12-31") }).yearsDiffer).toBe(false);
    expect(contractYearReading({ numberSource: "SERIES", numberedOn: dayToDate("2026-12-30"), contractDate: null }).yearsDiffer).toBe(false);
  });

  it("a work indent issued in December and signed in January is not flagged: its number states no issue year", () => {
    expect(contractYearReading({ numberSource: "INDENT_NUMBER", numberedOn: dayToDate("2026-12-30"), contractDate: dayToDate("2027-01-04") }).yearsDiffer).toBe(false);
  });

  it("the words are in English and Malay and name the year", () => {
    const s = CONTRACT_YEAR_WORDS.series(2026);
    expect(s.en).toContain("issued, 2026");
    expect(s.ms).toContain("2026");
  });

  it("the contract's screen reads the year from here, never from the number's digits", () => {
    const page = readFileSync(path.join(__dirname, "../../app/projects/[id]/page.tsx"), "utf8");
    expect(page).toContain("contractYearReading(");
    expect(page).not.toMatch(/exec\(c\.number\)|c\.number\.(match|slice|substring)/);
  });
});
