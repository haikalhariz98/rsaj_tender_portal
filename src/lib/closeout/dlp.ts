/**
 * The defects liability period's notice (plan closeout-plan.md §4.3). Pure. The organisation's notification rule for `contract.dlp.ending` names
 * the offices and the days before the end to tell them (shipped none). Each offset reached while the period runs is told once: the offset is the
 * notice's occurrence.
 */

import { daysFrom } from "@/lib/dates";

import type { Day } from "./types";

export const DLP_EVENT_KEY = "contract.dlp.ending";

/// The offsets reached today: the period has not ended, and its end (exclusive) is no more than the offset's days away.
export function dlpOffsetsDue(endExclusive: Day, today: Day, offsets: readonly number[]): number[] {
  if (today >= endExclusive) return [];
  const left = daysFrom(today, endExclusive);
  return [...new Set(offsets)].filter((o) => o > 0 && left <= o).sort((a, b) => b - a);
}

/// The days left before the period ends (0 once it has), for the Meter.
export const dlpDaysLeft = (endExclusive: Day, today: Day): number => (today >= endExclusive ? 0 : daysFrom(today, endExclusive));
