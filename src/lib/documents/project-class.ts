/**
 * The class a project's files take (simple Project workspace, step 3). A project file is
 * downloaded by the contractor, so its class must be classified and must not be SULIT.
 * Pure: the save and the screen's choice list both call it, so they cannot disagree.
 */

import type { SecurityClass } from "./types";

export const PROJECT_CLASS_NOT_OURS = "Choose one of this organisation's document classes.";
export const PROJECT_CLASS_UNCLASSIFIED = "Set this class's classification first. A project file is downloaded by the contractor, so its class must be classified.";
export const PROJECT_CLASS_SULIT = "A contractor downloads project files, so their class cannot be SULIT. Choose another class.";

/// The refusal for a chosen class, or null when it will do. `chosen` is the organisation's own row, or null when the id is not one of this organisation's classes.
export function projectClassFault(chosen: { classification: SecurityClass | null } | null): string | null {
  if (!chosen) return PROJECT_CLASS_NOT_OURS;
  if (chosen.classification == null) return PROJECT_CLASS_UNCLASSIFIED;
  if (chosen.classification === "SULIT") return PROJECT_CLASS_SULIT;
  return null;
}

/// The classes the screen offers: classified and not SULIT. Order is kept.
export function eligibleProjectClasses<C extends { classification: SecurityClass | null }>(classes: readonly C[]): C[] {
  return classes.filter((c) => projectClassFault(c) === null);
}
