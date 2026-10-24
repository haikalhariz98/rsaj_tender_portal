/**
 * The financial year the Dashboard counts in, from the organisation's budget periods (DB-5). Pure.
 *
 * A year with no periods is NOT_SET: the calendar year is never quietly assumed (the three-state rule), so year-bound figures
 * say "Financial year not set" instead of counting January to December.
 */

import { storedDay } from "@/lib/dates";
import { periodsIn, type Period } from "@/lib/budget/periods";

export type FinancialYear =
  /// `from` is the earliest period's first day; `to` the latest period's `endsOn`, exclusive as every period's is. Both YYYY-MM-DD.
  | { state: "SET"; year: number; from: string; to: string; periods: Period[] }
  | { state: "NOT_SET"; year: number | null };

export function financialYear(periods: readonly Period[], year: number | null): FinancialYear {
  const mine = year == null ? [] : periodsIn(periods, year);
  if (year == null || mine.length === 0) return { state: "NOT_SET", year };
  const starts = mine.map((p) => storedDay(p.startsOn)).sort();
  const ends = mine.map((p) => storedDay(p.endsOn)).sort();
  return { state: "SET", year, from: starts[0], to: ends[ends.length - 1], periods: mine };
}

/// Whether an organisation day (YYYY-MM-DD) falls in the year: on or after `from`, before `to`.
export const inYear = (fy: { from: string; to: string }, day: string): boolean => fy.from <= day && day < fy.to;
