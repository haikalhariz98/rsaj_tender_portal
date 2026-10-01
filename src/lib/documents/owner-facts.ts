/**
 * An owner's rows, mapped to the facts `attachFault`, `detachFault` and `ownerState`
 * judge. Pure, and the one mapping: the owner acts call it on rows read under the owner's
 * lock, and the screens call it on the same rows read for display, so a disabled action
 * and a refused one always give the same reason.
 */

import { isClassificationSnapshot } from "@/lib/method/snapshot";

import type { AwardStatus, ExerciseMethodFlags, ExerciseStatus, InstrumentKind, MeetingStatus, OwnerFacts } from "./attach";

export const meetingFacts = (m: { status: MeetingStatus }): OwnerFacts => ({ kind: "meeting", status: m.status });

/**
 * What an exercise's method asks it to keep. A decided exercise keeps what its method
 * asked when it was decided (its classification snapshot), whatever the method says now;
 * a draft keeps what its configured method asks. Null where neither is known.
 */
export function exerciseMethodFlags(classificationSnapshot: unknown, configured: ExerciseMethodFlags | null): ExerciseMethodFlags | null {
  const flags = isClassificationSnapshot(classificationSnapshot) ? classificationSnapshot.method.flags : configured;
  return flags ? { requiresDossier: !!flags.requiresDossier, requiresCoordinationRecord: !!flags.requiresCoordinationRecord } : null;
}

/// `awards`: the exercise's awards, with how many appointment routes each has open.
/// `method`: `exerciseMethodFlags` of the exercise.
export function exerciseFacts(ex: { status: ExerciseStatus }, awards: readonly { status: string; openAppointmentRoutes: number }[], method: ExerciseMethodFlags | null): OwnerFacts {
  return {
    kind: "exercise",
    status: ex.status,
    appointmentRouteOpen: awards.some((a) => a.openAppointmentRoutes > 0),
    awardApproved: awards.some((a) => a.status === "APPROVED" || a.status === "ISSUED" || a.status === "ACCEPTED"),
    method,
  };
}

/// OD-5: an award accepted with no return-scan snapshot was accepted before scans were required.
export function awardFacts(a: { status: AwardStatus; instrumentKind: InstrumentKind; returnScanSnapshot: unknown }): OwnerFacts {
  return { kind: "award", status: a.status, instrumentKind: a.instrumentKind, scansRequired: !(a.status === "ACCEPTED" && a.returnScanSnapshot == null) };
}

/// 6.2: a specification panel, with its exercise's status.
export const panelFacts = (p: { status: "DRAFT" | "VERIFIED"; exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "specificationPanel", exerciseStatus: p.exercise.status, status: p.status });

/// 6.2 Q-3: a bill of quantities version, with its exercise's status.
export const bqVersionFacts = (v: { status: "DRAFT" | "FINALISED" | "SUPERSEDED"; exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "bqVersion", exerciseStatus: v.exercise.status, status: v.status });

/// Ended once its last day has passed, in the organisation's days.
export function delegationFacts(d: { effectiveTo: Date | null }, today: string): OwnerFacts {
  return { kind: "delegation", ended: d.effectiveTo != null && d.effectiveTo.toISOString().slice(0, 10) < today };
}
