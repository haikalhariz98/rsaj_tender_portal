/**
 * Budget periods, and what a year of them adds up to.
 *
 * Opening and closing are decisions, and both are recorded as the moment they were
 * taken. The status is read back from those two timestamps rather than stored as a
 * word, so a period cannot claim to be open on a year somebody closed.
 */

export interface Period {
  id: string;
  year: number;
  code: string;
  nameEn: string;
  nameMs: string | null;
  startsOn: Date;
  endsOn: Date;
  /// Null means nobody has opened it yet — not that it is shut.
  openedOn: Date | null;
  closedOn: Date | null;
  sortOrder: number;
}

/**
 * Three states, not two.
 *
 * A period nobody has opened is not a closed period: closing is an act with a date
 * and a person behind it, and rendering the two identically would claim a decision
 * nobody took.
 */
export type PeriodStatus = "OPEN" | "CLOSED" | "NOT_YET_OPEN";

export function periodStatus(period: Period): PeriodStatus {
  if (period.closedOn) return "CLOSED";
  return period.openedOn ? "OPEN" : "NOT_YET_OPEN";
}

/// What a year of periods amounts to.
export type YearStatus = "OPEN" | "CLOSED" | "IN_PLANNING";

export interface YearSummary {
  year: number;
  total: number;
  open: number;
  closed: number;
  status: YearStatus;
  /**
   * How far through the year is, as closed periods over all of them.
   *
   * Closed rather than open on purpose: a year with nothing open yet and a year with
   * everything shut are opposite ends, and counting the open ones puts them both at
   * nought. Null where the year has no periods at all.
   */
  closedPercent: number | null;
}

export function summariseYear(periods: readonly Period[], year: number): YearSummary {
  const mine = periods.filter((p) => p.year === year);
  const open = mine.filter((p) => periodStatus(p) === "OPEN").length;
  const closed = mine.filter((p) => periodStatus(p) === "CLOSED").length;

  const status: YearStatus =
    open > 0 ? "OPEN" : closed > 0 && closed === mine.length ? "CLOSED" : "IN_PLANNING";

  return {
    year,
    total: mine.length,
    open,
    closed,
    status,
    closedPercent: mine.length === 0 ? null : (closed / mine.length) * 100,
  };
}

/// Every year that has periods, in order.
export function yearsIn(periods: readonly Period[]): number[] {
  return [...new Set(periods.map((p) => p.year))].sort((a, b) => a - b);
}

/// The periods of one year, in the order the customer put them.
export function periodsIn(periods: readonly Period[], year: number): Period[] {
  return periods
    .filter((p) => p.year === year)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

/**
 * Which year a screen should land on when nobody has asked for one.
 *
 * The one with something open, else the latest that has been planned. Never a
 * hard-coded year, and never today's — a customer mid-way through closing last year
 * should not have to go looking for it.
 */
export function defaultYear(periods: readonly Period[]): number | null {
  const years = yearsIn(periods);
  if (years.length === 0) return null;
  const open = years.find((y) => summariseYear(periods, y).status === "OPEN");
  return open ?? years[years.length - 1];
}

/**
 * Why a period cannot be closed, if it cannot.
 *
 * Reported rather than repaired: whether a period with movements still landing should
 * be closed is the customer's call, not the portal's.
 */
export type CloseRefusal = "ALREADY_CLOSED" | "NEVER_OPENED";

export function refusalToClose(period: Period): CloseRefusal | null {
  if (period.closedOn) return "ALREADY_CLOSED";
  if (!period.openedOn) return "NEVER_OPENED";
  return null;
}

export function refusalToReopen(period: Period): "ALREADY_OPEN" | null {
  return periodStatus(period) === "OPEN" ? "ALREADY_OPEN" : null;
}
