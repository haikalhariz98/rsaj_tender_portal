/**
 * The contractor's programme (FR-SUP-006, 012). A revision is submitted; the S.O. Representative's scrutiny
 * records whether it reflects a reasonable and realistic sequence with reasonable commencement and completion
 * dates; the Principal S.O. Representative then approves it or returns it for revision with the reason (the SOP
 * gives no reject path: returning it is the exit, B4). It cannot be approved without its scrutiny. The approved
 * programme in force is the latest approved revision; a revision replaces it only when approved.
 *
 * Its points give the planned progress on a day (FR-SUP-010). Between two points the planned figure is read on
 * the straight line between them, exactly (ASSUMED reading, shown, BD-613-12); on or after the last point it is
 * the last point's; before the first point the programme does not say. Pure, exact (ten-thousandths of a
 * percent, rational interpolation in integers).
 */

import { daysFrom } from "@/lib/dates";
import { parsePercent } from "@/lib/securities/money";

import type { Day, Finding, ProgrammeDecision } from "./types";

export interface PointIn {
  day: Day;
  /// The planned cumulative percentage, as a decimal string to at most four places.
  plannedPct: string;
}

export type PointFault = "NO_POINTS" | "POINT_NOT_A_PERCENT" | "POINT_DAYS_NOT_ASCENDING" | "POINT_PCT_FALLS" | "POINT_BEFORE_POSSESSION";

const PCT = /^\d{1,3}(\.\d{1,4})?$/;

/// A programme's points: at least one, days strictly ascending, percentages 0–100 and never falling.
export function pointFaults(points: readonly PointIn[], possessionOn: Day | null): Finding<PointFault>[] {
  const out: Finding<PointFault>[] = [];
  if (points.length === 0) return [{ code: "NO_POINTS", level: "block" }];
  for (const [n, p] of points.entries()) {
    if (!PCT.test(p.plannedPct) || parsePercent(p.plannedPct) > 100_0000n) out.push({ code: "POINT_NOT_A_PERCENT", level: "block", data: { line: n + 1 } });
    if (possessionOn && p.day < possessionOn) out.push({ code: "POINT_BEFORE_POSSESSION", level: "block", data: { line: n + 1, day: possessionOn } });
    if (n > 0) {
      const prev = points[n - 1];
      if (p.day <= prev.day) out.push({ code: "POINT_DAYS_NOT_ASCENDING", level: "block", data: { line: n + 1 } });
      else if (PCT.test(p.plannedPct) && PCT.test(prev.plannedPct) && parsePercent(p.plannedPct) < parsePercent(prev.plannedPct)) out.push({ code: "POINT_PCT_FALLS", level: "block", data: { line: n + 1 } });
    }
  }
  return out;
}

/// A rational percentage: num / den percent, in ten-thousandths (den > 0).
export interface Rational {
  num: bigint;
  den: bigint;
}

/// The planned percentage on a day, exactly; null before the first point (the programme does not say).
export function plannedOn(points: readonly PointIn[], day: Day): Rational | null {
  const ps = [...points].sort((a, b) => (a.day < b.day ? -1 : 1));
  if (ps.length === 0 || day < ps[0].day) return null;
  for (let n = 0; n < ps.length; n++) {
    const p = ps[n];
    if (p.day === day) return { num: parsePercent(p.plannedPct), den: 1n };
    const next = ps[n + 1];
    if (!next) return { num: parsePercent(p.plannedPct), den: 1n };
    if (day > p.day && day < next.day) {
      const span = BigInt(daysFrom(p.day, next.day));
      const into = BigInt(daysFrom(p.day, day));
      const a = parsePercent(p.plannedPct);
      const b = parsePercent(next.plannedPct);
      // a + (b − a) × into / span, kept as a fraction.
      return { num: a * span + (b - a) * into, den: span };
    }
  }
  return { num: parsePercent(ps[ps.length - 1].plannedPct), den: 1n };
}

export type SubmitFault = "NOT_EXECUTED" | "FUTURE_DATE" | "OPEN_REVISION";

/// A revision is submitted once the contract is executed, one at a time (the open one decided first).
export function submitFaults(i: { executed: boolean; submittedOn: Day; today: Day; openRevision: number | null }): Finding<SubmitFault>[] {
  const out: Finding<SubmitFault>[] = [];
  if (!i.executed) out.push({ code: "NOT_EXECUTED", level: "block" });
  if (i.submittedOn > i.today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: i.submittedOn } });
  if (i.openRevision != null) out.push({ code: "OPEN_REVISION", level: "block", data: { revision: i.openRevision } });
  return out;
}

export interface RevisionFacts {
  revision: number;
  submittedOn: Day;
  scrutinisedOn: Day | null;
  reasonable: boolean | null;
  decision: ProgrammeDecision | null;
  decidedOn: Day | null;
}

export type ScrutinyFault = "DECIDED" | "ALREADY_SCRUTINISED" | "ANSWER_REQUIRED" | "NOTE_REQUIRED" | "FUTURE_DATE" | "BEFORE_SUBMITTED";

export function scrutinyFaults(r: RevisionFacts, i: { on: Day; today: Day; reasonable: boolean | null; note: string }): Finding<ScrutinyFault>[] {
  const out: Finding<ScrutinyFault>[] = [];
  if (r.decision) out.push({ code: "DECIDED", level: "block" });
  else if (r.scrutinisedOn) out.push({ code: "ALREADY_SCRUTINISED", level: "block" });
  if (i.reasonable == null) out.push({ code: "ANSWER_REQUIRED", level: "block" });
  // A programme found not reasonable says why: the contractor revises against it.
  if (i.reasonable === false && !i.note.trim()) out.push({ code: "NOTE_REQUIRED", level: "block" });
  if (i.on > i.today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: i.on } });
  if (i.on < r.submittedOn) out.push({ code: "BEFORE_SUBMITTED", level: "block", data: { day: r.submittedOn } });
  return out;
}

export type DecideFault = "DECIDED" | "NOT_SCRUTINISED" | "FOUND_UNREASONABLE" | "REASON_REQUIRED" | "FUTURE_DATE" | "BEFORE_SCRUTINY" | "NO_POINTS";

/**
 * The Principal Representative's decision. Approval needs the recorded scrutiny, found reasonable, and its
 * points (the baseline for progress); a programme found not reasonable is returned for revision, not approved.
 * Returning needs the reason.
 */
export function decideFaults(r: RevisionFacts, i: { decision: ProgrammeDecision; on: Day; today: Day; note: string; points: number }): Finding<DecideFault>[] {
  const out: Finding<DecideFault>[] = [];
  if (r.decision) out.push({ code: "DECIDED", level: "block" });
  if (i.decision === "APPROVED") {
    if (!r.scrutinisedOn) out.push({ code: "NOT_SCRUTINISED", level: "block" });
    else if (r.reasonable === false) out.push({ code: "FOUND_UNREASONABLE", level: "block" });
    if (i.points === 0) out.push({ code: "NO_POINTS", level: "block" });
  }
  if (i.decision === "RETURNED" && !i.note.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  if (i.on > i.today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: i.on } });
  if (r.scrutinisedOn && i.on < r.scrutinisedOn) out.push({ code: "BEFORE_SCRUTINY", level: "block", data: { day: r.scrutinisedOn } });
  return out;
}

/// The approved programme in force: the latest approved revision (decided on or before the day).
export function programmeInForce<T extends RevisionFacts>(revisions: readonly T[], day: Day): T | null {
  return revisions.filter((r) => r.decision === "APPROVED" && r.decidedOn != null && r.decidedOn <= day).reduce<T | null>((m, r) => (!m || r.revision > m.revision ? r : m), null);
}

/// The revision waiting for a decision, if any.
export const openRevision = <T extends RevisionFacts>(revisions: readonly T[]): T | null => revisions.find((r) => r.decision == null) ?? null;
