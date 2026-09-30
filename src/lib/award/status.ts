/**
 * Where an award stands (§7.3.2 Awarded, §7.3.3 Number Allocated).
 *
 * Draft → submitted for the appointment's approval → approved → issued → accepted. A
 * refused route returns the award to Draft to be reworked; the refused route stays on
 * record and the next submission opens a new one (ADR 0005). Cancellation needs a
 * reason, and an issued award may be cancelled only before it is returned or work has
 * commenced — an indent never started, or a letter never returned. Accepted is not
 * cancelled: termination is Phase 5. The exercise's own status is not moved until 6.5
 * adds Awarded; until then the award says it.
 */

import type { AwardStatus } from "./types";

export type AwardTransitionFault =
  | "TERMINAL"
  | "NOT_ALLOWED"
  | "TIME_ZONE_UNSET"
  | "CANCEL_REASON_REQUIRED"
  | "ALREADY_RETURNED"
  | "ALREADY_COMMENCED"
  | "RETURN_INCOMPLETE"
  | "ACCEPTED_NOT_CANCELLED";

export const AWARD_TRANSITIONS: Record<AwardStatus, readonly AwardStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["ISSUED", "CANCELLED"],
  ISSUED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: [],
  CANCELLED: [],
};

export function awardTransition(
  from: AwardStatus,
  to: AwardStatus,
  ctx: { today: string | null; reason?: string; returned?: boolean; commenced?: boolean; returnComplete?: boolean },
): AwardTransitionFault | null {
  if (from === "CANCELLED") return "TERMINAL";
  if (from === "ACCEPTED" && to === "CANCELLED") return "ACCEPTED_NOT_CANCELLED";
  if (!AWARD_TRANSITIONS[from].includes(to)) return "NOT_ALLOWED";
  if (ctx.today == null) return "TIME_ZONE_UNSET";
  if (to === "CANCELLED") {
    if (!(ctx.reason ?? "").trim()) return "CANCEL_REASON_REQUIRED";
    if (from === "ISSUED" && ctx.returned) return "ALREADY_RETURNED";
    if (from === "ISSUED" && ctx.commenced) return "ALREADY_COMMENCED";
  }
  if (to === "ACCEPTED" && !ctx.returnComplete) return "RETURN_INCOMPLETE";
  return null;
}

/// Statuses in which the award holds value against its requisition.
export const LIVE_STATUSES: readonly AwardStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED"];

/// What may still be edited: the awardee, value and period only in Draft (they are what
/// the appointment approves); the letter's terms and the bond until issue.
export const editable = (s: AwardStatus) => ({ details: s === "DRAFT", terms: s === "DRAFT" || s === "PENDING_APPROVAL" || s === "APPROVED" });
