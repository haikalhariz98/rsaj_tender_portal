/**
 * A blacklisting's period (FR-TRM-017, condition (4)): a first offence lasts the configured months
 * (`SupplierPolicy.blacklistFirstOffenceMonths`), a later one until further notice. The period elapses as
 * the document store's retention does (BD-DS-10): effective on D for N months, the supplier is free from
 * D + N months, month-end clamped, so the last blacklisted day is the day before. Like every period in
 * the project (budget/periods.ts, effective.ts), the stored end is exclusive: `endsOn` IS the free-from
 * day (S-1). Effective 2026-10-01 for 60 months: endsOn 2031-10-01 (free from that day), last blacklisted
 * day 2031-09-30. Months not set: a first offence cannot be recorded, and the setting is named. Pure.
 */

import { addDays, addMonths } from "@/lib/securities/period";

import type { Finding } from "./types";

export type BlacklistPeriod =
  /// `endsOn` is exclusive (the free-from day, stored on the event); `lastDay` is the day before, for the words.
  | { kind: "ENDS"; endsOn: string; lastDay: string; months: number }
  | { kind: "UNTIL_FURTHER_NOTICE" };

export type PeriodFault = "BLACKLIST_PERIOD_NOT_SET" | "OFFENCE_INVALID";

export function blacklistPeriod(effectiveOn: string, offenceNo: number, months: number | null): { period: BlacklistPeriod | null; faults: Finding<PeriodFault>[] } {
  if (!Number.isInteger(offenceNo) || offenceNo < 1) return { period: null, faults: [{ code: "OFFENCE_INVALID", level: "block" }] };
  if (offenceNo > 1) return { period: { kind: "UNTIL_FURTHER_NOTICE" }, faults: [] };
  if (months == null || !Number.isInteger(months) || months < 1) return { period: null, faults: [{ code: "BLACKLIST_PERIOD_NOT_SET", level: "block" }] };
  const endsOn = addMonths(effectiveOn, months);
  return { period: { kind: "ENDS", endsOn, lastDay: addDays(endsOn, -1), months }, faults: [] };
}

/// Which offence the next blacklisting is: one more than the blacklistings already recorded, lifted or not.
export const nextOffenceNo = (events: readonly { kind: string }[]) => events.filter((e) => e.kind === "BLACKLIST").length + 1;

// ------------------------------------------------------------------ asking for it, and recording it (OD-8 A)

/**
 * A blacklisting, and its lifting, are asked for and decided on a route on `supplier_blacklist` (OD-8 A:
 * the matrix's rows ship empty, and no rule refuses, naming the Approval matrix). Once the route has
 * approved it, an officer records the event with the day it takes effect; the period is computed then,
 * from the policy as it stands, and frozen on the event.
 */

export type RouteState = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

/// Where a request's routing stands: its newest route's status, or NONE.
export function routeState(routes: readonly { status: string; openedAt: string }[]): RouteState {
  const r = [...routes].sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
  if (!r) return "NONE";
  return r.status === "PENDING" ? "PENDING" : r.status === "APPROVED" ? "APPROVED" : "REJECTED";
}

export type BlacklistFault =
  | "TIME_ZONE_UNSET"
  | "STANDING_NEEDS_REGISTRATION"
  | "ALREADY_BLACKLISTED"
  | "NOT_BLACKLISTED"
  | "REQUEST_OPEN"
  | "REASON_REQUIRED"
  | "REASON_NOT_FOR_BLACKLISTING"
  | "REASON_RETIRED"
  | "STANDING_NOTE_REQUIRED"
  | "PERSON_REQUIRED"
  | "AWARD_NOT_CANCELLED_FOR_BLACKLISTING"
  | "AWARD_NOT_THIS_SUPPLIER"
  | "ROUTE_NOT_APPROVED"
  | "ALREADY_RECORDED"
  | "EFFECTIVE_REQUIRED"
  | "EFFECTIVE_IN_FUTURE"
  | "EFFECTIVE_BEFORE_DECISION"
  | PeriodFault;

export interface RequestFacts {
  kind: "BLACKLIST" | "BLACKLIST_LIFT";
  route: RouteState;
  /// The day its route was approved, where it was.
  approvedOn: string | null;
  recorded: boolean;
}

/// Whether a supplier has a request still to be decided or recorded: one at a time.
export const requestOpen = (rs: readonly RequestFacts[]) => rs.some((r) => !r.recorded && r.route !== "REJECTED");

/// Asking for a blacklisting (FR-TRM-017; from a cancelled award, FR-AWD-009).
export function requestBlacklistFaults(
  i: { reasonId: string | null; personActive: boolean; sourceAward: { cancelledForBlacklisting: boolean; vendorId: string | null } | null },
  ctx: { today: string | null; supplierId: string; status: string; standing: string; reason: { appliesTo: "SUSPEND" | "BLACKLIST"; retiredOn: string | null } | null; requests: readonly RequestFacts[] },
): Finding<BlacklistFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<BlacklistFault>[] = [];
  if (ctx.status !== "REGISTERED") out.push({ code: "STANDING_NEEDS_REGISTRATION", level: "block" });
  else if (ctx.standing === "BLACKLISTED") out.push({ code: "ALREADY_BLACKLISTED", level: "block" });
  if (requestOpen(ctx.requests)) out.push({ code: "REQUEST_OPEN", level: "block" });
  if (!i.reasonId) out.push({ code: "REASON_REQUIRED", level: "block" });
  else if (!ctx.reason || ctx.reason.appliesTo !== "BLACKLIST") out.push({ code: "REASON_NOT_FOR_BLACKLISTING", level: "block" });
  else if (ctx.reason.retiredOn && ctx.reason.retiredOn <= ctx.today) out.push({ code: "REASON_RETIRED", level: "block" });
  if (i.sourceAward) {
    if (!i.sourceAward.cancelledForBlacklisting) out.push({ code: "AWARD_NOT_CANCELLED_FOR_BLACKLISTING", level: "block" });
    if (i.sourceAward.vendorId !== ctx.supplierId) out.push({ code: "AWARD_NOT_THIS_SUPPLIER", level: "block" });
  }
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/// Asking for a blacklisting in effect to be lifted: it must be in effect, and the officer says why.
export function requestLiftFaults(i: { note: string; personActive: boolean }, ctx: { today: string | null; standing: string; requests: readonly RequestFacts[] }): Finding<BlacklistFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<BlacklistFault>[] = [];
  if (ctx.standing !== "BLACKLISTED") out.push({ code: "NOT_BLACKLISTED", level: "block" });
  if (requestOpen(ctx.requests)) out.push({ code: "REQUEST_OPEN", level: "block" });
  if (!i.note.trim()) out.push({ code: "STANDING_NOTE_REQUIRED", level: "block" });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/**
 * Recording what an approved request asked for, effective on a day no earlier than its approval and not
 * after today. A blacklisting computes its period from the policy's months now (first offence), or none
 * (a later one); a lift needs the blacklisting still in effect.
 */
export function recordFaults(
  i: { effectiveOn: string | null; personActive: boolean },
  ctx: { today: string | null; request: RequestFacts; standing: string; offenceNo: number; months: number | null },
): { faults: Finding<BlacklistFault>[]; period: BlacklistPeriod | null } {
  if (!ctx.today) return { faults: [{ code: "TIME_ZONE_UNSET", level: "block" }], period: null };
  const out: Finding<BlacklistFault>[] = [];
  const r = ctx.request;
  if (r.recorded) out.push({ code: "ALREADY_RECORDED", level: "block" });
  else if (r.route !== "APPROVED") out.push({ code: "ROUTE_NOT_APPROVED", level: "block" });
  if (r.kind === "BLACKLIST" && ctx.standing === "BLACKLISTED") out.push({ code: "ALREADY_BLACKLISTED", level: "block" });
  if (r.kind === "BLACKLIST_LIFT" && ctx.standing !== "BLACKLISTED") out.push({ code: "NOT_BLACKLISTED", level: "block" });
  if (!i.effectiveOn) out.push({ code: "EFFECTIVE_REQUIRED", level: "block" });
  else if (i.effectiveOn > ctx.today) out.push({ code: "EFFECTIVE_IN_FUTURE", level: "block" });
  else if (r.approvedOn && i.effectiveOn < r.approvedOn) out.push({ code: "EFFECTIVE_BEFORE_DECISION", level: "block", data: { approvedOn: r.approvedOn } });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  let period: BlacklistPeriod | null = null;
  if (r.kind === "BLACKLIST" && i.effectiveOn) {
    const p = blacklistPeriod(i.effectiveOn, ctx.offenceNo, ctx.months);
    out.push(...p.faults);
    period = p.period;
  }
  return { faults: out, period };
}
