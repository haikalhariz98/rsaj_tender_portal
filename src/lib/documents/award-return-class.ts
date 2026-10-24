/**
 * The class an award return's scans take when the contractor lodges them online (ADR 0045 D1, WV-5). The acceptance page carries the signatory's identity card number,
 * so the class must be SULIT: the inverse of the project class (`project-class.ts`). Pure: the save and the screen's choice list both call it, so they cannot disagree.
 */

import type { SecurityClass } from "./types";

export const AWARD_RETURN_CLASS_NOT_OURS = "Choose one of this organisation's document classes.";
export const AWARD_RETURN_CLASS_NOT_SULIT = "A returned award holds the signatory's identity card number, so its class must be SULIT. Choose a SULIT class.";

/// The refusal for a chosen class, or null when it will do. `chosen` is the organisation's own row, or null when the id is not one of this organisation's classes.
export function awardReturnClassFault(chosen: { classification: SecurityClass | null } | null): string | null {
  if (!chosen) return AWARD_RETURN_CLASS_NOT_OURS;
  return chosen.classification === "SULIT" ? null : AWARD_RETURN_CLASS_NOT_SULIT;
}

/// The classes the screen offers: SULIT only. Order is kept.
export function eligibleAwardReturnClasses<C extends { classification: SecurityClass | null }>(classes: readonly C[]): C[] {
  return classes.filter((c) => awardReturnClassFault(c) === null);
}
