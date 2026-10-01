/**
 * One colour for one meaning, wherever a status is shown.
 *
 *   err      refused: a rejection, an outcome that was not carried, a gate that ended
 *   ok       done: approved, passed, carried, verified
 *   warn     needs a person: returned, recalled, lodged and not yet verified
 *   brand    under way
 *   info     a quiet state on the way (scheduled, registered)
 *   neutral  nothing is expected of anyone: a draft, a cancelled record
 *
 * A route, its steps, the requisition's own status and the lists that show them all
 * read from here, so "Rejected" is the same red in a badge, a step, a list and the
 * history of earlier routes.
 */

export type StatusTone = "neutral" | "brand" | "ok" | "warn" | "err" | "info";

/// An approval route (ApprovalInstance.status).
export const ROUTE_STATUS_TONE: Record<"PENDING" | "APPROVED" | "REJECTED" | "RECALLED", StatusTone> = {
  PENDING: "brand",
  APPROVED: "ok",
  REJECTED: "err",
  RECALLED: "warn",
};

/// One step of a route (ApprovalStep.decision).
export const STEP_DECISION_TONE: Record<"PENDING" | "DONE" | "REJECTED", StatusTone> = {
  PENDING: "brand",
  DONE: "ok",
  REJECTED: "err",
};

/// A route's tone, for a status read off a record. Unknown reads neutral.
export function routeTone(status: string): StatusTone {
  return ROUTE_STATUS_TONE[status as keyof typeof ROUTE_STATUS_TONE] ?? "neutral";
}

export function stepTone(decision: string): StatusTone {
  return STEP_DECISION_TONE[decision as keyof typeof STEP_DECISION_TONE] ?? "neutral";
}
