/**
 * Whether an exercise still needs the deployment's sealing pepper (ADR 0036 D4, ruling 20y; build plan step 15). Pure.
 *
 * The pepper is kept, unchanged, until no opening of any exercise wrapped under it can still follow. An opening that can still follow needs an officer's passphrase,
 * and an officer's wrap cannot be opened without the pepper it was made under. After finalising, the mover works from `releasedDek`, which needs neither, so finalising
 * is the end for the main opening. A late bid admitted by its committee is opened at a supplementary opening that starts only once the main one is finalised, so that
 * opening and its own finalising still need the pepper.
 */

import type { AdmissionState } from "@/lib/bids/late";

export interface PepperExerciseFacts {
  exerciseId: string;
  /// Any OfficerExerciseKey of the exercise, retired or not, whose pepperId equals the held pepper's FULL id: the configured name, "#", and the check value of the bytes
  /// (`sealingPepper()` in src/lib/integration/sealing-deployment.ts). Never the configured name alone.
  wrappedUnderHeldPepper: boolean;
  cancelled: boolean;
  mainFinalised: boolean;
  /// Each late ONLINE submission in the main opening's frozen receiptRoll: whether withdrawn, its committee's admission (`admission()` in src/lib/bids/late.ts), and
  /// whether a supplementary opening that opened it is finalised.
  lateInRoll: { withdrawn: boolean; admission: AdmissionState; supplementaryFinalised: boolean }[];
}

/// 20y. False when not wrapped under the held pepper, or cancelled. True while the main opening is not finalised. Otherwise true while any late submission not withdrawn is
/// neither NOT_ADMITTED nor (ADMITTED and supplementaryFinalised). NOT_TABLED, PENDING and DEFERRED keep it.
export function pepperStillNeeded(e: PepperExerciseFacts): boolean {
  if (!e.wrappedUnderHeldPepper || e.cancelled) return false;
  if (!e.mainFinalised) return true;
  return e.lateInRoll.some((l) => {
    if (l.withdrawn) return false;
    if (l.admission === "NOT_ADMITTED") return false;
    if (l.admission === "ADMITTED") return !l.supplementaryFinalised;
    return true;
  });
}

/// What the list says about the pepper this copy holds. Where no usable pepper is held the list cannot be built, and says so: it never reads as "no exercise needs the pepper".
export type HeldPepperReading = { status: "SET"; id: string } | { status: "NOT_SET" } | { status: "INVALID" };

export const PEPPER_LIST_WORDS = {
  scope: "This list covers this organisation only. A system that serves several organisations checks each one's list before the pepper is changed.",
  notHeld: "This copy of the system holds no sealing pepper, so it cannot tell which exercises were wrapped under the one in use. This is not the same as no exercise needing it: check the copy that holds the pepper before anything is changed.",
  invalid: "The sealing pepper this copy holds is not usable, so it cannot tell which exercises were wrapped under it. This is not the same as no exercise needing it: put right the pepper first.",
  none: "No exercise that you can see still needs the pepper this copy holds.",
  /// Shown whatever the list holds, and with no number: a count would say that a restricted exercise exists (the 20av pattern).
  restricted: "An exercise restricted to its named people is listed only to them. Before the pepper is changed, this list is read by someone who can see every exercise of the organisation.",
  some: "These exercises were wrapped under the pepper this copy holds and can still be opened. Keep the pepper unchanged until none is listed. The system keeps one pepper at a time.",
} as const;

/// The words above the list, for one reading of the held pepper and the exercises found.
export function pepperListState(held: HeldPepperReading, needing: number): "NOT_HELD" | "INVALID" | "NONE" | "SOME" {
  if (held.status === "NOT_SET") return "NOT_HELD";
  if (held.status === "INVALID") return "INVALID";
  return needing === 0 ? "NONE" : "SOME";
}

/// Whether any of an exercise's officer wraps was made under the held pepper: the FULL id, the configured name with the check value of its bytes, never the name alone.
export const wrappedUnderHeld = (wrapPepperIds: readonly (string | null)[], heldId: string): boolean => wrapPepperIds.some((id) => id !== null && id === heldId);
