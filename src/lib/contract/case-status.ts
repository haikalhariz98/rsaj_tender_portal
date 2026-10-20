/**
 * The one status a case's row shows (founder, 2026-10-20: "the status is too much status ... show only one status"). Pure.
 *
 * A row knows several statuses at once: how the case ended, the contract's phase, In Delay, and the checks the Awards list always
 * carried. This picks the one that matters most and keeps the rest, in order, for the tooltip and the CSV. Nothing is computed
 * here: every candidate arrives already worded; only the order is decided.
 *
 * Order: problems that need action (worst first), then what the case is waiting for, then the lifecycle status.
 */

export type StatusKind =
  // Problems that need action, worst first.
  | "TERMINATED"
  | "INDENT_EXPIRED"
  | "IN_DELAY"
  | "RETURNED_FOR_AMENDMENT"
  | "CANCELLED"
  | "NO_SECURITIES"
  // What the case is waiting for.
  | "AWAITING_APPROVAL"
  | "TO_ISSUE"
  | "AWAITING_RETURN"
  | "TO_VERIFY"
  | "NO_COMMITMENT"
  | "AWAITING_CONDITIONS"
  | "BEING_PREPARED"
  // Where the case stands in its life: Draft, Number allocated, In preparation, Signed, Active, Completed ...
  | "LIFECYCLE";

/// Highest priority first. The position in this list is the rank.
export const STATUS_PRIORITY: readonly StatusKind[] = [
  "TERMINATED",
  "INDENT_EXPIRED",
  "IN_DELAY",
  "RETURNED_FOR_AMENDMENT",
  "CANCELLED",
  "NO_SECURITIES",
  "AWAITING_APPROVAL",
  "TO_ISSUE",
  "AWAITING_RETURN",
  "TO_VERIFY",
  "NO_COMMITMENT",
  "AWAITING_CONDITIONS",
  "BEING_PREPARED",
  "LIFECYCLE",
];

export interface StatusCandidate {
  kind: StatusKind;
  text: string;
  tone?: "ok" | "warn" | "err" | "info" | "brand";
  provenance?: "STATED" | "OBSERVED" | "ASSUMED";
}

/// The kind of a contract's phase (the status stored or derived for a contract). Phases that are plain lifecycle say so.
export function phaseKind(phase: string): StatusKind {
  switch (phase) {
    case "TERMINATED":
      return "TERMINATED";
    case "CANCELLED":
      return "CANCELLED";
    case "RETURNED_FOR_AMENDMENT":
      return "RETURNED_FOR_AMENDMENT";
    case "PENDING_LEGAL_ENDORSEMENT":
      return "AWAITING_APPROVAL";
    case "AWAITING_CONDITIONS":
      return "AWAITING_CONDITIONS";
    default:
      return "LIFECYCLE";
  }
}

/// The kind of how a case ended.
export function endedKind(ended: "CANCELLED_BEFORE_ISSUE" | "CONTRACT_CANCELLED" | "TERMINATED"): StatusKind {
  return ended === "TERMINATED" ? "TERMINATED" : "CANCELLED";
}

export interface CaseStatus {
  /** The one status the row shows; null only where the row has none. */
  primary: StatusCandidate | null;
  /** Every other status, in priority order. */
  others: StatusCandidate[];
}

export function primaryCaseStatus(candidates: readonly StatusCandidate[]): CaseStatus {
  // Array.prototype.sort is stable, so equal ranks keep the order the row supplied.
  const ranked = [...candidates].sort((a, b) => STATUS_PRIORITY.indexOf(a.kind) - STATUS_PRIORITY.indexOf(b.kind));
  const [primary = null, ...others] = ranked;
  return { primary, others };
}
