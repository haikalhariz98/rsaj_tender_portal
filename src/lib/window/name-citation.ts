/**
 * Whether a committee matter may discharge a committee step of a name route (FR-MTD-008; 6.3
 * BD-7 lifted by 6.5, OD-12). The award's `exerciseCitationFault` refuses anything outside the
 * appointment, so the name has its own check: only a matter tabled as an exercise matter against
 * this exercise, on the approval of the name, before the step's committee, for the step's act,
 * not already cited by another step (one decision discharges one step), and decided no earlier
 * than the route opened. There is no amount test: the name is approved, not a value. A person's
 * decision on a committee step is refused by 6.1's `deciderFaults`. Pure.
 */

import { NAME_APPROVAL_DOMAIN } from "@/lib/method/types";

export type NameCitationFault = "NOT_THIS_EXERCISE" | "NOT_A_NAME_MATTER" | "OTHER_COMMITTEE" | "OTHER_ACT" | "ALREADY_CITED" | "DECIDED_BEFORE_ROUTE";

export function nameCitationFault(
  matter: { id: string; exerciseId: string | null; matterKind: string | null; domain: string; act: string; committeeCode: string; decidedOn: string | null },
  step: { committeeCode: string | null; act: string },
  exerciseId: string,
  /// The day the name route opened, YYYY-MM-DD.
  routeOpenedOn: string,
  /// Decisions already discharging a step, of any route.
  citedDecisionIds: readonly string[],
): NameCitationFault | null {
  if (matter.exerciseId !== exerciseId) return "NOT_THIS_EXERCISE";
  if (matter.matterKind !== "EXERCISE" || matter.domain !== NAME_APPROVAL_DOMAIN) return "NOT_A_NAME_MATTER";
  if (matter.committeeCode !== step.committeeCode) return "OTHER_COMMITTEE";
  if (matter.act !== step.act) return "OTHER_ACT";
  if (citedDecisionIds.includes(matter.id)) return "ALREADY_CITED";
  if (matter.decidedOn && matter.decidedOn < routeOpenedOn) return "DECIDED_BEFORE_ROUTE";
  return null;
}
