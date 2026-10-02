/**
 * A stage's figure and whether it passes (FR-EVL-008; E-5, OD-9). Marks entered on a stage's leaf
 * criteria sum to its figure as a percentage of the stage's total (`maxMarks`), at four places; the
 * figure shown — at the organisation's places, frozen when the evaluation started — is the figure
 * judged against the pass mark, inclusive or not as the model says. A composite is the weighted sum of
 * the unrounded stage figures, shown and judged the same way. A stage the model says must be passed
 * puts a bidder out of the running when it is failed, whatever the composite ("must pass 3 and 4
 * individually"). Pure.
 */

import { compareFixed, fixedFromWhole, mulPct, ratioPct, roundHalfUp, sumFixed, type Fixed } from "./fixed";
import type { Finding } from "./types";

export type ScoreFault = "ABOVE_MAX" | "NEGATIVE" | "PASS_RULE_NOT_SET" | "DECIMALS_NOT_SET";

/// A mark against its criterion's maximum (a score above it is refused, never capped).
export function markFault(marks: Fixed, maxMarks: Fixed): Finding<ScoreFault> | null {
  if (marks < 0n) return { code: "NEGATIVE", level: "block" };
  if (compareFixed(marks, maxMarks) > 0) return { code: "ABOVE_MAX", level: "block" };
  return null;
}

/// The stage's figure: the marks as a percentage of its total, at four places. Null with no total.
export function stagePercent(marks: readonly Fixed[], maxMarks: Fixed | null): Fixed | null {
  if (maxMarks == null || maxMarks === 0n) return null;
  return ratioPct(sumFixed(...marks), maxMarks);
}

/// The figure shown, and judged: rounded half up to the frozen places (E-5). Null places: not set, nothing shown.
export const shownFigure = (v: Fixed, places: number | null): Fixed | null => (places == null ? null : roundHalfUp(v, places));

/**
 * Whether a figure passes: on the mark exactly, as the model's inclusive rule says. No mark: passes
 * (the stage has none to meet). A mark with its rule unset: not judged, PASS_RULE_NOT_SET.
 */
export function passes(shown: Fixed, passMark: Fixed | null, inclusive: boolean | null): { passed: boolean } | { fault: Finding<ScoreFault> } {
  if (passMark == null) return { passed: true };
  if (inclusive == null) return { fault: { code: "PASS_RULE_NOT_SET", level: "block" } };
  const c = compareFixed(shown, passMark);
  return { passed: c > 0 || (c === 0 && inclusive) };
}

/// The composite: each part's unrounded figure at its weight, summed (E-5: from the unrounded figures).
export const composite = (parts: readonly { percent: Fixed; weight: Fixed }[]): Fixed => sumFixed(...parts.map((p) => mulPct(p.percent, p.weight)));

export const HUNDRED = fixedFromWhole(100);
