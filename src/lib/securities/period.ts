/**
 * Adding periods to days (FR-AWD-012, FR-AWD-013, §8.10).
 *
 * Months first, clamped to the month's end — 31 January plus one month is 28 February
 * — then days. Where several month counts apply (completion, defects liability, the
 * insurance tail) they are summed and added once, so two clamps never compound. Days
 * are YYYY-MM-DD; nothing here reads a clock.
 */

export type Day = string;

const parts = (d: Day) => {
  const [y, m, dd] = d.split("-").map(Number);
  return { y, m, d: dd };
};
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(day: Day, days: number): Day {
  const t = Date.parse(`${day}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function addMonths(day: Day, months: number): Day {
  const { y, m, d } = parts(day);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDay(ny, nm)))}`;
}

/// Months first, then days.
export function addPeriod(day: Day, p: { months?: number; days?: number }): Day {
  return addDays(addMonths(day, p.months ?? 0), p.days ?? 0);
}

export type PeriodUnit = "DAYS" | "WEEKS" | "MONTHS";

/// A contract period as months and days.
export function periodParts(n: number, unit: PeriodUnit): { months: number; days: number } {
  if (unit === "MONTHS") return { months: n, days: 0 };
  return { months: 0, days: unit === "WEEKS" ? n * 7 : n };
}

/// The day the contract period ends, counted from the start.
export function completionDay(start: Day, n: number, unit: PeriodUnit): Day {
  return addPeriod(start, periodParts(n, unit));
}

export type RequiredEnd = { state: "SET"; day: Day } | { state: "NOT_SET"; missing: ("START" | "DLP" | "TAIL")[] };

/**
 * How long a policy must run: the completion period, plus the defects liability period,
 * plus the tail (3 months 14 days, or 28 days for design and build — each a
 * requirement row). The months are summed and added once, then the days.
 */
export function requiredInsuranceEnd(
  start: Day | null,
  completion: { n: number; unit: PeriodUnit },
  dlpMonths: number | null,
  tail: { months: number | null; days: number | null } | null,
): RequiredEnd {
  const missing: ("START" | "DLP" | "TAIL")[] = [];
  if (!start) missing.push("START");
  if (dlpMonths == null) missing.push("DLP");
  if (!tail || (tail.months == null && tail.days == null)) missing.push("TAIL");
  if (missing.length || !start || dlpMonths == null || !tail) return { state: "NOT_SET", missing };
  const c = periodParts(completion.n, completion.unit);
  return { state: "SET", day: addPeriod(start, { months: c.months + dlpMonths + (tail.months ?? 0), days: c.days + (tail.days ?? 0) }) };
}
