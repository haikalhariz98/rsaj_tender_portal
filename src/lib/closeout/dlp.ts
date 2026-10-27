/**
 * The defects liability period's notice (plan closeout-plan.md §4.3). Pure. The organisation's notification rule for `contract.dlp.ending` names
 * the offices and the days before the end to tell them (shipped none). Each offset reached while the period runs is told once: the offset is the
 * notice's occurrence.
 */

import { daysFrom } from "@/lib/dates";

import type { Day } from "./types";

export const DLP_EVENT_KEY = "contract.dlp.ending";

/// The offset to tell today: the period has not ended, and of the offsets whose days before the end are reached, the latest (the smallest). A first
/// reading late in the period tells that one only, never every offset already passed at once (F9, code review of close-out stage B).
export function dlpOffsetsDue(endExclusive: Day, today: Day, offsets: readonly number[]): number[] {
  if (today >= endExclusive) return [];
  const left = daysFrom(today, endExclusive);
  const reached = [...new Set(offsets)].filter((o) => o > 0 && left <= o);
  return reached.length ? [Math.min(...reached)] : [];
}

/// The days left before the period ends (0 once it has), for the Meter.
export const dlpDaysLeft = (endExclusive: Day, today: Day): number => (today >= endExclusive ? 0 : daysFrom(today, endExclusive));
