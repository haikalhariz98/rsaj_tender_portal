/**
 * What the exercise's Overview reads beyond what the page already holds (founder, 2026-10-05):
 * the tender conditions (registrations, restriction, permit), the pack's proposed dates, the
 * organisation's usual closing time and the window's briefings and site visits. Reads only, and
 * only while the Overview is the tab being looked at, so no other tab pays for it.
 */

import { db } from "@/lib/db";
import { conditionsTab, type ConditionsTab } from "@/lib/tender-docs/read-conditions";
import { windowEditFault } from "@/lib/window/edit";
import { loadWindowPolicy } from "@/lib/window/repo";
import type { WindowPath } from "@/lib/window/types";

import { keyDatesView, type KeyDatesView } from "./key-dates";
import type { ExerciseStatus, PackKind } from "./types";

export interface OverviewReads {
  /// Null where the exercise has no pack to state conditions for (an appointment with no tenderers).
  conditions: ConditionsTab | null;
  keyDates: KeyDatesView;
  /// The window's path as first written on it; null before a window is saved.
  windowPath: WindowPath | null;
  /// The advertisement or invitation: when the window was published.
  publishedAt: Date | null;
  /// Only for a cancelled exercise, whose flow shows the stages its records prove: when the main opening
  /// was finalised and when an evaluation report was first issued. Null where none, and never read otherwise.
  openedAt: Date | null;
  reportIssuedAt: Date | null;
}

export async function loadOverviewReads(
  ex: { id: string; status: ExerciseStatus; tenderingStartOn: Date | null },
  closing: Date | null,
  org: { id: string; timeZone: string | null },
  /// The pack the exercise assembles, and whether it is the no-pack path (no tender documents, so no window).
  pack: { kind: PackKind | null; noPack: boolean },
): Promise<OverviewReads> {
  const cancelled = ex.status === "CANCELLED";
  const [conditions, packs, policy, window, opening, report] = await Promise.all([
    pack.noPack ? Promise.resolve(null) : conditionsTab(org.id, ex.id),
    db.tenderPack.findMany({ where: { exerciseId: ex.id, status: { not: "VOID" } }, orderBy: { versionNo: "desc" }, select: { versionNo: true, status: true, proposedStartOn: true, proposedClosingAt: true } }),
    loadWindowPolicy(org.id),
    db.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { path: true, publishedAt: true, events: { orderBy: { startsAt: "asc" }, select: { id: true, kind: true, startsAt: true, place: true, mandatory: true, cancelledAt: true } } } }),
    cancelled ? db.opening.findFirst({ where: { exerciseId: ex.id, kind: "MAIN", finalisedAt: { not: null } }, orderBy: { finalisedAt: "asc" }, select: { finalisedAt: true } }) : Promise.resolve(null),
    cancelled ? db.evaluation.findFirst({ where: { exerciseId: ex.id, issuedAt: { not: null } }, orderBy: { issuedAt: "asc" }, select: { issuedAt: true } }) : Promise.resolve(null),
  ]);
  return {
    conditions,
    keyDates: keyDatesView({
      tenderingStartOn: ex.tenderingStartOn,
      closing,
      packs,
      noPack: pack.noPack,
      canSchedule: windowEditFault(ex.status, pack.kind) === null,
      defaultClosingTime: policy.defaultClosingTime,
      closingTimeProvenance: policy.closingTimeProvenance,
      events: window?.events ?? [],
      timeZone: org.timeZone,
    }),
    windowPath: (window?.path as WindowPath | undefined) ?? null,
    publishedAt: window?.publishedAt ?? null,
    openedAt: opening?.finalisedAt ?? null,
    reportIssuedAt: report?.issuedAt ?? null,
  };
}
