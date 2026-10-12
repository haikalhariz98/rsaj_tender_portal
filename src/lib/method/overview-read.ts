/**
 * What the exercise's Overview reads beyond what the page already holds: where the window stands (its way of
 * tendering, when it was published) and, for a cancelled exercise, the stages its records prove. Reads only, and
 * only while the Overview is the tab being looked at, so no other tab pays for it.
 *
 * Sourcing Requirements v2 (SR-05, ruling 10): the Overview is the requisition summary and the flow, read only.
 * The tender conditions, the key dates and the briefings it used to read moved to Details & compliance and
 * Key dates & person in charge on Scope and estimate, which read them for themselves (`prep-read.ts`).
 */

import { db } from "@/lib/db";
import type { WindowPath } from "@/lib/window/types";

import type { ExerciseStatus } from "./types";

export interface OverviewReads {
  /// The window's path as first written on it; null before a window is saved.
  windowPath: WindowPath | null;
  /// The advertisement or invitation: when the window was published.
  publishedAt: Date | null;
  /// Only for a cancelled exercise, whose flow shows the stages its records prove: when the main opening
  /// was finalised and when an evaluation report was first issued. Null where none, and never read otherwise.
  openedAt: Date | null;
  reportIssuedAt: Date | null;
}

export async function loadOverviewReads(ex: { id: string; status: ExerciseStatus }): Promise<OverviewReads> {
  const cancelled = ex.status === "CANCELLED";
  const [window, opening, report] = await Promise.all([
    db.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { path: true, publishedAt: true } }),
    cancelled ? db.opening.findFirst({ where: { exerciseId: ex.id, kind: "MAIN", finalisedAt: { not: null } }, orderBy: { finalisedAt: "asc" }, select: { finalisedAt: true } }) : Promise.resolve(null),
    cancelled ? db.evaluation.findFirst({ where: { exerciseId: ex.id, issuedAt: { not: null } }, orderBy: { issuedAt: "asc" }, select: { issuedAt: true } }) : Promise.resolve(null),
  ]);
  return {
    windowPath: (window?.path as WindowPath | undefined) ?? null,
    publishedAt: window?.publishedAt ?? null,
    openedAt: opening?.finalisedAt ?? null,
    reportIssuedAt: report?.issuedAt ?? null,
  };
}
