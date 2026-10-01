/**
 * Moving a pending step to another office (FR-APR-009, FR-APR-010, FR-APR-012;
 * rulings CO-6, CO-7, C4).
 *
 * Two reasons, one mechanism. NO_AVAILABLE_HOLDER: nobody able to act holds the office
 * (absent, or vacant), so authority reverts upward — never down. CONFLICT_DECLARED: the
 * holder declares a conflict of interest and recuses, and the step goes one level up
 * (DAL §1.5). Either way the step's own office is never rewritten: the acting office is
 * recorded beside it with the reason, and holders are judged on the acting office.
 *
 * Refused: a committee step (a body does not recuse as a person does); a mandatory step
 * for a vacancy, until RSAJ rules (CO-6 — a declared conflict on one is allowed, as an
 * assumption); an office with nowhere set to escalate to, naming the setting; and an
 * escalation onto an office that already has a step on the same route (C4), since one
 * office's holder would then decide two steps of one matter.
 *
 * Pure.
 */

import { MANDATORY_ACTS, type AuthorityAct } from "./types";

export type StepEscalationKind = "NO_AVAILABLE_HOLDER" | "CONFLICT_DECLARED";

/// Guards a mis-seeded escalation map, as the engine's own reversion does.
export const MAX_STEP_ESCALATIONS = 6;

export type EscalationFault =
  | "TIME_ZONE_UNSET"
  | "ROUTE_CLOSED"
  | "NOT_PENDING"
  | "COMMITTEE_STEP"
  | "REASON_REQUIRED"
  | "MANDATORY_VACANCY"
  | "HOLDER_AVAILABLE"
  | "DECLARER_REQUIRED"
  | "DECLARER_NOT_ENTITLED"
  | "TOO_MANY_HOPS"
  | "NO_SUPERIOR_SET"
  | "SUPERIOR_ALREADY_ON_ROUTE";

export interface EscalationStep {
  id: string;
  sequence: number;
  roleCode: string | null;
  actingRoleCode: string | null;
  committeeCode: string | null;
  act: string;
  decision: string;
  escalationCount: number;
}

/// The office acting for a step: the one it was escalated to, else its own.
export const actingOffice = (s: { roleCode: string | null; actingRoleCode?: string | null }) => s.actingRoleCode ?? s.roleCode;

export type EscalationResult =
  | { ok: true; fromRoleCode: string; toRoleCode: string; kind: StepEscalationKind }
  | { ok: false; fault: EscalationFault; office?: string | null };

export function stepEscalation(
  step: EscalationStep,
  ctx: {
    kind: StepEscalationKind;
    reason: string;
    today: string | null;
    routeOpen: boolean;
    /// Every office's upward escalation, by code.
    roles: Readonly<Record<string, { escalatesToCode: string | null }>>;
    /// The route's steps, this one included.
    routeSteps: readonly Pick<EscalationStep, "id" | "roleCode" | "actingRoleCode">[];
    /// Whether anyone able to act holds the acting office (or a delegation of it) today.
    holderAvailable: boolean;
    /// For a declared conflict: whether the declarer holds the acting office, or a
    /// delegation of it, for this matter today. Null: nobody named.
    declarerEntitled: boolean | null;
  },
): EscalationResult {
  const fail = (fault: EscalationFault, office: string | null = null): EscalationResult => ({ ok: false, fault, office });
  if (ctx.today == null) return fail("TIME_ZONE_UNSET");
  if (!ctx.routeOpen) return fail("ROUTE_CLOSED");
  if (step.decision !== "PENDING") return fail("NOT_PENDING");
  if (step.committeeCode) return fail("COMMITTEE_STEP");
  if (!ctx.reason.trim()) return fail("REASON_REQUIRED");
  const from = actingOffice(step);
  if (!from) return fail("NO_SUPERIOR_SET");
  if (ctx.kind === "NO_AVAILABLE_HOLDER") {
    if (MANDATORY_ACTS.has(step.act as AuthorityAct)) return fail("MANDATORY_VACANCY", from);
    if (ctx.holderAvailable) return fail("HOLDER_AVAILABLE", from);
  } else {
    if (ctx.declarerEntitled == null) return fail("DECLARER_REQUIRED");
    if (!ctx.declarerEntitled) return fail("DECLARER_NOT_ENTITLED", from);
  }
  if (step.escalationCount >= MAX_STEP_ESCALATIONS) return fail("TOO_MANY_HOPS", from);
  const to = ctx.roles[from]?.escalatesToCode ?? null;
  if (!to) return fail("NO_SUPERIOR_SET", from);
  if (ctx.routeSteps.some((s) => s.id !== step.id && actingOffice(s) === to)) return fail("SUPERIOR_ALREADY_ON_ROUTE", to);
  return { ok: true, fromRoleCode: from, toRoleCode: to, kind: ctx.kind };
}
