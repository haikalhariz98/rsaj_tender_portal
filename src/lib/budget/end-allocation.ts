/**
 * Ending a budget allocation (66-C1 (a), found in 6.6 step 0; the `people/end-assignment.ts`
 * pattern). An allocation is an effective-dated period (`effective.ts`): in force up to, not on,
 * its end day, and its end day is a DAY, midnight UTC of the day, as every other stored day.
 * Storing the instant "End" was pressed made the end a time of day no rule reads as a day. Ending
 * closes the period on the organisation's today: from today it no longer counts. Today needs the
 * organisation's time zone (an unset zone is not UTC; ruling 9.5).
 *
 * Pure: the action passes the allocation as read under its lock and the organisation's today.
 */

import { dayToDate, storedDay } from "@/lib/dates";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { formatDate } from "@/lib/format";

export type EndAllocationFault = "ALREADY_ENDED" | "TIME_ZONE_UNSET" | "NOT_BEGUN";

export type EndAllocationResult = { ok: true; effectiveTo: Date } | { ok: false; code: EndAllocationFault; message: string };

export function endAllocationOn(i: { effectiveFrom: Date; effectiveTo: Date | null; today: string | null }): EndAllocationResult {
  if (i.effectiveTo) return { ok: false, code: "ALREADY_ENDED", message: `That allocation has already ended: ${END_DAY_LABEL.toLowerCase()} ${formatDate(i.effectiveTo)}.` };
  if (!i.today) return { ok: false, code: "TIME_ZONE_UNSET", message: "The organisation's time zone is not set, so today cannot be told. Set it under Configuration › Organisation, then end the allocation." };
  // Ending on today must leave a period that began before it: one beginning today or later has
  // not begun, and ending it would make a period of no days. Its period is corrected with Edit.
  if (i.today <= storedDay(i.effectiveFrom)) {
    return { ok: false, code: "NOT_BEGUN", message: `It begins on ${formatDate(i.effectiveFrom)}, so ending it today would leave it no day in force. Correct its period with Edit, which records the change and its reason.` };
  }
  return { ok: true, effectiveTo: dayToDate(i.today) };
}
