/**
 * The schedule of tenders on the public Results page (go-live R4a): a document the procurement office chose to publish, kept on the exercise as
 * PUBLISHED_SCHEDULE. Pure. The public sees it only while every one of these still holds, asked again at each read and not trusted from the day it was attached:
 * the attachment is live, its version is not withdrawn, its document is classified Public (a classification can be raised after publication), and it is not
 * flagged as a threat. Of several that qualify the latest attached is the one shown.
 */

export type ScheduleScanState = "NOT_SCANNED" | "CLEAN" | "THREAT";

export interface ScheduleRow {
  exerciseId: string;
  attachedAt: Date;
  detachedAt: Date | null;
  version: {
    id: string;
    sha256: string;
    mediaType: string;
    originalFilename: string;
    scanState: ScheduleScanState;
    withdrawnAt: Date | null;
    document: { classificationSnapshot: "PUBLIC" | "INTERNAL" | "SULIT" | null };
  };
}

/// Whether the public may be given this attachment now.
export function isPublicSchedule(row: ScheduleRow): boolean {
  return row.detachedAt == null && row.version.withdrawnAt == null && row.version.scanState !== "THREAT" && row.version.document.classificationSnapshot === "PUBLIC";
}

/// The schedule the public is given for each exercise: the latest attached of those that qualify.
export function currentSchedules(rows: readonly ScheduleRow[]): Map<string, ScheduleRow> {
  const out = new Map<string, ScheduleRow>();
  for (const r of rows) {
    if (!isPublicSchedule(r)) continue;
    const held = out.get(r.exerciseId);
    if (!held || r.attachedAt.getTime() > held.attachedAt.getTime()) out.set(r.exerciseId, r);
  }
  return out;
}
