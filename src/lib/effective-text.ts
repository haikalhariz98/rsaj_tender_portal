/**
 * How an effective-dated period reads on screen, in one place.
 *
 * `effective.ts` is the rule: a period's end day is exclusive — it is in force up to,
 * not on, the day it ends. A plain "To 21 Sep 2026" reads as including the 21st, which
 * the engine does not. So every form and every period text for an effective-dated record
 * (delegations, role assignments, matrix issues, units, cost centres, sites, budget
 * codes, allocations and periods, committee seats, gate rules, rejection destinations)
 * takes its words from here, and they say the end day is not included.
 *
 * Days are days as typed, stored at midnight UTC, so they are read with `formatDate` and
 * no time zone shifts them.
 */

import { formatDate } from "@/lib/format";

/// Said after an end day, everywhere one is shown.
export const NOT_INCLUDED = "(not included)";

/// The label of an end-day field or column on an effective-dated record.
export const END_DAY_LABEL = `Ends on ${NOT_INCLUDED}`;

/// Said of a period with no end day.
export const NO_END_DATE = "no end date";

/// An end day on its own: "21 Sep 2026 (not included)".
export function endDayText(effectiveTo: Date): string {
  return `${formatDate(effectiveTo)} ${NOT_INCLUDED}`;
}

/**
 * A period: "18 Sep 2026 until 21 Sep 2026 (not included)", or "From 18 Sep 2026, no end
 * date" where it is open.
 */
export function periodText(p: { effectiveFrom: Date; effectiveTo: Date | null }): string {
  return p.effectiveTo ? `${formatDate(p.effectiveFrom)} until ${endDayText(p.effectiveTo)}` : `From ${formatDate(p.effectiveFrom)}, ${NO_END_DATE}`;
}
