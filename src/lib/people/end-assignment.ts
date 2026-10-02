/**
 * Ending a role assignment (6.6 step 0, found under 65-C1).
 *
 * An assignment is an effective-dated period (`effective.ts`): it is in force up to, not on,
 * its end day, and its end day is a DAY — midnight UTC of the day, as every other stored day.
 * Storing the instant the officer pressed "End" made the end a time of day that no rule reads
 * as a day: judged on today's stored day it is still in force, and on what "today" is the
 * organisation's zone was never asked. So the officer chooses the end day, it is stored as a
 * day, and it is judged against the organisation's today — which needs the zone set (an unset
 * zone is not UTC; ruling 9.5).
 *
 * Pure: the action passes the assignment as read under its lock, the chosen day and today.
 */

import { dayToDate, isDay, storedDay } from "@/lib/dates";
import { END_DAY_LABEL } from "@/lib/effective-text";
import { formatDate } from "@/lib/format";

export type EndAssignmentFault = "ALREADY_ENDED" | "TIME_ZONE_UNSET" | "END_DAY_REQUIRED" | "NOT_AFTER_START" | "BEFORE_TODAY";

export interface EndAssignmentInput {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /// The day chosen on the form, YYYY-MM-DD, or empty.
  endDay: string;
  /// The organisation's today, YYYY-MM-DD; null while no time zone is set.
  today: string | null;
}

export type EndAssignmentResult = { ok: true; effectiveTo: Date } | { ok: false; code: EndAssignmentFault; message: string; field?: "effectiveTo" };

export function endAssignment(i: EndAssignmentInput): EndAssignmentResult {
  if (i.effectiveTo) return { ok: false, code: "ALREADY_ENDED", message: `That assignment has already ended: ${END_DAY_LABEL.toLowerCase()} ${formatDate(i.effectiveTo)}.` };
  if (!i.today) {
    return { ok: false, code: "TIME_ZONE_UNSET", message: "The organisation's time zone is not set, so today cannot be told. Set it under Configuration › Organisation, then end the assignment." };
  }
  if (!i.endDay || !isDay(i.endDay)) return { ok: false, code: "END_DAY_REQUIRED", field: "effectiveTo", message: "Choose the day it ends: the first day they no longer hold it." };
  if (i.endDay <= storedDay(i.effectiveFrom)) {
    return { ok: false, code: "NOT_AFTER_START", field: "effectiveTo", message: `It must end after it began (${formatDate(i.effectiveFrom)}).` };
  }
  if (i.endDay < i.today) {
    return {
      ok: false,
      code: "BEFORE_TODAY",
      field: "effectiveTo",
      message: `Ending it before today (${formatDate(i.today)}) would change who held the office on days already past. Correct the period with Edit, which records the change and its reason.`,
    };
  }
  return { ok: true, effectiveTo: dayToDate(i.endDay) };
}
