/**
 * What a sitting act that writes an exercise (6.8 `recordOutcome`'s loop-back) says when the exercise
 * cannot move or the transaction ran out of time (6.8 re-review 6): the same honest refusals the
 * exercise's own acts give (`inWindow`), never an error page. Null: not one of these; the caller
 * rethrows. The transaction rolled back in each case, so nothing was saved. Pure.
 */

import { findingText } from "@/lib/method/labels";
import { ExerciseMoveRefused } from "@/lib/method/move";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";

export const EXERCISE_CHANGED = "The exercise changed while this was being saved. Reload and try again.";
export const TIMED_OUT = "This took too long and nothing was saved. Try again.";

export function exerciseActFailure(e: unknown): { ok: false; message: string } | null {
  if (e instanceof ExerciseMoveRefused) return { ok: false, message: e.findings[0]?.code === "CHANGED" ? EXERCISE_CHANGED : `Nothing was saved: the exercise cannot move: ${e.findings.map(findingText).join(" ")}` };
  if (transactionTimedOut(e)) return { ok: false, message: TIMED_OUT };
  return null;
}
