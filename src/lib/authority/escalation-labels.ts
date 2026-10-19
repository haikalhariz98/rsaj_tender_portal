/**
 * How an escalated step reads. Codes stay here; a screen gets words.
 */

import type { EscalationFault, StepEscalationKind } from "./escalation";

export const ESCALATION_KIND_LABEL: Record<StepEscalationKind, string> = {
  NO_AVAILABLE_HOLDER: "Nobody able to act holds the office",
  CONFLICT_DECLARED: "Conflict of interest declared",
};

/// "<acting> · escalated from <office>: <why> — <reason>". The step's own office is kept.
export function escalationText(s: {
  roleLabel: string;
  actingRoleLabel: string | null;
  escalation: StepEscalationKind | null;
  escalationReason: string | null;
  declaredByName: string | null;
}, /// Who declared it and how it was recorded, read from the step's attribution (Phase 2b): the words of `routeActed(...).declared`. Without it, the name alone.
declaredActed?: string | null): string | null {
  if (!s.escalation || !s.actingRoleLabel) return null;
  const why =
    s.escalation === "CONFLICT_DECLARED"
      ? (declaredActed ?? `conflict declared by ${s.declaredByName ?? "a person no longer on record"}`)
      : "nobody able to act held the office";
  return `${s.actingRoleLabel} · escalated from ${s.roleLabel}: ${why}${s.escalationReason ? ` — ${s.escalationReason}` : ""}`;
}

export function escalationFaultText(f: EscalationFault, office: string | null): string {
  const o = office ?? "this office";
  switch (f) {
    case "TIME_ZONE_UNSET":
      return "Time zone not set. An administrator sets it under Organisation.";
    case "ROUTE_CLOSED":
      return "The route is no longer open.";
    case "NOT_PENDING":
      return "This step is already decided.";
    case "COMMITTEE_STEP":
      return "Committee steps are not escalated. A conflicted member recuses at the sitting.";
    case "REASON_REQUIRED":
      return "Give a reason.";
    case "MANDATORY_VACANCY":
      return `Mandatory step: not moved for a vacancy. Record a ${o} holder, or reject.`;
    case "HOLDER_AVAILABLE":
      return `A ${o} holder can act. Record their decision, or declare a conflict.`;
    case "DECLARER_REQUIRED":
      return "Name who declares the conflict.";
    case "DECLARER_NOT_ENTITLED":
      return `Only a ${o} holder or delegate can declare a conflict here.`;
    case "TOO_MANY_HOPS":
      return "Already escalated as far as it goes. Check Users & roles.";
    case "NO_SUPERIOR_SET":
      return `${o} has no office to escalate to. Set one under Users & roles.`;
    case "SUPERIOR_ALREADY_ON_ROUTE":
      return `${o} already has a step on this route. Delegate to someone with no other step, or reject.`;
  }
}
