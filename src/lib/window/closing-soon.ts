/**
 * "Closing in the next N days" on the sourcing list. The view is a rolling horizon from the
 * organisation's day, not a calendar week: a week's first day is the customer's to say and
 * nothing is configured for it. A closing that has already passed does not count, even one that
 * fell earlier today (the phase says CLOSED); a closing that cannot be placed (no zone, no
 * closing) does not count either. Pure.
 */

import { daysFrom } from "@/lib/dates";

import type { WindowPhase } from "./phase";

/// The list's horizon, in days counting today. A view's size, not a policy figure.
export const CLOSING_SOON_DAYS = 7;

const OPEN: readonly WindowPhase[] = ["PUBLISHED", "OPEN_FOR_PURCHASE", "CLOSED_FOR_PURCHASE"];

export function closesSoon(i: { today: string | null; closingDay: string | null; phase: WindowPhase }, days = CLOSING_SOON_DAYS): boolean {
  if (!i.today || !i.closingDay || !OPEN.includes(i.phase)) return false;
  const away = daysFrom(i.today, i.closingDay);
  return away >= 0 && away < days;
}
