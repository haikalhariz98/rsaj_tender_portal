/**
 * The schedule of tenders the public is given (go-live R4a), read through `SCHEDULE_SELECT` (select.ts) and judged by `isPublicSchedule` (schedule.ts) on every read.
 */

import { db } from "@/lib/db";

import { currentSchedules, type ScheduleRow } from "./schedule";
import { SCHEDULE_SELECT } from "./select";

/// The schedules of these exercises, keyed by exercise: only those the public may be given now.
export async function loadSchedules(organisationId: string, exerciseIds: readonly string[]): Promise<Map<string, ScheduleRow>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await db.documentAttachment.findMany({
    where: { organisationId, purpose: "PUBLISHED_SCHEDULE", exerciseId: { in: [...exerciseIds] }, detachedAt: null },
    select: SCHEDULE_SELECT,
  });
  return currentSchedules(rows as unknown as ScheduleRow[]);
}
