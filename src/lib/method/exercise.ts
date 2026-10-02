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
  | "DATES_REQUIRED"
  | "PUBLISH_NOT_READY"
  | "UNSEAL_NOT_AUTHORISED"
  | "OPENING_NOT_READY"
  | "EVALUATION_NOT_READY"
  | "REPORT_NOT_READY";

export const EXERCISE_TRANSITIONS: Record<ExerciseStatus, readonly ExerciseStatus[]> = {
  DRAFT: ["DOCUMENTS_IN_PREPARATION", "CANCELLED"],
  DOCUMENTS_IN_PREPARATION: ["PENDING_APPROVAL_FOR_TENDERING", "CANCELLED"],
  PENDING_APPROVAL_FOR_TENDERING: ["APPROVED_FOR_TENDERING", "DOCUMENTS_IN_PREPARATION", "CANCELLED"],
  APPROVED_FOR_TENDERING: ["ADVERTISED", "INVITED", "CANCELLED"],
  // 6.5: once published, the exercise is cancelled only through its window_change route (FR-ADV-016).
  // 6.7: the box is opened only on the second of two authorisations (UNSEAL), and the main opening's
  // finalising makes it Opened; cancelling stays the window_change route's (C-9).
  ADVERTISED: ["OPENING_IN_PROGRESS", "CANCELLED"],
  INVITED: ["OPENING_IN_PROGRESS", "CANCELLED"],
  OPENING_IN_PROGRESS: ["OPENED", "CANCELLED"],
  // 6.8: the evaluation starts on the pinned model (EVALUATION_STARTED); issuing its report makes it
  // Evaluated (REPORT_ISSUED); a new version reopens it (EVALUATION_REOPENED: a NOT_CARRIED loop or a
  // supplementary opening's finalising, FR-CTE-009, E-7). Cancelling stays the window_change route's (E-10).
  OPENED: ["UNDER_EVALUATION", "CANCELLED"],
  UNDER_EVALUATION: ["EVALUATED", "CANCELLED"],
  EVALUATED: ["UNDER_EVALUATION", "CANCELLED"],
  CANCELLED: [],
};

/// The one act that makes each tendering move (§7.3.2): submitting the pack, the route's
/// approving step, and a rejection that returns the pack for amendment; 6.5's publication (or
/// invitation), and the approving step of a cancellation on the window_change route; 6.7's
/// unseal (the second authorisation) and the main opening's finalising; 6.8's start of the evaluation,
/// the issue of its report, and a new version reopening it.
export type TenderingAct = "SUBMISSION" | "APPROVAL" | "RETURN" | "PUBLICATION" | "WINDOW_CANCELLATION" | "UNSEAL" | "OPENING_FINALISED" | "EVALUATION_STARTED" | "REPORT_ISSUED" | "EVALUATION_REOPENED";

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
  /// 6.5: blocking findings of the publication checks (`publishFaults`). Not given: not judged, refused.
  publishFaults?: number;
  /// 6.7: distinct present panel members who authorised the unseal at this sitting. Not given: refused.
  authorisations?: number;
  /// 6.7: blocking findings of the main opening's finalise checks (`finaliseFaults`). Not given: refused.
  finaliseFaults?: number;
  /// 6.8: blocking findings of the evaluation's start checks (`startFaults`). Not given: refused.
  startFaults?: number;
  /// 6.8: blocking findings of the report's issue checks (`reportFaults`). Not given: refused.
  reportFaults?: number;
}

/// Which act makes a move between two states, where only one may.
function actFor(from: ExerciseStatus, to: ExerciseStatus): TenderingAct | null {
  if (from === "DOCUMENTS_IN_PREPARATION" && to === "PENDING_APPROVAL_FOR_TENDERING") return "SUBMISSION";
  if (from === "PENDING_APPROVAL_FOR_TENDERING" && to === "APPROVED_FOR_TENDERING") return "APPROVAL";
  if (from === "PENDING_APPROVAL_FOR_TENDERING" && to === "DOCUMENTS_IN_PREPARATION") return "RETURN";
  if (from === "APPROVED_FOR_TENDERING" && (to === "ADVERTISED" || to === "INVITED")) return "PUBLICATION";
  if ((from === "ADVERTISED" || from === "INVITED" || from === "OPENING_IN_PROGRESS" || from === "OPENED" || from === "UNDER_EVALUATION" || from === "EVALUATED") && to === "CANCELLED") return "WINDOW_CANCELLATION";
  if ((from === "ADVERTISED" || from === "INVITED") && to === "OPENING_IN_PROGRESS") return "UNSEAL";
  if (from === "OPENING_IN_PROGRESS" && to === "OPENED") return "OPENING_FINALISED";
  if (from === "OPENED" && to === "UNDER_EVALUATION") return "EVALUATION_STARTED";
  if (from === "UNDER_EVALUATION" && to === "EVALUATED") return "REPORT_ISSUED";
  if (from === "EVALUATED" && to === "UNDER_EVALUATION") return "EVALUATION_REOPENED";
  return null;
}

/// Every reason the move cannot be made, so a screen can say them all at once.
export function transitionFault(from: ExerciseStatus, to: ExerciseStatus, ctx: TransitionContext): Finding<TransitionFault>[] {
  const f = (code: TransitionFault, data?: Finding["data"]): Finding<TransitionFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (from === "CANCELLED") return [f("TERMINAL")];
  if (!EXERCISE_TRANSITIONS[from].includes(to)) return [f("NOT_ALLOWED", { from, to })];
  if (ctx.today == null) return [f("TIME_ZONE_UNSET")];
  // The act is asked first: an advertised or invited exercise is cancelled only by its route (6.5).
  const act = actFor(from, to);
  if (act) {
    if (ctx.via !== act) return [f("NOT_BY_THIS_ACT", { act })];
    if (act === "SUBMISSION" && ctx.packFaults !== 0) return [f("PACK_NOT_READY", { count: ctx.packFaults ?? null })];
    if (act === "APPROVAL" && !ctx.datesSet) return [f("DATES_REQUIRED")];
    if (act === "PUBLICATION" && ctx.publishFaults !== 0) return [f("PUBLISH_NOT_READY", { count: ctx.publishFaults ?? null })];
    if (act === "WINDOW_CANCELLATION" && !(ctx.reason ?? "").trim()) return [f("CANCEL_REASON_REQUIRED")];
    // Two distinct present panel members (FR-OPN-003, C-2); the action counts them on locked rows.
    if (act === "UNSEAL" && (ctx.authorisations ?? 0) < 2) return [f("UNSEAL_NOT_AUTHORISED", { count: ctx.authorisations ?? null })];
    if (act === "OPENING_FINALISED" && ctx.finaliseFaults !== 0) return [f("OPENING_NOT_READY", { count: ctx.finaliseFaults ?? null })];
    if (act === "EVALUATION_STARTED" && ctx.startFaults !== 0) return [f("EVALUATION_NOT_READY", { count: ctx.startFaults ?? null })];
    if (act === "REPORT_ISSUED" && ctx.reportFaults !== 0) return [f("REPORT_NOT_READY", { count: ctx.reportFaults ?? null })];
    return [];
  }
  if (to === "CANCELLED") return (ctx.reason ?? "").trim() ? [] : [f("CANCEL_REASON_REQUIRED")];
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
