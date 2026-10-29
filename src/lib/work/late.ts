/**
 * Lateness is read, never stored (WS-19, WS-24; W-9). Late: the due day is before the organisation's today, and the item is still open. With no time zone
 * there is no today, so nothing is judged late (NOT_JUDGED), never late by UTC's day. `today` comes from `organisationToday` (`todayIn`). Pure.
 */

import { daysFrom } from "@/lib/dates";

import { isOpen } from "./move";
import type { Day, Lateness, WorkStatus } from "./types";

export function lateness(dueOn: Day | null, status: WorkStatus, today: Day | null): Lateness {
  if (dueOn === null) return { state: "NO_DUE" };
  if (!isOpen(status)) return { state: "DUE" };
  if (today === null) return { state: "NOT_JUDGED" };
  return dueOn < today ? { state: "LATE", days: daysFrom(dueOn, today) } : { state: "DUE" };
}
