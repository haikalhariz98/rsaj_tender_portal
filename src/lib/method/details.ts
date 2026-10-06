import type { AwardStatus } from "@/lib/award/types";

import { standingAward } from "./lifecycle";
import type { ExerciseStatus } from "./types";

/**
 * The exercise's details (founder, 2026-10-05): its person in charge and its work code.
 *
 * Both are working facts rather than decided ones, so they may change through preparation,
 * tendering and evaluation. They stop changing when the exercise is cancelled, and while an
 * award that stands has gone for approval or further: from then the exercise is the record behind
 * that award. The rule reads the awards themselves rather than `classificationLockedAt`, which
 * nothing clears: when that award is cancelled the details open again for the next one.
 */

export type DetailsFault = "CANCELLED" | "AWARDED";

export const WORK_CODE_MAX = 100;

export function detailsFault(ex: { status: ExerciseStatus; awards: readonly { status: AwardStatus }[] }): DetailsFault | null {
  if (ex.status === "CANCELLED") return "CANCELLED";
  const standing = standingAward(ex.awards);
  if (standing && standing.status !== "DRAFT") return "AWARDED";
  return null;
}

export const DETAILS_FAULT_TEXT: Record<DetailsFault, string> = {
  CANCELLED: "Not saved: a cancelled exercise keeps its details as they were.",
  AWARDED: "Not saved: an award on this exercise has gone for approval, so its details are kept as they were.",
};

/// What the screen says beside a control it has disabled: nothing was attempted, so it does not say "not saved".
export const DETAILS_LOCKED_TEXT: Record<DetailsFault, string> = {
  CANCELLED: "Fixed: a cancelled exercise keeps its details as they were.",
  AWARDED: "Fixed: an award on this exercise has gone for approval, so its details are kept as they were.",
};

/**
 * How History records the person in charge: by name, which is what a reader recognises. Two people may
 * share a name, and a change from one to the other would then diff to nothing; the new entry says so in
 * words, so the change is on the record without an id ever reaching the screen.
 */
export function personInChargeTrail(before: { id: string; name: string } | null, after: { id: string; name: string } | null): { before: string | null; after: string | null } {
  const same = before && after && before.id !== after.id && before.name === after.name;
  return { before: before?.name ?? null, after: after ? (same ? `${after.name} (a different person with the same name)` : after.name) : null };
}

/// A blank work code is not recorded (null), never stored as an empty string.
export const workCodeOf = (text: string): string | null => (text.trim() === "" ? null : text.trim());
