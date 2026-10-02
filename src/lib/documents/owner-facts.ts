/**
 * An owner's rows, mapped to the facts `attachFault`, `detachFault` and `ownerState`
 * judge. Pure, and the one mapping: the owner acts call it on rows read under the owner's
 * lock, and the screens call it on the same rows read for display, so a disabled action
 * and a refused one always give the same reason.
 */

import { dayToDate } from "@/lib/dates";
import { hasEnded } from "@/lib/effective";
import { isClassificationSnapshot } from "@/lib/method/snapshot";
import { verifiedScanVersionIds } from "@/lib/scope/panel";
import type { PartSource, TenderPackStatus } from "@/lib/tender-docs/types";

import type { AwardStatus, EvaluationState, ExerciseMethodFlags, ExerciseStatus, InstrumentKind, MeetingStatus, OwnerFacts } from "./attach";
import { isLive } from "./evidence";

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
/// `window`: 6.5's invitation window, where the exercise has one (its path decides the window's purposes).
export function exerciseFacts(ex: { status: ExerciseStatus }, awards: readonly { status: string; openAppointmentRoutes: number }[], method: ExerciseMethodFlags | null, window: { path: "ADVERTISED" | "INVITED" } | null = null): OwnerFacts {
  return {
    kind: "exercise",
    status: ex.status,
    appointmentRouteOpen: awards.some((a) => a.openAppointmentRoutes > 0),
    awardApproved: awards.some((a) => a.status === "APPROVED" || a.status === "ISSUED" || a.status === "ACCEPTED"),
    method,
    window,
  };
}

/// OD-5: an award accepted with no return-scan snapshot was accepted before scans were required.
export function awardFacts(a: { status: AwardStatus; instrumentKind: InstrumentKind; returnScanSnapshot: unknown }): OwnerFacts {
  return { kind: "award", status: a.status, instrumentKind: a.instrumentKind, scansRequired: !(a.status === "ACCEPTED" && a.returnScanSnapshot == null) };
}

/// 6.2: a specification panel, with its exercise's status, the scans its snapshot names
/// (BD-62-26; a missing or malformed snapshot names none) and its live signed-form attachments.
export const panelFacts = (p: {
  status: "DRAFT" | "VERIFIED";
  exercise: { status: ExerciseStatus };
  verifiedSnapshot: unknown;
  attachments: readonly { purpose: string; versionId: string; detachedAt: Date | null; version: { withdrawnAt: Date | null } }[];
}): OwnerFacts => ({
  kind: "specificationPanel",
  exerciseStatus: p.exercise.status,
  status: p.status,
  verifiedScanVersionIds: verifiedScanVersionIds(p.verifiedSnapshot),
  liveScanVersionIds: p.attachments.filter((a) => a.purpose === "SPEC_PANEL_FORM" && isLive(a)).map((a) => a.versionId),
});

/// What a panel's facts are read from: its snapshot and its signed-form attachments, live or not.
export const PANEL_FACTS_SELECT = {
  status: true,
  verifiedSnapshot: true,
  attachments: { where: { purpose: "SPEC_PANEL_FORM" as const }, select: { purpose: true, versionId: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
} as const;

/// 6.2 Q-3: a bill of quantities version, with its exercise's status.
export const bqVersionFacts = (v: { status: "DRAFT" | "FINALISED" | "SUPERSEDED"; exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "bqVersion", exerciseStatus: v.exercise.status, status: v.status });

/// 6.4: a tender pack's part, with its pack's and exercise's status and where its content comes from.
export const tenderPackPartFacts = (p: { source: PartSource; pack: { status: TenderPackStatus; exercise: { status: ExerciseStatus } } }): OwnerFacts => ({
  kind: "tenderPackPart",
  exerciseStatus: p.pack.exercise.status,
  packStatus: p.pack.status,
  source: p.source,
});

/// 6.5: an addendum, with its exercise's status.
export const addendumFacts = (a: { status: "DRAFT" | "ISSUED" | "VOID"; window: { exercise: { status: ExerciseStatus } } }): OwnerFacts => ({
  kind: "addendum",
  exerciseStatus: a.window.exercise.status,
  status: a.status,
});

/// 6.6 (X-11): a bid withdrawal, with its exercise's status.
export const withdrawalFacts = (w: { exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "bidWithdrawal", exerciseStatus: w.exercise.status });

/// 6.7 (FR-OPN-006): an opening, with its exercise's status and whether it is finalised.
export const openingFacts = (o: { finalisedAt: Date | null; exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "opening", exerciseStatus: o.exercise.status, finalised: o.finalisedAt != null });

/// 6.8: an evaluation version, with its exercise's status, its state and whether its Kertas Cadangan is signed by both.
export const evaluationFacts = (e: { state: EvaluationState; exercise: { status: ExerciseStatus }; proposalPaper: { checkedByPersonId: string | null; recommendedByPersonId: string | null } | null }): OwnerFacts => ({
  kind: "evaluation",
  exerciseStatus: e.exercise.status,
  state: e.state,
  proposalSigned: !!e.proposalPaper?.checkedByPersonId && !!e.proposalPaper.recommendedByPersonId,
});

/// 6.8: a clarification or negotiation meeting, with its evaluation's state and whether it is closed.
export const evaluationMeetingFacts = (m: { closedAt: Date | null; evaluation: { state: EvaluationState; exercise: { status: ExerciseStatus } } }): OwnerFacts => ({
  kind: "evaluationMeeting",
  exerciseStatus: m.evaluation.exercise.status,
  evaluationState: m.evaluation.state,
  closed: m.closedAt != null,
});

/// 6.8: a bidder under evaluation, with its evaluation's state and whether a CPR is entered on it.
export const evaluationBidderFacts = (b: { cprPercent: unknown; evaluation: { state: EvaluationState; exercise: { status: ExerciseStatus } } }): OwnerFacts => ({
  kind: "evaluationBidder",
  exerciseStatus: b.evaluation.exercise.status,
  evaluationState: b.evaluation.state,
  cprEntered: b.cprPercent != null,
});

/// 6.6 (FR-BID-010): a validity extension, with its exercise's status and whether it is applied.
export const extensionFacts = (x: { appliedAt: Date | null; exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "validityExtension", exerciseStatus: x.exercise.status, applied: x.appliedAt != null });

/// Ended once its end day has come, in the organisation's days: the end day is not
/// included, as `inForceOn` reads it (65-C1). `hasEnded` is that rule's end half. With no
/// time zone set (`today` null) it is not judged: `ended` is null, never the UTC day's answer (66-C2).
export function delegationFacts(d: { effectiveTo: Date | null }, today: string | null): OwnerFacts {
  return { kind: "delegation", ended: today ? hasEnded(d, dayToDate(today)) : null };
}
