/**
 * A supplier's sign-up for a briefing or a site visit, and its withdrawal (FR-VND-013, Phase 4d). Pure.
 *
 * A sign-up says who the supplier will send. It is NOT attendance: the officer's register of a held event (`SiteEventAttendance`) is what `attendanceFaults` reads to gate a purchase,
 * and nothing here reaches it. A sign-up is refused for an event that is cancelled, held or begun, on a window that is not published, closed or cancelled, when the window cannot be dated
 * (an unset time zone is not UTC), and, on the invited path, for anyone but an invitee whose letter was issued.
 */

import type { WindowPhase } from "@/lib/window/phase";
import type { WindowPath } from "@/lib/window/types";

import type { BidFinding } from "./types";

export const REPRESENTATIVE_MAX = 240;

export interface SignUpEvent {
  startsAt: Date | null;
  cancelled: boolean;
  /// YYYY-MM-DD the officer recorded it held on, or null.
  heldOn: string | null;
}

/// What the window's phase says about acting on it now. UNKNOWN is a window that cannot be dated.
export function windowFault(phase: WindowPhase): BidFinding | null {
  switch (phase) {
    case "NOT_PUBLISHED":
      return { code: "NOT_PUBLISHED", level: "block" };
    case "CANCELLED":
      return { code: "EXERCISE_CANCELLED", level: "block" };
    case "CLOSED":
      return { code: "WINDOW_CLOSED", level: "block" };
    case "UNKNOWN":
      return { code: "WINDOW_NOT_DATED", level: "block" };
    case "PUBLISHED":
    case "OPEN_FOR_PURCHASE":
    case "CLOSED_FOR_PURCHASE":
      return null;
    default: {
      const never: never = phase;
      return never;
    }
  }
}

function eventFault(e: SignUpEvent, now: Date): BidFinding | null {
  if (e.cancelled) return { code: "EVENT_CANCELLED", level: "block" };
  if (e.heldOn) return { code: "EVENT_HELD", level: "block" };
  if (!e.startsAt) return { code: "EVENT_NOT_DATED", level: "block" };
  if (now.getTime() >= e.startsAt.getTime()) return { code: "EVENT_STARTED", level: "block" };
  return null;
}

export interface SignUpInput {
  event: SignUpEvent;
  phase: WindowPhase;
  path: WindowPath | null;
  /// On the invited path: this supplier is linked to an invitee whose letter was issued.
  invited: boolean;
  representative: string;
  /// The supplier's sign-up for this event as it stands: null if none; `endedAt` set if withdrawn.
  existing: { endedAt: Date | null } | null;
  now: Date;
}

export function signUpFaults(i: SignUpInput): BidFinding[] {
  const out: BidFinding[] = [];
  const w = windowFault(i.phase);
  if (w) out.push(w);
  if (!w) {
    if (i.path === "INVITED" && !i.invited) out.push({ code: "NOT_INVITED", level: "block" });
    const e = eventFault(i.event, i.now);
    if (e) out.push(e);
  }
  const rep = i.representative.trim();
  if (!rep) out.push({ code: "REPRESENTATIVE_REQUIRED", level: "block" });
  else if (rep.length > REPRESENTATIVE_MAX) out.push({ code: "REPRESENTATIVE_TOO_LONG", level: "block" });
  if (i.existing && i.existing.endedAt == null) out.push({ code: "ALREADY_SIGNED_UP", level: "block" });
  return out;
}

export interface WithdrawInput {
  event: SignUpEvent;
  phase: WindowPhase;
  existing: { endedAt: Date | null } | null;
  now: Date;
}

/// Withdrawing: only a sign-up that stands, and only before the event begins or is held. A cancelled event leaves the sign-up as it was (the event's own state says what happened).
export function withdrawFaults(i: WithdrawInput): BidFinding[] {
  if (!i.existing || i.existing.endedAt != null) return [{ code: "NOT_SIGNED_UP", level: "block" }];
  const out: BidFinding[] = [];
  if (i.phase === "CANCELLED") out.push({ code: "EXERCISE_CANCELLED", level: "block" });
  const e = eventFault(i.event, i.now);
  if (e) out.push(e);
  return out;
}

/// Where a supplier's sign-up stands for display, derived from the event and the sign-up: the one definition the page and the officer's register share.
export type SignUpState = "NONE" | "SIGNED_UP" | "WITHDRAWN" | "EVENT_CANCELLED" | "EVENT_OVER";
export function signUpState(e: SignUpEvent, existing: { endedAt: Date | null } | null, now: Date): SignUpState {
  if (e.cancelled) return existing && existing.endedAt == null ? "EVENT_CANCELLED" : "NONE";
  if (existing && existing.endedAt != null) return "WITHDRAWN";
  if (existing) return e.heldOn || (e.startsAt && now.getTime() >= e.startsAt.getTime()) ? "EVENT_OVER" : "SIGNED_UP";
  return "NONE";
}
