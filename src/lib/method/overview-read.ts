/**
 * What the exercise's Overview reads beyond what the page already holds (founder, 2026-10-05):
 * the tender conditions (registrations, restriction, permit), the pack's proposed dates, the
 * organisation's usual closing time and the window's briefings and site visits. Reads only, and
 * only while the Overview is the tab being looked at, so no other tab pays for it.
 */

import { db } from "@/lib/db";
import { conditionsTab, type ConditionsTab } from "@/lib/tender-docs/read-conditions";
import { loadWindowPolicy } from "@/lib/window/repo";
import type { WindowPath } from "@/lib/window/types";

import { keyDatesView, type KeyDatesView } from "./key-dates";

export interface OverviewReads {
  /// Null where the exercise has no pack to state conditions for (an appointment with no tenderers).
  conditions: ConditionsTab | null;
  keyDates: KeyDatesView;
  /// The window's path as first written on it; null before a window is saved.
  windowPath: WindowPath | null;
  /// The advertisement or invitation: when the window was published.
  publishedAt: Date | null;
}

export async function loadOverviewReads(ex: { id: string; tenderingStartOn: Date | null }, closing: Date | null, org: { id: string; timeZone: string | null }, withConditions: boolean): Promise<OverviewReads> {
  const [conditions, packs, policy, window] = await Promise.all([
    withConditions ? conditionsTab(ex.id) : Promise.resolve(null),
    db.tenderPack.findMany({ where: { exerciseId: ex.id, status: { not: "VOID" } }, orderBy: { versionNo: "desc" }, select: { versionNo: true, proposedStartOn: true, proposedClosingAt: true } }),
    loadWindowPolicy(org.id),
    db.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { path: true, publishedAt: true, events: { orderBy: { startsAt: "asc" }, select: { id: true, kind: true, startsAt: true, place: true, mandatory: true, cancelledAt: true } } } }),
  ]);
  return {
    conditions,
    keyDates: keyDatesView({
      tenderingStartOn: ex.tenderingStartOn,
      closing,
      packs,
      defaultClosingTime: policy.defaultClosingTime,
      closingTimeProvenance: policy.closingTimeProvenance,
      events: window?.events ?? [],
      timeZone: org.timeZone,
    }),
    windowPath: (window?.path as WindowPath | undefined) ?? null,
    publishedAt: window?.publishedAt ?? null,
  };
}
