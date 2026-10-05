/**
 * The requisition state machine (spec §7.3.1), for both entry paths (ADR 0003).
 *
 * Pure: `transitionFault` says why a move cannot be made, or null. No status is ever
 * written without asking it: `moveRequisition` (move.ts) asks it on data read under
 * the requisition's row lock and refuses before writing (close-out ruling C1), so the
 * screen's disabled button and the server's refusal can never disagree.
 */

import type { RequisitionStatus } from "./types";

/**
 * Where each state may go. The §7.3.1 exits, with two readings recorded in the plan's
 * build decisions: Cancelled ("withdrawn before approval") is reachable from every
 * state before Pending DAL Approval, and a re-check may move a checked requisition
 * between Budget Checked and Over Budget as the balance moves.
 */
export const TRANSITIONS: Record<RequisitionStatus, readonly RequisitionStatus[]> = {
  DRAFT: ["ENDORSED", "CANCELLED"],
  ENDORSED: ["REGISTERED", "RETURNED", "CANCELLED"],
  RETURNED: ["DRAFT", "CANCELLED"],
  REGISTERED: ["BUDGET_CHECKED", "OVER_BUDGET", "CANCELLED"],
  BUDGET_CHECKED: ["BUDGET_CHECKED", "PENDING_APPROVAL", "OVER_BUDGET", "CANCELLED"],
  OVER_BUDGET: ["OVER_BUDGET", "BUDGET_CHECKED", "PENDING_APPROVAL", "CANCELLED"],
  // Over budget: returned at approval when the budget no longer covers it (ruling Q2).
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "RECALLED", "OVER_BUDGET"],
  // Back to approval only on a successor route, opened from an earlier step by the
  // rejection destination (FR-APR-016, ADR 0009).
  REJECTED: ["DRAFT", "CLOSED", "PENDING_APPROVAL"],
  RECALLED: ["DRAFT"],
  // Closed without sourcing only when a committee gate has ended it (FR-REQ-012).
  APPROVED: ["SOURCING", "CLOSED"],
  SOURCING: ["FULFILLED", "PARTIALLY_FULFILLED"],
  PARTIALLY_FULFILLED: ["FULFILLED"],
  FULFILLED: ["CLOSED"],
  CANCELLED: [],
  CLOSED: [],
};

/// Terminal, or past approval: the record is immutable except by a controlled change.
export function isLocked(status: RequisitionStatus): boolean {
  return !["DRAFT", "ENDORSED", "RETURNED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET", "PENDING_APPROVAL", "RECALLED", "REJECTED"].includes(status);
}

/// Whether the draft's own fields may be edited.
export function isEditable(status: RequisitionStatus): boolean {
  return status === "DRAFT";
}

export type TransitionFault =
  | { code: "NOT_ALLOWED"; from: RequisitionStatus; to: RequisitionStatus }
  | { code: "TIME_ZONE_UNSET" }
  | { code: "FIELDS_INCOMPLETE"; count: number }
  | { code: "ENDORSEMENTS_INCOMPLETE"; count: number }
  | { code: "ENDORSEMENT_TIERS_NOT_SET" }
  | { code: "RETURN_DETAILS_REQUIRED"; missing: ("reason" | "recipient" | "date")[] }
  | { code: "REASON_REQUIRED" }
  | { code: "FUTURE_DATE" }
  | { code: "STEP_ALREADY_DECIDED" }
  | { code: "SUCCESSOR_REQUIRED" }
  | { code: "GATE_NOT_ENDED" };

export interface TransitionContext {
  /// The organisation's today; null while no time zone is set.
  today: string | null;
  /// Blocking field faults (FR-REQ-001), when leaving Draft.
  fieldFaults?: number;
  /// Endorsement faults (FR-REQ-003), when leaving Draft. `tiersSet` false means the
  /// policy names no tiers, which blocks rather than passing vacuously.
  endorsementFaults?: number;
  tiersSet?: boolean;
  reason?: string;
  returnedToPersonId?: string | null;
  returnedOn?: string | null;
  /// Whether any step of the open approval has been discharged.
  anyStepDone?: boolean;
  /// Rejected back to approval: true only when a successor route is being opened.
  successor?: boolean;
  /// Approved to closed: true only when a committee gate has ended the requisition.
  gateEnded?: boolean;
}

/// Acts that depend on the organisation's today (plan §2.4).
const NEEDS_TODAY: ReadonlySet<RequisitionStatus> = new Set(["ENDORSED", "PENDING_APPROVAL", "APPROVED"]);

export function transitionFault(
  from: RequisitionStatus,
  to: RequisitionStatus,
  ctx: TransitionContext,
): TransitionFault | null {
  if (!TRANSITIONS[from].includes(to)) return { code: "NOT_ALLOWED", from, to };
  if (NEEDS_TODAY.has(to) && ctx.today == null) return { code: "TIME_ZONE_UNSET" };

  switch (to) {
    case "ENDORSED":
      if ((ctx.fieldFaults ?? 0) > 0) return { code: "FIELDS_INCOMPLETE", count: ctx.fieldFaults! };
      if (ctx.tiersSet === false) return { code: "ENDORSEMENT_TIERS_NOT_SET" };
      if ((ctx.endorsementFaults ?? 0) > 0) return { code: "ENDORSEMENTS_INCOMPLETE", count: ctx.endorsementFaults! };
      return null;
    case "REGISTERED":
      // Founder, 2026-10-05: registration never waits for the finance system's numbers. The
      // setting that could require them (OD-10) and the act that recorded them were removed:
      // the customer does not use them.
      return null;
    case "RETURNED": {
      const missing = (
        [
          ["reason", ctx.reason?.trim()],
          ["recipient", ctx.returnedToPersonId],
          ["date", ctx.returnedOn],
        ] as const
      )
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (missing.length > 0) return { code: "RETURN_DETAILS_REQUIRED", missing };
      if (ctx.today == null) return { code: "TIME_ZONE_UNSET" };
      return ctx.returnedOn! > ctx.today ? { code: "FUTURE_DATE" } : null;
    }
    case "RECALLED":
      // FR-APR-017: recall only before the first decision.
      return ctx.anyStepDone ? { code: "STEP_ALREADY_DECIDED" } : null;
    case "PENDING_APPROVAL":
      // From Rejected it goes back only on a successor route (FR-APR-016). Any other
      // way back would re-open a rejected matter without a decision saying so.
      return from === "REJECTED" && ctx.successor !== true ? { code: "SUCCESSOR_REQUIRED" } : null;
    case "CLOSED":
      if (from === "APPROVED" && ctx.gateEnded !== true) return { code: "GATE_NOT_ENDED" };
      return ctx.reason?.trim() ? null : { code: "REASON_REQUIRED" };
    case "CANCELLED":
    case "REJECTED":
      return ctx.reason?.trim() ? null : { code: "REASON_REQUIRED" };
    default:
      return null;
  }
}

/**
 * Close-out ruling C3: nothing on a requisition is edited while a successor route is
 * open — the route continues an approval of the requisition as it stood, and carries
 * decisions taken on it. Its status already holds the draft's fields; this holds the
 * edits allowed beside an approval (finance numbers, the external authority).
 */
export function successorOpenFault(routes: readonly { status: string; supersedesInstanceId: string | null }[]): "SUCCESSOR_OPEN" | null {
  return routes.some((r) => r.status === "PENDING" && r.supersedesInstanceId) ? "SUCCESSOR_OPEN" : null;
}

export const SUCCESSOR_OPEN_TEXT =
  "This requisition's approval continues on a route returned to an earlier step, which carries decisions taken on it as it stood. Nothing on it is edited until that route closes.";
