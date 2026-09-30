/**
 * Whether a committee matter may discharge a committee step of an appointment route
 * (6.3 BD-3 carry-over, 6.11 ruling on FR-AWD-001).
 *
 * Only a matter tabled as an exercise matter against this award's exercise, before the
 * step's committee, for the step's act, on the appointment, at the awarded value (or
 * with no amount), and not already cited by another step — one decision discharges
 * one step. A person decision on a committee step is refused by 6.1's `deciderFaults`.
 */

import { compareAmounts } from "@/lib/money";
import { APPOINTMENT_DOMAIN } from "@/lib/method/types";

export type ExerciseCitationFault = "NOT_THIS_EXERCISE" | "NOT_AN_APPOINTMENT_MATTER" | "OTHER_COMMITTEE" | "OTHER_ACT" | "OTHER_AMOUNT" | "ALREADY_CITED" | "DECIDED_BEFORE_ROUTE";

export function exerciseCitationFault(
  matter: { id: string; exerciseId: string | null; matterKind: string | null; domain: string; act: string; amount: string | null; committeeCode: string; decidedOn: string | null },
  step: { committeeCode: string | null; act: string },
  award: { exerciseId: string; value: string; routeOpenedOn: string },
  citedDecisionIds: readonly string[],
): ExerciseCitationFault | null {
  if (matter.exerciseId !== award.exerciseId) return "NOT_THIS_EXERCISE";
  if (matter.matterKind !== "EXERCISE" || matter.domain !== APPOINTMENT_DOMAIN) return "NOT_AN_APPOINTMENT_MATTER";
  if (matter.committeeCode !== step.committeeCode) return "OTHER_COMMITTEE";
  if (matter.act !== step.act) return "OTHER_ACT";
  if (matter.amount != null && compareAmounts(matter.amount, award.value) !== 0) return "OTHER_AMOUNT";
  if (citedDecisionIds.includes(matter.id)) return "ALREADY_CITED";
  if (matter.decidedOn && matter.decidedOn < award.routeOpenedOn) return "DECIDED_BEFORE_ROUTE";
  return null;
}
