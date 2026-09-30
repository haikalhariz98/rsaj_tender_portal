/**
 * The sourcing exercise's first states (spec §7.3.2, ruling R-6).
 *
 * Draft: created against an approved requisition whose funding route lets the
 * organisation procure. It leaves Draft for Documents in preparation once method,
 * basis and contract type are set and nothing blocks. Cancelled is an assumption —
 * §7.3.2 gives it no SOP path — and is terminal. Pure: `openFault` and
 * `transitionFault` say why a move cannot be made, and every action asks them on data
 * read under the requisition's row lock.
 */

import type { ExerciseStatus, Finding, ProposalState } from "./types";

export type OpenFault = "TIME_ZONE_UNSET" | "REQUISITION_NOT_APPROVED" | "SOURCING_NOT_PERMITTED" | "SOURCING_NOT_RECORDED" | "NO_APPROVED_ROUTE" | "FULLY_IN_EXERCISES" | "METHODS_NOT_SET";

/// Whether an exercise may be opened on a requisition.
export function openFault(
  /// `remaining`: the approved value not yet in a live exercise, in sen, where known.
  req: { status: string; sourcingPermitted: boolean | null; approvedRoute: boolean; remaining?: bigint | null },
  ctx: { today: string | null; methodsConfigured: boolean },
): Finding<OpenFault> | null {
  const f = (code: OpenFault, data?: Finding["data"]): Finding<OpenFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (req.status !== "APPROVED" && req.status !== "SOURCING") return f("REQUISITION_NOT_APPROVED", { status: req.status });
  if (req.sourcingPermitted === false) return f("SOURCING_NOT_PERMITTED");
  if (req.sourcingPermitted == null) return f("SOURCING_NOT_RECORDED");
  if (!req.approvedRoute) return f("NO_APPROVED_ROUTE");
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
  | "BLOCKING_FAULTS";

export const EXERCISE_TRANSITIONS: Record<ExerciseStatus, readonly ExerciseStatus[]> = {
  DRAFT: ["DOCUMENTS_IN_PREPARATION", "CANCELLED"],
  DOCUMENTS_IN_PREPARATION: ["CANCELLED"],
  CANCELLED: [],
};

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
}

/// Every reason the move cannot be made, so a screen can say them all at once.
export function transitionFault(from: ExerciseStatus, to: ExerciseStatus, ctx: TransitionContext): Finding<TransitionFault>[] {
  const f = (code: TransitionFault, data?: Finding["data"]): Finding<TransitionFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (from === "CANCELLED") return [f("TERMINAL")];
  if (!EXERCISE_TRANSITIONS[from].includes(to)) return [f("NOT_ALLOWED", { from, to })];
  if (ctx.today == null) return [f("TIME_ZONE_UNSET")];
  if (to === "CANCELLED") return (ctx.reason ?? "").trim() ? [] : [f("CANCEL_REASON_REQUIRED")];
  const out: Finding<TransitionFault>[] = [];
  if (!ctx.methodSet) out.push(f("METHOD_NOT_SET"));
  if (!ctx.typeSet) out.push(f("TYPE_NOT_SET"));
  if (!ctx.basisSet) out.push(f("BASIS_NOT_SET"));
  if (ctx.proposalRequired && ctx.proposalState !== "REVIEWED") out.push(f("PROPOSAL_NOT_REVIEWED"));
  if ((ctx.ambiguousTaxonomies ?? 0) > 0) out.push(f("TAXONOMY_AMBIGUOUS", { count: ctx.ambiguousTaxonomies ?? 0 }));
  if ((ctx.blockingFaults ?? 0) > 0) out.push(f("BLOCKING_FAULTS", { count: ctx.blockingFaults ?? 0 }));
  return out;
}
