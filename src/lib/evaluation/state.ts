/**
 * Where an evaluation version stands, and what every act asks first. Stored: OPEN, ISSUED, SUPERSEDED,
 * CANCELLED (E-10). Derived, never stored (OD-3 A): whether a clarification or a negotiation is under
 * way (open meetings), whether the appointment is pending a committee or decided (its matters), and
 * whether the bids' validity has expired (6.6). Every act refuses on a cancelled exercise first. Pure.
 */

import type { EvaluationState, Finding, MeetingKind } from "./types";

export type ActFault = "CANCELLED" | "NOT_STARTED" | "REPORT_ISSUED" | "VERSION_SUPERSEDED" | "VERSION_CANCELLED" | "REPORT_NOT_ISSUED";

/// An act on the open version: scoring, inputs, meetings, communications, the recommendation, the report.
export function openActFaults(i: { exerciseStatus: string; state: EvaluationState | null }): Finding<ActFault>[] {
  if (i.exerciseStatus === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  if (i.state == null) return [{ code: "NOT_STARTED", level: "block" }];
  if (i.state === "ISSUED") return [{ code: "REPORT_ISSUED", level: "block" }];
  if (i.state === "SUPERSEDED") return [{ code: "VERSION_SUPERSEDED", level: "block" }];
  if (i.state === "CANCELLED") return [{ code: "VERSION_CANCELLED", level: "block" }];
  return [];
}

/// An act on the issued report: the Kertas Cadangan, its checking and recommending.
export function issuedActFaults(i: { exerciseStatus: string; state: EvaluationState | null }): Finding<ActFault>[] {
  if (i.exerciseStatus === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  if (i.state == null) return [{ code: "NOT_STARTED", level: "block" }];
  if (i.state === "OPEN") return [{ code: "REPORT_NOT_ISSUED", level: "block" }];
  if (i.state === "SUPERSEDED") return [{ code: "VERSION_SUPERSEDED", level: "block" }];
  if (i.state === "CANCELLED") return [{ code: "VERSION_CANCELLED", level: "block" }];
  return [];
}

/// §7.3.2's states between Opened and the award, as the record shows them (OD-3 A).
export type EvaluationPhase = "NOT_STARTED" | "UNDER_EVALUATION" | "CLARIFICATION" | "NEGOTIATION" | "EVALUATED" | "PENDING_COMMITTEE" | "APPROVED" | "NOT_APPROVED" | "CANCELLED";

export function evaluationPhase(i: {
  exerciseStatus: string;
  state: EvaluationState | null;
  openMeetings: readonly MeetingKind[];
  /// The latest appointment matter tabled for the exercise: its outcome, or null where none is tabled.
  appointment: "PENDING" | "DEFERRED" | "CARRIED" | "NOT_CARRIED" | null;
}): EvaluationPhase {
  if (i.exerciseStatus === "CANCELLED" || i.state === "CANCELLED") return "CANCELLED";
  if (i.state == null) return "NOT_STARTED";
  if (i.state === "OPEN") {
    if (i.openMeetings.includes("NEGOTIATION")) return "NEGOTIATION";
    if (i.openMeetings.includes("CLARIFICATION")) return "CLARIFICATION";
    return "UNDER_EVALUATION";
  }
  if (i.appointment === "CARRIED") return "APPROVED";
  if (i.appointment === "NOT_CARRIED") return "NOT_APPROVED";
  if (i.appointment === "PENDING" || i.appointment === "DEFERRED") return "PENDING_COMMITTEE";
  return "EVALUATED";
}

export type AppointmentOutcome = "PENDING" | "DEFERRED" | "CARRIED" | "NOT_CARRIED";

/// The latest appointment matter's outcome on the version in force (fix M-3): a decision on a superseded version's report is not this version's. Matters oldest first.
export function appointmentOutcomeOn(matters: readonly { outcome: AppointmentOutcome; evaluationVersion: number | null }[], version: number | null): AppointmentOutcome | null {
  const m = matters.filter((x) => version != null && x.evaluationVersion === version).at(-1);
  return m ? m.outcome : null;
}
