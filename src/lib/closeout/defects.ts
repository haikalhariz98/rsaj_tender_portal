/**
 * A defect line's state, derived only from its events (ADR 0047 D1; plan closeout-plan.md §4.3). Pure; never stored.
 *
 * Open → Reported rectified → Made good. Returned reads as Open again, with the return note. Withdrawn ends the line (its reason kept). A line
 * is overdue when its due day, or the latest issued Schedule of Defects' day to make good by, is past and it is neither made good nor withdrawn.
 * The Phase 3 Defect work item's board column is read from this, never stored twice.
 */

import type { Day, DefectEventFact, DefectFact, DefectState, Finding } from "./types";

export interface DefectReading {
  state: DefectState;
  /// The note of the last return, while the line is open again after one.
  returnNote: string | null;
  /// The day it was made good, or withdrawn, and the reason of a withdrawal.
  closedOn: Day | null;
  withdrawnReason: string | null;
}

/// The events are read in the order recorded (to the second, as every act reads its clock); events of the same second keep the order given, which
/// the loader takes by recording time and then by id.
export function defectState(events: readonly DefectEventFact[]): DefectReading {
  let r: DefectReading = { state: "OPEN", returnNote: null, closedOn: null, withdrawnReason: null };
  for (const e of [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))) {
    if (r.state === "MADE_GOOD" || r.state === "WITHDRAWN") break;
    if (e.kind === "REPORTED_RECTIFIED") r = { ...r, state: "REPORTED_RECTIFIED" };
    if (e.kind === "RETURNED") r = { ...r, state: "OPEN", returnNote: e.note };
    if (e.kind === "MADE_GOOD") r = { ...r, state: "MADE_GOOD", closedOn: e.on };
    if (e.kind === "WITHDRAWN") r = { ...r, state: "WITHDRAWN", closedOn: e.on, withdrawnReason: e.note };
  }
  return r;
}

/// Neither made good nor withdrawn.
export const isOpenLine = (s: DefectState) => s === "OPEN" || s === "REPORTED_RECTIFIED";

/// Past its day (the schedule's, once one is issued) and still open.
export const overdue = (d: Pick<DefectFact, "dueOn" | "events">, today: Day, scheduleRectifyBy: Day | null): boolean => isOpenLine(defectState(d.events).state) && (scheduleRectifyBy ?? d.dueOn) < today;

export type DefectAct = "REPORT_RECTIFIED" | "ACCEPT" | "RETURN" | "WITHDRAW";

/// Whether an act may move the line now: the contractor reports an open line rectified; an officer accepts an open or reported line, returns a
/// reported one with a note, or withdraws an open or reported one with a reason. Never a day after today.
export function defectActFaults(act: DefectAct, state: DefectState, i: { note: string; on: Day; today: Day; onDraftCpc?: boolean }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  // F6 (code review of close-out stage B): a line on the CPC's list is acted on only once the CPC is issued; while it is a draft the list is still being made.
  if (i.onDraftCpc) f("CPC_NOT_ISSUED");
  else if (!isOpenLine(state)) f("LINE_CLOSED", { state });
  else if (act === "REPORT_RECTIFIED" && state !== "OPEN") f("NOT_OPEN");
  else if (act === "RETURN" && state !== "REPORTED_RECTIFIED") f("NOT_REPORTED");
  if ((act === "RETURN" || act === "WITHDRAW") && !i.note.trim()) f(act === "RETURN" ? "RETURN_NOTE_REQUIRED" : "WITHDRAW_REASON_REQUIRED");
  if (i.on > i.today) f("DAY_IN_FUTURE", { day: i.on });
  return out;
}

/// Whether a line sits on a CPC not yet issued (a line on a void CPC's list is no line of the contract, and is not read).
export const onDraftCpc = (line: { practicalCompletionId: string | null }, cpcStatus: string | null): boolean => line.practicalCompletionId != null && cpcStatus !== "ISSUED";

/// A line reported during the defects liability period (FR-CMP-011), with what it is and a due day. A defect found at the inspection at the
/// period's end is still reported, until the Schedule of Defects that lists the open lines is issued (it copies none of its own, ADR 0047 D1).
export function reportDefectFaults(i: { dlpApplies: boolean; cpcIssued: boolean; scheduleIssued: boolean; description: string; dueOn: Day | null }): Finding[] {
  const out: Finding[] = [];
  if (!i.cpcIssued) out.push({ code: "CPC_NOT_ISSUED", level: "block" });
  else if (!i.dlpApplies) out.push({ code: "DLP_NOT_APPLICABLE", level: "block" });
  else if (i.scheduleIssued) out.push({ code: "SCHEDULE_ISSUED", level: "block" });
  if (!i.description.trim()) out.push({ code: "DESCRIPTION_REQUIRED", level: "block" });
  if (!i.dueOn) out.push({ code: "DUE_REQUIRED", level: "block" });
  return out;
}

/// The lines a certificate freezes (ADR 0008): each as it stands at issue, with its end state where it has one.
export interface FrozenLine {
  id: string;
  description: string;
  location: string;
  dueOn: Day;
  source: DefectFact["source"];
  state: DefectState;
  closedOn: Day | null;
  /// A withdrawn line keeps its reason (ruling 4).
  reason: string | null;
}

export const frozenLinesOf = (lines: readonly DefectFact[]): FrozenLine[] =>
  lines.map((l) => {
    const r = defectState(l.events);
    return { id: l.id, description: l.description, location: l.location, dueOn: l.dueOn, source: l.source, state: r.state, closedOn: r.closedOn, reason: r.withdrawnReason };
  });

/// "n withdrawn, not made good" (ruling 4), from a CMGD's frozen lines.
export const withdrawnCount = (lines: readonly Pick<FrozenLine, "state">[]): number => lines.filter((l) => l.state === "WITHDRAWN").length;
