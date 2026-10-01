/**
 * The sourcing exercise's states (spec §7.3.2, ruling R-6; 6.4 adds the tendering states).
 *
 * Draft: created against an approved requisition whose funding route lets the
 * organisation procure. It leaves Draft for Documents in preparation once method,
 * basis, contract type and the method's document pack are set and nothing blocks. From
 * there the tender pack is submitted (Pending approval for tendering), and the route's
 * approving step either approves it with the start and closing recorded (Approved for
 * tendering) or returns it for amendment (back to Documents in preparation, Q-3). Each of
 * those moves is made by one act only (`via`). Cancelled is an assumption — §7.3.2
 * gives it no SOP path — reachable from every state before it, and terminal. Pure: `openFault` and
 * `transitionFault` say why a move cannot be made, and every action asks them on data
 * read under the requisition's row lock.
 */

import type { GateFinding } from "@/lib/requisition/gate";

import type { ExerciseStatus, Finding, PackKind, ProposalState } from "./types";

export type OpenFault =
  | "TIME_ZONE_UNSET"
  | "REQUISITION_NOT_APPROVED"
  | "SOURCING_NOT_PERMITTED"
  | "SOURCING_NOT_RECORDED"
  | "NO_APPROVED_ROUTE"
  | "FULLY_IN_EXERCISES"
  | "METHODS_NOT_SET"
  | "GATES_NOT_DETERMINED"
  | "GATE_AWAITING"
  | "GATE_RETURNED"
  | "GATE_ENDED"
  | "GATE_OUTCOME_NOT_RECORDED";

/**
 * Whether an exercise may be opened on a requisition. The committee gate (FR-REQ-012)
 * must be clear: `ctx.gate` is required, and a caller that has not looked — undefined
 * at run time — is refused as undetermined, never passed (ruling C2).
 */
export function openFault(
  /// `remaining`: the approved value not yet in a live exercise, in sen, where known.
  req: { status: string; sourcingPermitted: boolean | null; approvedRoute: boolean; remaining?: bigint | null },
  ctx: { today: string | null; methodsConfigured: boolean; gate: GateFinding },
): Finding<OpenFault> | null {
  const f = (code: OpenFault, data?: Finding["data"]): Finding<OpenFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (req.status !== "APPROVED" && req.status !== "SOURCING") return f("REQUISITION_NOT_APPROVED", { status: req.status });
  if (req.sourcingPermitted === false) return f("SOURCING_NOT_PERMITTED");
  if (req.sourcingPermitted == null) return f("SOURCING_NOT_RECORDED");
  if (!req.approvedRoute) return f("NO_APPROVED_ROUTE");
  const gate: GateFinding = ctx.gate ?? { code: "GATES_NOT_DETERMINED", why: "NOT_CHECKED" };
  if (gate.code === "GATES_NOT_DETERMINED") return f("GATES_NOT_DETERMINED", { why: gate.why });
  if (gate.code !== "CLEAR") return f(gate.code, { committee: gate.committee });
  // Its live exercises already hold all it was approved for (UX 7, ruling R-16).
  if (req.remaining != null && req.remaining <= 0n) return f("FULLY_IN_EXERCISES");
  if (ctx.today == null) return f("TIME_ZONE_UNSET");
  if (!ctx.methodsConfigured) return f("METHODS_NOT_SET");
  return null;
}

export type TransitionFault =
  | "TERMINAL"
  | "NOT_ALLOWED"
  | "TIME_ZONE_UNSET"
  | "CANCEL_REASON_REQUIRED"
  | "METHOD_NOT_SET"
  | "TYPE_NOT_SET"
  | "BASIS_NOT_SET"
  | "PROPOSAL_NOT_REVIEWED"
  | "TAXONOMY_AMBIGUOUS"
  | "BLOCKING_FAULTS"
  | "DOCUMENTS_RULE_NOT_SET"
  | "NOT_BY_THIS_ACT"
  | "PACK_NOT_READY"
  | "DATES_REQUIRED";

export const EXERCISE_TRANSITIONS: Record<ExerciseStatus, readonly ExerciseStatus[]> = {
  DRAFT: ["DOCUMENTS_IN_PREPARATION", "CANCELLED"],
  DOCUMENTS_IN_PREPARATION: ["PENDING_APPROVAL_FOR_TENDERING", "CANCELLED"],
  PENDING_APPROVAL_FOR_TENDERING: ["APPROVED_FOR_TENDERING", "DOCUMENTS_IN_PREPARATION", "CANCELLED"],
  APPROVED_FOR_TENDERING: ["CANCELLED"],
  CANCELLED: [],
};

/// The one act that makes each tendering move (§7.3.2): submitting the pack, the route's
/// approving step, and a rejection that returns the pack for amendment.
export type TenderingAct = "SUBMISSION" | "APPROVAL" | "RETURN";

export interface TransitionContext {
  today: string | null;
  reason?: string;
  methodSet?: boolean;
  typeSet?: boolean;
  basisSet?: boolean;
  proposalRequired?: boolean;
  proposalState?: ProposalState | null;
  ambiguousTaxonomies?: number;
  /// Blocking findings from the other checks (value, selection, justification, scope).
  blockingFaults?: number;
  /// 6.4: the method's document pack kind, for the move into preparation. Null or not given:
  /// not set, and the move is refused naming the setting (never read as "no pack").
  packKind?: PackKind | null;
  /// 6.4: the act making a tendering move. A tendering move by any other act is refused.
  via?: TenderingAct;
  /// 6.4: blocking findings of the pack's submission checks (`submitFaults`). Not given: not judged, refused.
  packFaults?: number;
  /// 6.4: the approving step recorded the start and closing (FR-DOC-012).
  datesSet?: boolean;
}

/// Which act makes a move between two states, where only one may.
function actFor(from: ExerciseStatus, to: ExerciseStatus): TenderingAct | null {
  if (from === "DOCUMENTS_IN_PREPARATION" && to === "PENDING_APPROVAL_FOR_TENDERING") return "SUBMISSION";
  if (from === "PENDING_APPROVAL_FOR_TENDERING" && to === "APPROVED_FOR_TENDERING") return "APPROVAL";
  if (from === "PENDING_APPROVAL_FOR_TENDERING" && to === "DOCUMENTS_IN_PREPARATION") return "RETURN";
  return null;
}

/// Every reason the move cannot be made, so a screen can say them all at once.
export function transitionFault(from: ExerciseStatus, to: ExerciseStatus, ctx: TransitionContext): Finding<TransitionFault>[] {
  const f = (code: TransitionFault, data?: Finding["data"]): Finding<TransitionFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (from === "CANCELLED") return [f("TERMINAL")];
  if (!EXERCISE_TRANSITIONS[from].includes(to)) return [f("NOT_ALLOWED", { from, to })];
  if (ctx.today == null) return [f("TIME_ZONE_UNSET")];
  if (to === "CANCELLED") return (ctx.reason ?? "").trim() ? [] : [f("CANCEL_REASON_REQUIRED")];
  const act = actFor(from, to);
  if (act) {
    if (ctx.via !== act) return [f("NOT_BY_THIS_ACT", { act })];
    if (act === "SUBMISSION" && ctx.packFaults !== 0) return [f("PACK_NOT_READY", { count: ctx.packFaults ?? null })];
    if (act === "APPROVAL" && !ctx.datesSet) return [f("DATES_REQUIRED")];
    return [];
  }
  const out: Finding<TransitionFault>[] = [];
  if (!ctx.methodSet) out.push(f("METHOD_NOT_SET"));
  if (!ctx.typeSet) out.push(f("TYPE_NOT_SET"));
  if (!ctx.basisSet) out.push(f("BASIS_NOT_SET"));
  if (ctx.proposalRequired && ctx.proposalState !== "REVIEWED") out.push(f("PROPOSAL_NOT_REVIEWED"));
  if ((ctx.ambiguousTaxonomies ?? 0) > 0) out.push(f("TAXONOMY_AMBIGUOUS", { count: ctx.ambiguousTaxonomies ?? 0 }));
  if ((ctx.blockingFaults ?? 0) > 0) out.push(f("BLOCKING_FAULTS", { count: ctx.blockingFaults ?? 0 }));
  // 6.4: the method's document pack decides what preparation assembles; unset blocks.
  if (ctx.packKind == null) out.push(f("DOCUMENTS_RULE_NOT_SET"));
  return out;
}
