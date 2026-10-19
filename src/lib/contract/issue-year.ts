/**
 * The year a contract number was issued in (FR-CON-002; 6.12 review S-1).
 *
 * The year is never read out of the number: a number drawn from a series carries the year of the issue
 * day by the series' format, and a work indent's own number (XI202600799) carries whatever the ERP gave
 * it, so its last four digits are a sequence, not a year. The year is the organisation's day the number
 * was issued on: `Contract.numberedOn`, which the award's issue act writes as the organisation's day of
 * its own server clock (stored, like every day, at midnight UTC). It is read back as that stored day,
 * never as an instant in a zone (68-C5: midnight UTC is the evening before west of UTC).
 *
 * Only a series number states its year as the issue year, so only a series number gets the reading
 * "the year in the number is the year it was issued"; and where its issue year is not the Contract
 * Date's year (issued in December, signed in January) the screen says so.
 */

import { dayOf, storedDay } from "@/lib/dates";

import { w, type Words } from "./labels";

/// The organisation's day the issue act's server instant falls on: what the issue act writes as numberedOn.
export const issueDayOf = (issueActAt: Date, timeZone: string | null): string | null => dayOf(issueActAt, timeZone);

/// The year of the organisation's issue day, read from the stored day (never from the number).
export const issueYearOf = (numberedOn: Date): number => Number(storedDay(numberedOn).slice(0, 4));

export interface ContractYearReading {
  /// The year of the organisation's day of issue.
  issueYear: number;
  /// Only a number drawn from a series carries the issue year by its format.
  seriesNumber: boolean;
  /// The Contract Date's year, where the contract is signed.
  contractDateYear: number | null;
  /// A series number whose issue year is not the Contract Date's year (FR-CON-002: December / January).
  yearsDiffer: boolean;
}

export function contractYearReading(c: { numberSource: string; numberedOn: Date; contractDate: Date | null }): ContractYearReading {
  const issueYear = issueYearOf(c.numberedOn);
  const seriesNumber = c.numberSource === "SERIES";
  const contractDateYear = c.contractDate ? Number(storedDay(c.contractDate).slice(0, 4)) : null;
  return { issueYear, seriesNumber, contractDateYear, yearsDiffer: seriesNumber && contractDateYear != null && contractDateYear !== issueYear };
}

/// What the screen says about the number's year, in both languages; nothing for a number not from a series.
export const CONTRACT_YEAR_WORDS = {
  /// Under a series number.
  series: (year: number): Words =>
    w(
      `The year in the number is the year it was issued, ${year} — assumed to be the year the contract starts, to be confirmed.`,
    ),
  /// Beside the Contract Date, where a series number was issued in another year.
  differs: (issueYear: number, contractYear: number): Words =>
    w(
      `The number was issued in ${issueYear} and carries that year, but the Contract Date is in ${contractYear}.`,
    ),
};
