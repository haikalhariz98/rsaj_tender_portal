/**
 * The S.O.'s instruction and its oral-instruction loop (6.13 Part A step 4: FR-VAR-007, 009, 015, 016).
 *
 * The instruction is a certificate signed by the S.O. and dated by that signature (the core's dating block). It is
 * never raised before the variation is approved, or, exempt, before its exemption is recorded (FR-VAR-004, 015); where
 * the variation affects a funder's assets, never before the funder's consent is carried by its committee (FR-VAR-009);
 * and never before the schedule form is known (OD-A5: unset blocks, naming the setting). Its description is the
 * heading every measured item is under (FR-VAR-017).
 *
 * The oral loop (FR-VAR-016): where the instruction was first given orally, the contractor's written confirmation is
 * due within the ORAL_CONFIRM clock of the day it was given, and an objection within the ORAL_OBJECTION clock of the
 * confirmation's receipt. Both clocks are read when each day is recorded and the due day is frozen with it (a clock
 * changed later moves nothing already recorded); an unset clock reads "not set" and the record is still allowed (the
 * clocks are advisory). Pure.
 */

import { dayPlus } from "@/lib/dates";

import { issuedInstruction, liveInstruction, priorApproved, type VariationFacts } from "./application";
import type { Day, Finding, ScheduleForm } from "./types";

export interface ClockRule {
  length: number;
  unit: "DAYS" | "WEEKS" | "MONTHS";
}

/// A day plus whole months: the same day of the month, or that month's last day where it is shorter.
export function addMonths(day: Day, n: number): Day {
  const [y, m, d] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/// The day a clock runs out from `from` (calendar days; a week is seven). Null: the clock is not set.
export function dueOn(from: Day | null, clock: ClockRule | null): Day | null {
  if (!from || !clock) return null;
  return clock.unit === "MONTHS" ? addMonths(from, clock.length) : dayPlus(from, clock.unit === "WEEKS" ? clock.length * 7 : clock.length);
}

/// The funder's consent, as its committee decided it on the matter tabled from the variation.
export type ConsentState = "NONE" | "PENDING" | "CARRIED" | "NOT_CARRIED";

export interface InstructionInput {
  v: VariationFacts;
  funderConsentRequired: boolean | null;
  consent: ConsentState;
  agreedRateExists: boolean | null;
  scheduleForm: ScheduleForm | null;
  description: string;
  oralIssuedOn: Day | null;
  today: Day;
}

/// Why the instruction cannot be raised now.
export function instructionFaults(i: InstructionInput): Finding[] {
  const v = i.v;
  if (v.status !== "SUPPORTED") return [{ code: "NOT_SUPPORTED_YET", level: "block", data: { status: v.status } }];
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (liveInstruction(v)) f("INSTRUCTION_EXISTS");
  if (v.exemption == null && !priorApproved(v)) f("NOT_APPROVED");
  out.push(...consentFaults(i.funderConsentRequired, i.consent));
  if (i.agreedRateExists == null) f("FIELD_REQUIRED", { field: "agreedRateExists" });
  else if (i.scheduleForm == null) f("SCHEDULE_FORM_NOT_SET", { agreedRate: i.agreedRateExists ? "yes" : "no" });
  if (!i.description.trim()) f("FIELD_REQUIRED", { field: "instructionDescription" });
  if (i.oralIssuedOn && i.oralIssuedOn > i.today) f("FUTURE_DATE", { day: i.oralIssuedOn });
  return out;
}

/// FR-VAR-009: a variation affecting a funder's assets proceeds to its instruction only on a carried consent.
export function consentFaults(required: boolean | null, consent: ConsentState): Finding[] {
  if (required == null) return [{ code: "FIELD_REQUIRED", level: "block", data: { field: "funderConsentRequired" } }];
  if (required && consent !== "CARRIED") return [{ code: "FUNDER_CONSENT_MISSING", level: "block", data: { state: consent } }];
  return [];
}

/// What its issue re-checks under the contract's lock: still approved (or exempt) and still consented.
export function instructionIssueFaults(i: { v: VariationFacts; funderConsentRequired: boolean | null; consent: ConsentState }): Finding[] {
  const out: Finding[] = [];
  if (i.v.status !== "SUPPORTED") out.push({ code: "NOT_SUPPORTED_YET", level: "block", data: { status: i.v.status } });
  if (i.v.exemption == null && !priorApproved(i.v)) out.push({ code: "NOT_APPROVED", level: "block" });
  out.push(...consentFaults(i.funderConsentRequired, i.consent));
  return out;
}

export interface OralInput {
  /// The instruction's certificate is issued, and its day (the written instruction's date).
  issuedOn: Day | null;
  oralIssuedOn: Day | null;
  contractorConfirmedOn: Day | null;
  confirmationMatches: boolean | null;
  objectedOn: Day | null;
  objectionNote: string;
  today: Day;
}

/// FR-VAR-016: the loop's days, in order, none in the future; an objection only where the confirmation did not match.
export function oralLoopFaults(i: OralInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.oralIssuedOn) return [{ code: "NOT_ORAL", level: "block" }];
  for (const d of [i.contractorConfirmedOn, i.objectedOn]) if (d && d > i.today) f("FUTURE_DATE", { day: d });
  if (i.contractorConfirmedOn && i.contractorConfirmedOn < i.oralIssuedOn) f("CONFIRMED_BEFORE_ORAL", { day: i.oralIssuedOn });
  if (i.contractorConfirmedOn && i.confirmationMatches == null) f("FIELD_REQUIRED", { field: "confirmationMatches" });
  if (i.objectedOn) {
    if (!i.contractorConfirmedOn) f("OBJECTION_BEFORE_CONFIRMATION");
    else if (i.objectedOn < i.contractorConfirmedOn) f("OBJECTION_BEFORE_CONFIRMATION");
    if (i.confirmationMatches !== false) f("OBJECTION_ONLY_ON_MISMATCH");
    if (!i.objectionNote.trim()) f("FIELD_REQUIRED", { field: "objectionNote" });
  }
  return out;
}

export type ClockReading = { state: "NOT_SET" } | { state: "OPEN"; due: Day } | { state: "MET"; due: Day; on: Day; late: boolean };

/// A frozen due day against what happened: not set, still open, or met on a day (late after the due day).
export function clockReading(due: Day | null, on: Day | null): ClockReading {
  if (!due) return { state: "NOT_SET" };
  if (!on) return { state: "OPEN", due };
  return { state: "MET", due, on, late: on > due };
}

export { issuedInstruction };

/**
 * Acceptance S-2 (FR-VAR-015): what the S.O.'s Instruction says of its plans or sketches, attached through the
 * document store. Not required at issue, so none attached is said plainly, never as outstanding. Pure.
 */
export function sketchesLine(attached: readonly { title: string; versionNo: number }[]): { en: string; ms: string } {
  if (attached.length === 0) return { en: "No plans or sketches attached", ms: "Tiada pelan atau lakaran dilampirkan" };
  const list = attached.map((a) => `${a.title} (version ${a.versionNo})`).join("; ");
  const listMs = attached.map((a) => `${a.title} (versi ${a.versionNo})`).join("; ");
  return { en: `${attached.length} attached: ${list}`, ms: `${attached.length} dilampirkan: ${listMs}` };
}
