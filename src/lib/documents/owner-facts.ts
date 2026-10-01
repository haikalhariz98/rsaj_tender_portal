/**
 * An owner's rows, mapped to the facts `attachFault`, `detachFault` and `ownerState`
 * judge. Pure, and the one mapping: the owner acts call it on rows read under the owner's
 * lock, and the screens call it on the same rows read for display, so a disabled action
 * and a refused one always give the same reason.
 */

import type { AwardStatus, ExerciseStatus, InstrumentKind, MeetingStatus, OwnerFacts } from "./attach";

export const meetingFacts = (m: { status: MeetingStatus }): OwnerFacts => ({ kind: "meeting", status: m.status });

/// `awards`: the exercise's awards, with how many appointment routes each has open.
export function exerciseFacts(ex: { status: ExerciseStatus }, awards: readonly { status: string; openAppointmentRoutes: number }[]): OwnerFacts {
  return {
    kind: "exercise",
    status: ex.status,
    appointmentRouteOpen: awards.some((a) => a.openAppointmentRoutes > 0),
    awardApproved: awards.some((a) => a.status === "APPROVED" || a.status === "ISSUED" || a.status === "ACCEPTED"),
  };
}

/// OD-5: an award accepted with no return-scan snapshot was accepted before scans were required.
export function awardFacts(a: { status: AwardStatus; instrumentKind: InstrumentKind; returnScanSnapshot: unknown }): OwnerFacts {
  return { kind: "award", status: a.status, instrumentKind: a.instrumentKind, scansRequired: !(a.status === "ACCEPTED" && a.returnScanSnapshot == null) };
}

/// Ended once its last day has passed, in the organisation's days.
export function delegationFacts(d: { effectiveTo: Date | null }, today: string): OwnerFacts {
  return { kind: "delegation", ended: d.effectiveTo != null && d.effectiveTo.toISOString().slice(0, 10) < today };
}
