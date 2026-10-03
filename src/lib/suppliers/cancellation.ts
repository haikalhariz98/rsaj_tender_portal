/**
 * A registration cancelled by a registration body (615-C2 as narrowed, BD-613-91; ADR 0019 Amendment 1; FR-ADV-010,
 * which reads an external registration). Pure.
 *
 * - **Recorded as a fact**, never decided here: the body (a configured registration body), the body's reference and
 *   the day it takes effect, by an officer recorded on their behalf, not signed. No route. The body's notice is
 *   attached on the record afterwards (REGISTRATION_CANCELLATION_NOTICE); until it is, the record says so.
 * - **One at a time.** A cancellation in effect refuses another; a later one waits for the first to be withdrawn.
 * - **Withdrawn when made in error**, with a reason: the row is kept and shown withdrawn, and the standing rule reads it
 *   as never in effect. A cancellation that stood is lifted by a new registration, not by a withdrawal.
 * - Not built (no requirement): the organisation's own cancellation, its request and its route.
 */

import type { StandingReading } from "./standing";
import type { Finding } from "./types";

export type CancellationFault =
  | "TIME_ZONE_UNSET"
  | "CANCELLATION_NEEDS_REGISTRATION"
  | "ALREADY_CANCELLED"
  | "CANCELLING_BODY_REQUIRED"
  | "CANCELLING_BODY_NOT_CONFIGURED"
  | "CANCELLATION_REFERENCE_REQUIRED"
  | "EFFECTIVE_REQUIRED"
  | "EFFECTIVE_IN_FUTURE"
  | "EFFECTIVE_BEFORE_REGISTRATION"
  | "PERSON_REQUIRED"
  | "NOT_A_CANCELLATION"
  | "CANCELLATION_ALREADY_WITHDRAWN"
  | "CANCELLATION_WITHDRAW_REASON_REQUIRED";

/// The longest reference kept, as typed (a body's notice number).
export const CANCELLATION_REFERENCE_MAX = 200;

export interface CancellationInput {
  bodyId: string | null;
  reference: string;
  effectiveOn: string | null;
  personActive: boolean;
}

export interface CancellationContext {
  today: string | null;
  /// The supplier's status (APPLICANT, REGISTERED, REJECTED).
  status: string;
  registeredOn: string | null;
  reading: StandingReading;
  /// Whether the body chosen is one the organisation configures. Null: none chosen.
  bodyConfigured: boolean | null;
}

/// Recording a registration body's cancellation of the supplier's registration.
export function recordCancellationFaults(i: CancellationInput, ctx: CancellationContext): Finding<CancellationFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<CancellationFault>[] = [];
  if (ctx.status !== "REGISTERED") out.push({ code: "CANCELLATION_NEEDS_REGISTRATION", level: "block" });
  else if (ctx.reading.cancellation) out.push({ code: "ALREADY_CANCELLED", level: "block", data: { since: ctx.reading.cancellation.effectiveOn } });
  if (!i.bodyId) out.push({ code: "CANCELLING_BODY_REQUIRED", level: "block" });
  else if (ctx.bodyConfigured !== true) out.push({ code: "CANCELLING_BODY_NOT_CONFIGURED", level: "block" });
  if (!i.reference.trim()) out.push({ code: "CANCELLATION_REFERENCE_REQUIRED", level: "block" });
  if (!i.effectiveOn) out.push({ code: "EFFECTIVE_REQUIRED", level: "block" });
  else if (i.effectiveOn > ctx.today) out.push({ code: "EFFECTIVE_IN_FUTURE", level: "block" });
  else if (ctx.registeredOn && i.effectiveOn < ctx.registeredOn) out.push({ code: "EFFECTIVE_BEFORE_REGISTRATION", level: "block", data: { registeredOn: ctx.registeredOn } });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/// Withdrawing a cancellation recorded in error: a cancellation, not already withdrawn, with a reason and an officer.
export function withdrawCancellationFaults(
  i: { reason: string; personActive: boolean },
  ctx: { today: string | null; event: { kind: string; withdrawn: boolean } | null },
): Finding<CancellationFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<CancellationFault>[] = [];
  if (!ctx.event || ctx.event.kind !== "REGISTRATION_CANCELLED") out.push({ code: "NOT_A_CANCELLATION", level: "block" });
  else if (ctx.event.withdrawn) out.push({ code: "CANCELLATION_ALREADY_WITHDRAWN", level: "block" });
  if (!i.reason.trim()) out.push({ code: "CANCELLATION_WITHDRAW_REASON_REQUIRED", level: "block" });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}
