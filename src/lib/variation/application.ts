/**
 * A variation from origination to its approval (6.13 Part A step 4: FR-VAR-001–006, 008, 009, 013, 014, 024).
 *
 * - Origination (FR-VAR-001, 002): by the implementing department, reviewed by an S.O.'s Representative before it is
 *   submitted, or by an S.O.'s Representative directly. Where the representative on the application is a Specialist,
 *   the availability of the allocation is confirmed and the application passes through a Principal Representative.
 * - The application (FR-VAR-003): the description, the reason, the estimate and the period-implication answer are
 *   required; the reference, the percentage, the cumulative and the new sum are worked out, never typed. The
 *   agreed-rate test (FR-VAR-006) and the funder-consent answer (FR-VAR-009) are answered before it is submitted.
 * - The exemption test (FR-VAR-004): a reduction of the contract sum (an omission, below nothing), the adjustment of
 *   prime cost or provisional sums, and a re-measurement of provisional quantities skip the S.O.'s decision on the
 *   application, the committee and the approval tiers, and go straight to the S.O.'s instruction, the category
 *   recorded; every other variation is an addition (above nothing).
 * - The S.O.'s decision (FR-VAR-005): supported, with a cap no higher than the estimate where given, or not supported
 *   (with the reason), which goes where the configured destination says, else where the officer chooses.
 * - The cumulative (FR-VAR-024): the sum of every other variation's approved value (its prior approval, at the S.O.'s
 *   cap where one was set, plus every approved increase), never keyed; an exempt variation is not approved (it moves
 *   the contract sum through an adjustment certificate). It moves only when a value route is approved.
 * - The new sum (VO-660 §3.5–3.6, §8.7): the contract sum + the cumulative approved + this variation.
 * Pure: sen as bigint, days as strings, no clock.
 */

import { rejectionOutcome, type RejectionOutcome, type RouteSnapshot, type RouteStep } from "@/lib/authority/rejection";
import type { Sen } from "@/lib/money";

import type { DelegateKind } from "@/lib/supervision/types";

import type { Day, Finding, ScheduleForm, SoDecision, VariationEvent, VariationExemption, VariationOrigin, VariationStatus } from "./types";

export interface RouteFact {
  id: string;
  event: VariationEvent;
  status: string;
  value: Sen;
  /// The refusal's destination as applied, and the choices offered where none applied (CO-5).
  applied: string | null;
  choices: readonly string[];
  openedOn: Day;
  /// The instant it was sent (ISO), a successor stamped with its own act's instant: the tie-break within a day.
  sentAt: string;
}

export interface VariationFacts {
  id: string;
  status: VariationStatus;
  exemption: VariationExemption | null;
  estimate: Sen;
  soDecision: SoDecision | null;
  soDecisionCap: Sen | null;
  routes: readonly RouteFact[];
  /// The instructions raised, with their certificate's status.
  instructions: readonly { id: string; certificateStatus: string }[];
  /// The Variation Order Certificates raised, with their certificate's status and net (an omission below nothing).
  orders: readonly { id: string; certificateStatus: string; net: Sen }[];
  commencedOn: Day | null;
}

const live = (s: string) => s !== "VOID";
/// Residual C2: the latest by the day it opened, then the instant it was sent, then its id: a total order of its own,
/// never resting on the order the rows were loaded in.
const latest = <T extends { openedOn: Day; sentAt: string; id: string }>(xs: readonly T[]): T | null =>
  [...xs].sort((a, b) => a.openedOn.localeCompare(b.openedOn) || a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id)).at(-1) ?? null;

/// The routes of one event, oldest first, and the latest.
export const routesOf = (v: Pick<VariationFacts, "routes">, e: VariationEvent) => v.routes.filter((r) => r.event === e);
export const latestRoute = (v: Pick<VariationFacts, "routes">, e: VariationEvent): RouteFact | null => latest(routesOf(v, e));

/// Whether its prior approval is obtained (an approved PRIOR route).
export const priorApproved = (v: Pick<VariationFacts, "routes">): boolean => routesOf(v, "PRIOR").some((r) => r.status === "APPROVED");

/// The value its prior approval and approved increases cover (none for an exempt variation or before approval).
export function approvedValue(v: Pick<VariationFacts, "routes" | "exemption" | "status">): Sen {
  if (v.exemption != null || v.status === "CLOSED") return 0n;
  const prior = routesOf(v, "PRIOR").find((r) => r.status === "APPROVED");
  if (!prior) return 0n;
  return routesOf(v, "INCREASE").filter((r) => r.status === "APPROVED").reduce((a, r) => a + r.value, prior.value);
}

/// FR-VAR-024: every other variation's approved value.
export const cumulativeApproved = (all: readonly VariationFacts[], exceptId: string | null): Sen => all.filter((v) => v.id !== exceptId).reduce((a, v) => a + approvedValue(v), 0n);

/// The value its prior approval is sought at: the S.O.'s cap where one was set, else the estimate.
export const priorValueOf = (v: Pick<VariationFacts, "estimate" | "soDecisionCap">): Sen => v.soDecisionCap ?? v.estimate;

/// A route of the variation waiting for a decision (one at a time per variation).
export const pendingRoute = (v: Pick<VariationFacts, "routes">): RouteFact | null => v.routes.find((r) => r.status === "PENDING") ?? null;

/// A refused route waiting for the officer to say where it goes (CO-5).
export const awaitingChoice = (v: Pick<VariationFacts, "routes">): RouteFact | null => v.routes.find((r) => r.status === "REJECTED" && r.applied == null && r.choices.length > 0) ?? null;

export const liveInstruction = (v: Pick<VariationFacts, "instructions">) => v.instructions.find((i) => live(i.certificateStatus)) ?? null;
export const issuedInstruction = (v: Pick<VariationFacts, "instructions">) => v.instructions.find((i) => i.certificateStatus === "ISSUED") ?? null;
export const liveOrder = (v: Pick<VariationFacts, "orders">) => v.orders.find((o) => live(o.certificateStatus)) ?? null;
export const issuedOrder = (v: Pick<VariationFacts, "orders">) => v.orders.find((o) => o.certificateStatus === "ISSUED") ?? null;

/**
 * Run 3 review MUST 1: a variation that stands approved (its prior approval approved, or exempt with a live
 * instruction) is not ended by a refused increase, agreed-rate or re-measurement route: that refusal ends the route
 * only (back to whoever sent it, or to an earlier step). Ending the variation then would take its approved value out
 * of the cumulative, move every later variation's band and strand its order. Its prior approval's refusal may end it.
 */
export const standsApproved = (v: Pick<VariationFacts, "routes" | "exemption" | "instructions">): boolean => priorApproved(v) || (v.exemption != null && liveInstruction(v) != null);

export type RefusalKind = "RETURN_TO_ORIGINATOR" | "RETURN_TO_STEP" | "TERMINATE";
export function refusalKinds(v: Pick<VariationFacts, "routes" | "exemption" | "instructions">, event: VariationEvent): RefusalKind[] {
  return event !== "PRIOR" && standsApproved(v) ? ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP"] : ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"];
}

/**
 * Where a refused route of a variation goes (FR-APR-016 as 6.9 decides it), with what the variation supports
 * (`refusalKinds`). The committee's outcome is passed through as it was decided, never rewritten (run 3 residual S1):
 * where it is terminal and the variation stands approved, TERMINATE is not supported there, so nothing is applied on
 * the committee's say and the officer chooses among the returns (CO-5), the choice recorded as theirs. Pure.
 */
export function variationRefusalOutcome(i: {
  v: Pick<VariationFacts, "routes" | "exemption" | "instructions">;
  event: VariationEvent;
  snapshot: RouteSnapshot;
  committee: { kind: "LOOP" | "TERMINAL" } | null;
  steps: readonly RouteStep[];
  rejectingSeq: number;
}): RejectionOutcome {
  return rejectionOutcome({ snapshot: i.snapshot, committee: i.committee, steps: i.steps, rejectingSeq: i.rejectingSeq, supports: refusalKinds(i.v, i.event) });
}

export type Stage = "DRAFT" | "WITH_SO" | "TO_SEND" | "AWAITING_APPROVAL" | "REFUSED_AWAITING_CHOICE" | "APPROVED" | "EXEMPT" | "INSTRUCTED" | "CERTIFIED" | "CLOSED";

/// Where it stands, read from its records (never stored twice).
export function stageOf(v: VariationFacts): Stage {
  if (v.status === "CLOSED") return "CLOSED";
  if (v.status === "DRAFT") return "DRAFT";
  if (v.status === "SUBMITTED") return "WITH_SO";
  if (issuedOrder(v)) return "CERTIFIED";
  if (issuedInstruction(v)) return "INSTRUCTED";
  if (v.exemption != null) return "EXEMPT";
  if (priorApproved(v)) return "APPROVED";
  if (pendingRoute(v)) return "AWAITING_APPROVAL";
  if (awaitingChoice(v)) return "REFUSED_AWAITING_CHOICE";
  return "TO_SEND";
}

/// FR-VAR-014: commenced pending approval and not yet approved (nor closed): its exposure is the estimate.
export const commencedPending = (v: VariationFacts): boolean => v.commencedOn != null && v.status === "SUPPORTED" && v.exemption == null && !priorApproved(v);

// ------------------------------------------------------------------ the record and its submission

export interface ApplicationFields {
  description: string;
  reason: string;
  estimate: Sen | null;
  exemption: VariationExemption | null;
  periodImplication: boolean | null;
  agreedRateExists: boolean | null;
  funderConsentRequired: boolean | null;
}

/// FR-VAR-003, 004, 006, 009: what the application must say before it is submitted.
export function fieldFaults(f: ApplicationFields): Finding[] {
  const out: Finding[] = [];
  const need = (field: string) => out.push({ code: "FIELD_REQUIRED", level: "block", data: { field } });
  if (!f.description.trim()) need("description");
  if (!f.reason.trim()) need("reason");
  if (f.estimate == null) need("estimate");
  if (f.periodImplication == null) need("periodImplication");
  if (f.agreedRateExists == null) need("agreedRateExists");
  if (f.funderConsentRequired == null) need("funderConsentRequired");
  if (f.estimate != null) {
    if (f.estimate === 0n) out.push({ code: "ESTIMATE_ZERO", level: "block" });
    else if (f.exemption === "REDUCTION" && f.estimate > 0n) out.push({ code: "REDUCTION_NOT_OMISSION", level: "block" });
    else if (f.exemption !== "REDUCTION" && f.estimate < 0n) out.push({ code: "OMISSION_IS_REDUCTION", level: "block" });
  }
  return out;
}

/// The capacity of the representative on the application (FR-VAR-001, 002): the S.O. themself, or a delegate of a kind.
export type RepCapacity = { as: "SO" } | { as: "DELEGATE"; kind: DelegateKind };

export interface OriginFacts {
  origin: VariationOrigin;
  /// The originator's capacity on the S.O.'s Representative path (null: not a representative whose scope covers it).
  originatorCapacity: RepCapacity | null;
  /// The department path's reviewer's capacity (null: not recorded, or not a representative whose scope covers it).
  reviewerCapacity: RepCapacity | null;
  reviewRecorded: boolean;
  allocationConfirmed: boolean | null;
  principalRecorded: boolean;
}

/// FR-VAR-001, 002: the origination path is complete.
export function originFaults(o: OriginFacts): Finding[] {
  const out: Finding[] = [];
  let rep: RepCapacity | null;
  if (o.origin === "DEPARTMENT") {
    if (!o.reviewRecorded) return [{ code: "REVIEW_NOT_RECORDED", level: "block" }];
    rep = o.reviewerCapacity;
    if (!rep) return [{ code: "REVIEWER_NOT_REPRESENTATIVE", level: "block" }];
  } else {
    rep = o.originatorCapacity;
    if (!rep) return [{ code: "ORIGINATOR_NOT_REPRESENTATIVE", level: "block" }];
  }
  if (rep.as === "DELEGATE" && rep.kind !== "PRINCIPAL") {
    if (o.allocationConfirmed !== true) out.push({ code: "ALLOCATION_NOT_CONFIRMED", level: "block" });
    if (!o.principalRecorded) out.push({ code: "PRINCIPAL_NOT_RECORDED", level: "block" });
  }
  return out;
}

/// Submitting: from a draft only, its fields and origination complete. An exempt variation goes straight on to its
/// instruction; any other waits for the S.O.'s decision.
export function submitFaults(i: { status: VariationStatus; fields: ApplicationFields; origin: OriginFacts }): Finding[] {
  if (i.status !== "DRAFT") return [{ code: "NOT_DRAFT", level: "block", data: { status: i.status } }];
  return [...fieldFaults(i.fields), ...originFaults(i.origin)];
}

/// FR-VAR-005: the S.O.'s decision on a submitted application.
export function soDecisionFaults(i: { status: VariationStatus; exemption: VariationExemption | null; decision: SoDecision | null; cap: Sen | null; estimate: Sen; note: string; decidedOn: Day; submittedOn: Day | null; today: Day }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.status !== "SUBMITTED" || i.exemption != null) return [{ code: "NOT_WITH_SO", level: "block", data: { status: i.status } }];
  if (!i.decision) f("DECISION_REQUIRED");
  if (i.decision === "NOT_SUPPORTED" && !i.note.trim()) f("NOT_SUPPORTED_REASON");
  if (i.cap != null) {
    if (i.decision !== "SUPPORTED") f("CAP_ONLY_ON_SUPPORT");
    else if (i.cap <= 0n || i.cap > i.estimate) f("CAP_OUT_OF_RANGE", { estimate: i.estimate.toString(), cap: i.cap.toString() });
  }
  if (i.decidedOn > i.today) f("FUTURE_DATE", { day: i.decidedOn });
  if (i.submittedOn && i.decidedOn < i.submittedOn) f("BEFORE_SUBMITTED", { day: i.submittedOn });
  return out;
}

// ------------------------------------------------------------------ sending for approval

export interface SendInput {
  v: VariationFacts;
  event: VariationEvent;
  /// The value the route is for (worked out by the caller for an increase or a re-measurement; keyed for agreed rates).
  value: Sen | null;
  /// The cumulative basis is in force and another variation of the contract has a value route waiting (OD-A2: a
  /// cumulative reading is read only with every earlier value approval decided).
  cumulativeBlockedBy: string | null;
  /// The revised base is in force and an adjustment of the contract sum is in progress (it would move the base).
  adjustmentInProgress: string | null;
  /// The raised (draft or being signed) Variation Order Certificate's net, for an increase or a re-measurement.
  orderNet: Sen | null;
}

/// Why the variation cannot be sent for this approval now (the route's own rule is judged after).
export function sendFaults(i: SendInput): Finding[] {
  const v = i.v;
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (v.status !== "SUPPORTED") return [{ code: "NOT_SUPPORTED_YET", level: "block", data: { status: v.status } }];
  const pending = pendingRoute(v);
  if (pending) return [{ code: "ROUTE_PENDING", level: "block", data: { event: pending.event } }];
  const choice = awaitingChoice(v);
  if (choice) return [{ code: "AWAITING_CHOICE", level: "block", data: { event: choice.event } }];
  if (issuedOrder(v)) return [{ code: "ALREADY_CERTIFIED", level: "block" }];
  switch (i.event) {
    case "PRIOR":
      if (v.exemption != null) f("EXEMPT_NO_PRIOR", { exemption: v.exemption });
      else if (v.soDecision !== "SUPPORTED") f("NOT_SUPPORTED_YET", { status: v.status });
      else if (priorApproved(v)) f("PRIOR_ALREADY_APPROVED");
      break;
    case "INCREASE": {
      if (v.exemption != null) f("EXEMPT_NO_PRIOR", { exemption: v.exemption });
      else if (!priorApproved(v)) f("PRIOR_NOT_APPROVED");
      else if (i.orderNet == null) f("ORDER_NOT_RAISED");
      else if (i.orderNet <= approvedValue(v)) f("NO_INCREASE", { approved: approvedValue(v).toString(), net: i.orderNet.toString() });
      break;
    }
    case "AGREED_RATE":
      if (v.exemption == null && !priorApproved(v)) f("PRIOR_NOT_APPROVED");
      if (i.value == null || i.value <= 0n) f("VALUE_REQUIRED");
      break;
    case "REMEASUREMENT":
      if (v.exemption !== "REMEASUREMENT") f("NOT_REMEASUREMENT");
      else if (i.orderNet == null) f("ORDER_NOT_RAISED");
      else if (i.orderNet === 0n) f("NOTHING_TO_ROUTE");
      else if (routesOf(v, "REMEASUREMENT").some((r) => r.status === "APPROVED" && r.value === (i.orderNet! < 0n ? -i.orderNet! : i.orderNet!))) f("REMEASUREMENT_ALREADY_APPROVED");
      break;
  }
  if (out.length === 0 && (i.event === "PRIOR" || i.event === "INCREASE") && i.cumulativeBlockedBy) f("CUMULATIVE_ROUTE_PENDING", { other: i.cumulativeBlockedBy });
  if (out.length === 0 && i.adjustmentInProgress) f("ADJUSTMENT_IN_PROGRESS", { adjustment: i.adjustmentInProgress });
  return out;
}

/// The value a route is sent at: the prior approval at the cap or the estimate, an increase above what is approved,
/// a re-measurement at the order's net (either way), agreed rates as keyed.
export function routeValue(v: VariationFacts, event: VariationEvent, keyed: Sen | null, orderNet: Sen | null): Sen | null {
  switch (event) {
    case "PRIOR":
      return priorValueOf(v);
    case "INCREASE":
      return orderNet == null ? null : orderNet - approvedValue(v);
    case "AGREED_RATE":
      return keyed;
    case "REMEASUREMENT":
      return orderNet == null ? null : orderNet < 0n ? -orderNet : orderNet;
  }
}

// ------------------------------------------------------------------ commencement, closing, the schedule form

/// FR-VAR-014: work commenced pending approval, on the support of the S.O. or a representative.
export function commenceFaults(i: { v: VariationFacts; on: Day; today: Day; soDecidedOn: Day | null; supporterCapable: boolean }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.v.status !== "SUPPORTED" || i.v.exemption != null || i.v.soDecision !== "SUPPORTED") return [{ code: "NOT_SUPPORTED_YET", level: "block", data: { status: i.v.status } }];
  if (priorApproved(i.v)) f("PRIOR_ALREADY_APPROVED");
  if (i.v.commencedOn) f("ALREADY_COMMENCED", { day: i.v.commencedOn });
  if (!i.supporterCapable) f("SUPPORT_NOT_SO");
  if (i.on > i.today) f("FUTURE_DATE", { day: i.on });
  if (i.soDecidedOn && i.on < i.soDecidedOn) f("BEFORE_SUPPORTED", { day: i.soDecidedOn });
  return out;
}

/// Closing a variation (withdrawn, or ended where not supported): never once approved (an approved variation is
/// undone only by another, an omission), never with a route waiting or an instruction raised.
export function closeFaults(i: { v: VariationFacts; reason: string }): Finding[] {
  const v = i.v;
  if (v.status === "CLOSED") return [{ code: "ALREADY_CLOSED", level: "block" }];
  const out: Finding[] = [];
  const f = (code: string) => out.push({ code, level: "block" });
  if (pendingRoute(v)) f("CLOSE_ROUTE_PENDING");
  if (priorApproved(v)) f("CLOSE_APPROVED");
  if (liveInstruction(v)) f("CLOSE_INSTRUCTED");
  if (!i.reason.trim()) f("CLOSE_REASON_REQUIRED");
  return out;
}

/// OD-A5 (FR-VAR-007): the schedule form, by the configured rule (an agreed rate exists, or none does). Unset: null.
export function scheduleFormOf(agreedRateExists: boolean | null, rule: { withAgreedRate: ScheduleForm | null; withoutAgreedRate: ScheduleForm | null }): ScheduleForm | null {
  if (agreedRateExists == null) return null;
  return agreedRateExists ? rule.withAgreedRate : rule.withoutAgreedRate;
}

/// The new contract sum the application states (VO-660 §3.5–3.6): the contract sum + the cumulative approved + this.
export const newSumOf = (contractSum: Sen, cumulative: Sen, thisValue: Sen): Sen => contractSum + cumulative + thisValue;

/// The variation's own figures for an event's reading: what it has approved so far (for an increase).
export const approvedSoFarOf = (v: VariationFacts): Sen => approvedValue(v);

/// The routes waiting for a decision on any of the contract's variations, as value approvals (prior, increase).
export const pendingValueRoutes = (all: readonly VariationFacts[], exceptId: string): { variationId: string; event: VariationEvent }[] =>
  all.filter((v) => v.id !== exceptId).flatMap((v) => v.routes.filter((r) => r.status === "PENDING" && (r.event === "PRIOR" || r.event === "INCREASE")).map((r) => ({ variationId: v.id, event: r.event })));
