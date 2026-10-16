/**
 * Who may see a case from a restricted exercise (FR-MTD-007 on merged cases; design note 0004 §6.1; ruling AC-18). Pure.
 *
 * AC-18 keeps today's split exactly, as one rule, and it is reversible:
 * - before issue, a case from a restricted exercise is hidden from anyone not named on it: left out of lists and counts, a
 *   404 by id, and the refusal logged (as `withLockedAwardFor` and `listAwards` do for an award today);
 * - after issue (a Contract row exists), its Award stage stays refused and logged, while its contract stages stay visible, as
 *   Contracts are today. Whether a contract formed from a restricted exercise is itself restricted is RSAJ's to say (R-2).
 *
 * What each answer does on each surface is the table in §6.1 (ADR 0037); the surfaces apply it, they never restate it.
 *
 * `actorNamed` is whether the reader passes `exerciseVisible` as a person on this exercise: named on it, and not an
 * administrator (an administrator is never let into a restricted exercise by being named). `system` is a loader run, the
 * operator's own process, which sees everything as `hiddenExerciseIds` does.
 */

import type { Prisma } from "@/generated/prisma/client";

export interface CaseVisibilityInput {
  restricted: boolean;
  actorNamed: boolean;
  system: boolean;
  /** A Contract row exists for the award: it has been issued. */
  issued: boolean;
}

export type CaseVisibility = "WHOLE" | "CONTRACT_STAGES_ONLY" | "HIDDEN";

export function caseVisibility(i: CaseVisibilityInput): CaseVisibility {
  if (!i.restricted || i.system || i.actorNamed) return "WHOLE";
  return i.issued ? "CONTRACT_STAGES_ONLY" : "HIDDEN";
}

/**
 * The same rule as a filter on the Award table, for lists and counts: it leaves out exactly the HIDDEN cases. `hidden` is
 * `hiddenExerciseIds`' answer for the reader, the restricted exercises they may not see; a case of one of those is kept
 * once its contract exists (CONTRACT_STAGES_ONLY: listed, with only the contract's columns). `Award.exerciseId` is
 * required, so its `notIn` has no SQL NULL to trip on.
 */
export function caseVisibilityWhere(hidden: readonly string[]): Prisma.AwardWhereInput {
  return hidden.length ? { OR: [{ exerciseId: { notIn: [...hidden] } }, { contract: { isNot: null } }] } : {};
}
