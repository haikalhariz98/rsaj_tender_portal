/**
 * Clarification and negotiation meetings (FR-EVL-015, 016; OQ-08 interim). A clarification meeting is
 * available with any bidder, as many rounds as needed (OD-10 A: never an entitlement; fix R-6);
 * it is closed only with its minutes recorded and the tenderer's written confirmation attached and
 * live, and once closed it is frozen. A negotiation needs an APPROVED route on the engine's
 * `negotiation` domain, for that bidder (the customer's matrix rows: none shipped; with none the request
 * is refused naming the Approval matrix, 6.5 OD-5 precedent); each round records the price before and
 * after, and closes like a clarification. No automated guardrail on the price agreed. Pure.
 */

import { roundCeilingWarning, type CeilingSnapshot } from "./ceiling";
import type { Finding, MeetingKind } from "./types";

export type MeetingFault =
  | "NOT_IN_RUNNING"
  | "NEGOTIATION_NOT_REQUESTED"
  | "NEGOTIATION_NOT_AUTHORISED"
  | "NEGOTIATION_REFUSED"
  | "HELD_IN_FUTURE"
  | "HELD_BEFORE_EVALUATION"
  | "PLACE_REQUIRED"
  | "TIME_ZONE_NOT_SET"
  | "PERSON_REQUIRED"
  | "MEETING_OPEN_ALREADY"
  | "MEETING_CLOSED"
  | "MINUTES_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "PRICES_REQUIRED"
  | "PRICE_RAISED"
  | "PRICE_ABOVE_CEILING_AT_ROUND";

/**
 * Whether a bidder may be met (6.8 fix R-6, OD-10 A): a clarification is available to any bidder in
 * the evaluation, excluded or out of the running included, as often as needed; a negotiation only
 * with a bid in the running. Feeds `openMeetingFaults`' `bidderEligible`.
 */
export const meetingEligible = (kind: MeetingKind, inRunning: boolean) => kind === "CLARIFICATION" || inRunning;

/// Recording that a meeting was held with a bidder. `route`: the latest negotiation request's route for the bidder.
export function openMeetingFaults(i: {
  kind: MeetingKind;
  /// Whether this bidder may be met for this kind of meeting (`meetingEligible`): any bidder for a clarification, a bid in the running for a negotiation.
  bidderEligible: boolean;
  route: { status: string } | null;
  /// Another meeting of this kind with this bidder is not closed.
  openAlready: boolean;
  heldOn: string | null;
  /// The organisation's day the evaluation started (`dayOf(startedAt, timeZone)`); null while no zone is set.
  startedOn: string | null;
  today: string | null;
  place: string;
  personActive: boolean;
}): Finding<MeetingFault>[] {
  const out: Finding<MeetingFault>[] = [];
  const f = (code: MeetingFault) => out.push({ code, level: "block" });
  if (!i.today || i.startedOn == null) f("TIME_ZONE_NOT_SET");
  if (!i.bidderEligible) f("NOT_IN_RUNNING");
  if (i.kind === "NEGOTIATION") {
    if (!i.route) f("NEGOTIATION_NOT_REQUESTED");
    else if (i.route.status === "REJECTED" || i.route.status === "RECALLED") f("NEGOTIATION_REFUSED");
    else if (i.route.status !== "APPROVED") f("NEGOTIATION_NOT_AUTHORISED");
  }
  if (i.openAlready) f("MEETING_OPEN_ALREADY");
  if (i.heldOn && i.today && i.heldOn > i.today) f("HELD_IN_FUTURE");
  if (i.heldOn && i.startedOn != null && i.heldOn < i.startedOn) f("HELD_BEFORE_EVALUATION");
  if (!i.place.trim()) f("PLACE_REQUIRED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

/// Closing a meeting: its minutes and a live confirmation from the tenderer; a negotiation round's two prices.
/// `ceiling` (Q1): the exercise's frozen quotation ceiling; a price after the round above it is warned of, never refused. Absent: not judged.
export function closeMeetingFaults(i: { kind: MeetingKind; closed: boolean; minutes: string; liveConfirmations: number; priceBefore: bigint | null; priceAfter: bigint | null; personActive: boolean; ceiling?: CeilingSnapshot }): Finding<MeetingFault>[] {
  if (i.closed) return [{ code: "MEETING_CLOSED", level: "block" }];
  const out: Finding<MeetingFault>[] = [];
  const f = (code: MeetingFault, level: "block" | "warn" = "block") => out.push({ code, level });
  if (!i.minutes.trim()) f("MINUTES_REQUIRED");
  if (i.liveConfirmations === 0) f("CONFIRMATION_REQUIRED");
  if (i.kind === "NEGOTIATION") {
    if (i.priceBefore == null || i.priceAfter == null) f("PRICES_REQUIRED");
    // No guardrail (OQ-08 interim), but a negotiation that raises the price is said.
    else if (i.priceAfter > i.priceBefore) f("PRICE_RAISED", "warn");
    if (i.priceAfter != null && i.ceiling) {
      const w = roundCeilingWarning(i.priceAfter, i.ceiling);
      if (w) out.push(w);
    }
  }
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

export type NegotiationFault = "NOT_IN_RUNNING" | "REASON_REQUIRED" | "REQUEST_PENDING" | "RULE_NOT_SET" | "NO_METHOD_KEY" | "HAS_COMMITTEE_STEP" | "NO_ISSUE" | "PERSON_REQUIRED" | "TIME_ZONE_NOT_SET";

/// Asking for a negotiation with one bidder on the engine's route (FR-EVL-016).
export function negotiationRequestFaults(i: { bidderInRunning: boolean; reason: string; pending: boolean; routeState: "RESOLVED" | "NO_RULE" | "NO_METHOD_KEY" | "HAS_COMMITTEE_STEP" | "NO_ISSUE"; personActive: boolean; today: string | null }): Finding<NegotiationFault>[] {
  const out: Finding<NegotiationFault>[] = [];
  const f = (code: NegotiationFault) => out.push({ code, level: "block" });
  if (!i.today) f("TIME_ZONE_NOT_SET");
  if (!i.bidderInRunning) f("NOT_IN_RUNNING");
  if (!i.reason.trim()) f("REASON_REQUIRED");
  if (i.pending) f("REQUEST_PENDING");
  if (i.routeState !== "RESOLVED") f(i.routeState === "NO_RULE" ? "RULE_NOT_SET" : i.routeState);
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}
