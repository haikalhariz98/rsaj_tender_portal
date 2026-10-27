/**
 * Practical completion (FR-CMP-004–007, 009; plan closeout-plan.md §4.2, CO-5; rulings 5, 15, 20). Pure.
 *
 * - The defects liability period is frozen on the CPC at raise: it starts on the completion date and ends, exclusive, the baseline's months
 *   later (`addMonths`, clamped to the month's end). An extension of time never moves it. A baseline that does not say whether a DLP applies,
 *   or for how long, refuses the CPC (DLP_NOT_SET); one that says it does not apply has no dates, and the path goes straight to the final account.
 * - Sectional completion and the IT variant are not built: refused at the CPC by name (ruling 15), never certified as the whole works.
 * - A live damages decision charging LAD whose window is still open refuses it: the officer closes the window at the completion date first.
 */

import { addMonths } from "@/lib/securities/period";

import type { Day, Dlp, Finding } from "./types";

/// The DLP frozen on the CPC from the baseline's terms.
export function dlpOf(completionDate: Day, terms: { applies: boolean | null; months: number | null }): Dlp {
  if (terms.applies === false) return { applies: false };
  if (terms.applies !== true || terms.months == null || terms.months <= 0) return { applies: null };
  return { applies: true, start: completionDate, endExclusive: addMonths(completionDate, terms.months) };
}

export interface CpcRaiseInput {
  /// A CPC not void already on the contract (its number, or null while unnumbered).
  live: { number: string | null } | null;
  completionDate: Day;
  /// Possession of site, from the baseline (null: not recorded).
  possessionDate: Day | null;
  inspectedOn: Day;
  testReasons: string;
  today: Day;
  dlp: { applies: boolean | null; months: number | null };
  /// The baseline has sections (ruling 15).
  sectional: boolean;
  /// The contract type's completion variant.
  variant: string | null;
  /// The live LAD_APPLIES decisions on the contract: each window's first day not charged (null: still open).
  ladWindows: readonly { until: Day | null }[];
}

export function cpcRaiseFaults(i: CpcRaiseInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.live) f("CPC_LIVE", { number: i.live.number });
  if (i.sectional) f("SECTIONAL_NOT_BUILT");
  if (i.variant === "IT") f("IT_VARIANT_NOT_BUILT");
  // Code review of close-out stage B (Consider): an unset variant is said, not read as the standard works certificate (gaps stay honest).
  if (i.variant == null) out.push({ code: "VARIANT_NOT_SET", level: "warn" });
  if (dlpOf(i.completionDate, i.dlp).applies === null) f("DLP_NOT_SET");
  if (i.completionDate > i.today) f("COMPLETION_IN_FUTURE", { day: i.completionDate });
  if (i.possessionDate && i.completionDate < i.possessionDate) f("BEFORE_POSSESSION", { day: i.possessionDate });
  if (i.inspectedOn > i.today) f("INSPECTION_IN_FUTURE", { day: i.inspectedOn });
  if (!i.testReasons.trim()) f("TEST_REASONS_REQUIRED");
  for (const w of i.ladWindows) {
    if (w.until == null) f("LAD_WINDOW_OPEN");
    else if (w.until !== i.completionDate) f("LAD_WINDOW_MISMATCH", { day: w.until, completion: i.completionDate });
  }
  return out;
}

/// LAD_WINDOW_OPEN again at issue, on the locked rows (plan §4.2: the CPC's issue hook).
export const ladWindowFaults = (completionDate: Day, windows: readonly { until: Day | null }[]): Finding[] =>
  windows.flatMap((w): Finding[] => (w.until == null ? [{ code: "LAD_WINDOW_OPEN", level: "block" }] : w.until !== completionDate ? [{ code: "LAD_WINDOW_MISMATCH", level: "block", data: { day: w.until, completion: completionDate } }] : []));

/// A CPC defect line while the certificate is a draft (FR-CMP-007): what it is, and a due day not before the completion date.
export function cpcLineFaults(i: { certificateStatus: string; description: string; dueOn: Day | null; completionDate: Day }): Finding[] {
  const out: Finding[] = [];
  if (i.certificateStatus !== "DRAFT") out.push({ code: "CPC_NOT_DRAFT", level: "block" });
  if (!i.description.trim()) out.push({ code: "DESCRIPTION_REQUIRED", level: "block" });
  if (!i.dueOn) out.push({ code: "DUE_REQUIRED", level: "block" });
  else if (i.dueOn < i.completionDate) out.push({ code: "DUE_BEFORE_COMPLETION", level: "block", data: { day: i.completionDate } });
  return out;
}
