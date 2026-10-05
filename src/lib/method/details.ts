import type { ExerciseStatus } from "./types";

/**
 * The exercise's details (founder, 2026-10-05): its person in charge and its work code.
 *
 * Both are working facts rather than decided ones, so they may change through preparation,
 * tendering and evaluation. They stop changing when the exercise is cancelled, and once an
 * award has gone for approval (the moment the classification is locked, 6.11): from then
 * the exercise is the record behind the award.
 */

export type DetailsFault = "CANCELLED" | "AWARDED";

export const WORK_CODE_MAX = 100;

export function detailsFault(ex: { status: ExerciseStatus; classificationLockedAt: Date | null }): DetailsFault | null {
  if (ex.status === "CANCELLED") return "CANCELLED";
  if (ex.classificationLockedAt) return "AWARDED";
  return null;
}

export const DETAILS_FAULT_TEXT: Record<DetailsFault, string> = {
  CANCELLED: "Not saved: a cancelled exercise keeps its details as they were.",
  AWARDED: "Not saved: an award on this exercise has gone for approval, so its details are kept as they were.",
};

/// A blank work code is not recorded (null), never stored as an empty string.
export const workCodeOf = (text: string): string | null => (text.trim() === "" ? null : text.trim());
