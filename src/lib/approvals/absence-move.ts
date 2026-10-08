/**
 * Moving a pending step when its holder is marked absent (FR-APR-012): "Marking a holder absent moves their pending steps to the delegator, not to a subordinate."
 *
 * What moves a step is the escalation of FR-APR-009/010 (`stepEscalation`: the same checks, the same acting-office record, never down, never a committee's step,
 * never a mandatory act for a vacancy). This module decides only the question the plan adds for the automatic move: may it happen without an officer's hand?
 * It may when the reporting line says who is above the people who hold the office (FR-APR-010, "uses it when set"). Where it does not, the step STAYS PUT and
 * says why, in words; nothing is promoted on a guess:
 *
 * - NO_HOLDER: nobody holds the office at all (a vacancy, not an absence). Nobody was marked absent; the step is moved by an officer's escalation, as before.
 * - LINES_NOT_SET: the organisation has recorded no reporting line. "Reporting line not set."
 * - LINE_NOT_SET_FOR: lines are recorded, but not for every holder of the office, so who is above them cannot be said for them all.
 * - NO_SUPERIOR_ON_LINE: every holder is recorded as having nobody above them.
 *
 * Marking the person available again moves nothing back: the step is wherever the move put it, and an officer may escalate or the new holder may decide it.
 *
 * Pure.
 */

import { anyLineRecorded, lineOf, type ReportingLine } from "@/lib/people/reporting-lines";

export type AbsenceStay = "NO_HOLDER" | "LINES_NOT_SET" | "LINE_NOT_SET_FOR" | "NO_SUPERIOR_ON_LINE";

export type AbsenceVerdict =
  | { move: true; /// The immediate superiors of the office's holders, who are told.
      superiorIds: string[] }
  | { move: false; why: AbsenceStay; /// The holders whose line is not set, where that is the reason.
      holderIdsWithoutLine: string[] };

export function absenceVerdict(i: { holderIds: readonly string[]; lines: readonly ReportingLine[]; on: Date }): AbsenceVerdict {
  if (i.holderIds.length === 0) return { move: false, why: "NO_HOLDER", holderIdsWithoutLine: [] };
  if (!anyLineRecorded(i.lines)) return { move: false, why: "LINES_NOT_SET", holderIdsWithoutLine: [...i.holderIds] };
  const states = i.holderIds.map((id) => ({ id, state: lineOf(i.lines, id, i.on) }));
  const without = states.filter((s) => s.state.kind === "NOT_SET").map((s) => s.id);
  if (without.length > 0) return { move: false, why: "LINE_NOT_SET_FOR", holderIdsWithoutLine: without };
  const superiors = [...new Set(states.flatMap((s) => (s.state.kind === "SUPERIOR" ? [s.state.superiorPersonId] : [])))];
  if (superiors.length === 0) return { move: false, why: "NO_SUPERIOR_ON_LINE", holderIdsWithoutLine: [] };
  return { move: true, superiorIds: superiors };
}

/// Why a step stayed, as a sentence. `names` are the people whose line is not set, where that is the reason.
export function stayText(why: AbsenceStay, names: readonly string[]): string {
  switch (why) {
    case "NO_HOLDER":
      return "Nobody holds this office, so no one was marked absent. An officer escalates it, with the reason.";
    case "LINES_NOT_SET":
      return "Reporting line not set: nobody is named as the immediate superior, so the step was not moved. Record the reporting lines, or an officer escalates it.";
    case "LINE_NOT_SET_FOR":
      return `Reporting line not set for ${names.join(", ")}, so who is above everyone who holds this office cannot be said, and the step was not moved.`;
    case "NO_SUPERIOR_ON_LINE":
      return "Everyone who holds this office is recorded as having nobody above them, so there is no immediate superior to move the step to.";
  }
}

/// What the person who marked someone absent is told about the steps, once the sweep is done.
export interface AbsenceReport {
  moved: { stepId: string; matter: string | null; from: string; to: string }[];
  stayed: { stepId: string; matter: string | null; why: string }[];
}

/// The report as sentences for a screen or an audit reason. A matter hidden from the reader (`matter` null) is counted and not named.
export function reportWords(r: AbsenceReport): string[] {
  const out: string[] = [];
  const named = <T extends { matter: string | null }>(xs: T[]) => xs.filter((x) => x.matter);
  const hidden = (xs: { matter: string | null }[]) => xs.filter((x) => !x.matter).length;
  for (const m of named(r.moved)) out.push(`Moved: ${m.matter} from ${m.from} to ${m.to}.`);
  for (const s of named(r.stayed)) out.push(`Stays: ${s.matter}. ${s.why}`);
  const h = hidden(r.moved) + hidden(r.stayed);
  if (h > 0) out.push(`${h} more ${h === 1 ? "step is" : "steps are"} on records restricted to the people named on them, and ${h === 1 ? "is" : "are"} not listed here.`);
  if (r.moved.length === 0 && r.stayed.length === 0) out.push("No pending step was waiting on that office.");
  return out;
}
