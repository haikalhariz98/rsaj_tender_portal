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
      return "Set the organisation's time zone first: the escalation is dated on its day.";
    case "ROUTE_CLOSED":
      return "The route is no longer open.";
    case "NOT_PENDING":
      return "This step is already decided.";
    case "COMMITTEE_STEP":
      return "A committee's step is not escalated: a member with a conflict recuses on the matter at the sitting.";
    case "REASON_REQUIRED":
      return "Say why the step is escalated.";
    case "MANDATORY_VACANCY":
      return `This is a mandatory step, which cannot be moved for a vacancy until the organisation rules on it. Record a holder of the ${o} office, or reject the matter with the reason.`;
    case "HOLDER_AVAILABLE":
      return `Someone able to act holds the ${o} office, so the step is not moved for want of a holder. Record their decision, or, if they have a conflict, declare it.`;
    case "DECLARER_REQUIRED":
      return "Name who declares the conflict.";
    case "DECLARER_NOT_ENTITLED":
      return `Only someone who could decide this step — a holder of the ${o} office for this matter, or their delegate — declares a conflict on it.`;
    case "TOO_MANY_HOPS":
      return "This step has been escalated as far as it may go. Check where each office escalates to under Users & roles.";
    case "NO_SUPERIOR_SET":
      return `No office is set for the ${o} to escalate to. Set where it escalates to under Users & roles, then escalate again.`;
    case "SUPERIOR_ALREADY_ON_ROUTE":
      return `The ${o} already has a step on this route, and one office does not decide two steps of one matter. Record a delegation of the office to someone with no other step on the route, or reject the matter with the reason.`;
  }
}
