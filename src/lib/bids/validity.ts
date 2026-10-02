/**
 * Bid validity (FR-BID-009, 010; OD-10). A bid stays valid for the days the tender documents
 * state, counted from the closing day: it expires at the end of closing day + N (reading ASSUMED,
 * shown, a question to the customer). Closing 2026-11-17 with 120 days expires 2027-03-17: valid on
 * the 17th, expired on the 18th. The latest applied extension governs. The days have no default:
 * null is NOT_SET, warned on the window and blocking the award. Alerts come from the organisation's
 * `bid.validity.expiring` notification rule's offsets: shown, never sent (no delivery yet).
 *
 * Only exercises published through 6.5 are judged (6.6 conditions, X-9): one published before
 * the window existed has no validity on record, and nothing here is asked of it. Pure.
 */

import { dayPlus, daysFrom } from "@/lib/dates";

import type { Finding } from "./types";

/// The event key of the organisation's alert rule (NotificationRule.eventKey): a configuration key, never rendered.
export const VALIDITY_ALERT_EVENT = "bid.validity.expiring";

/// The reading the screen shows beside the expiry, with where it came from.
export const EXPIRY_READING = {
  text: "Counted from the closing day: a bid with N days' validity is valid to the end of the closing day plus N days.",
  provenance: "ASSUMED" as const,
};

/// The last day a bid is valid: the closing day plus the validity days.
export const validityExpiry = (closingDay: string, days: number) => dayPlus(closingDay, days);

export type ValidityStateCode = "NOT_SET" | "NO_CLOSING" | "TIME_ZONE_UNSET" | "VALID" | "EXPIRED";

export interface ValidityState {
  state: ValidityStateCode;
  /// The expiry the days give, before any extension.
  baseExpiry: string | null;
  /// The expiry that governs: the latest applied extension's, or the base.
  expiry: string | null;
  /// Days from today to the expiry (0 on the expiry day, negative after).
  daysLeft: number | null;
  /// The alert offset now reached (the smallest configured offset at or above the days left), or null.
  alertOffset: number | null;
  extended: boolean;
}

export function validityState(i: {
  closingDay: string | null;
  days: number | null;
  /// Applied extensions only, any order.
  extensions: readonly { toExpiry: string; appliedAt: Date }[];
  today: string | null;
  /// The rule's reminder offsets, in days before expiry. Empty: no alert configured.
  offsets: readonly number[];
}): ValidityState {
  const none = { baseExpiry: null, expiry: null, daysLeft: null, alertOffset: null, extended: false };
  if (i.days == null) return { state: "NOT_SET", ...none };
  if (!i.closingDay) return { state: "NO_CLOSING", ...none };
  const baseExpiry = validityExpiry(i.closingDay, i.days);
  const latest = [...i.extensions].sort((a, b) => a.appliedAt.getTime() - b.appliedAt.getTime()).at(-1);
  const expiry = latest ? latest.toExpiry : baseExpiry;
  if (!i.today) return { state: "TIME_ZONE_UNSET", baseExpiry, expiry, daysLeft: null, alertOffset: null, extended: !!latest };
  const daysLeft = daysFrom(i.today, expiry);
  const reached = i.offsets.filter((o) => o >= daysLeft && daysLeft >= 0);
  return {
    state: i.today <= expiry ? "VALID" : "EXPIRED",
    baseExpiry,
    expiry,
    daysLeft,
    alertOffset: reached.length ? Math.min(...reached) : null,
    extended: !!latest,
  };
}

export type AwardValidityFault = "VALIDITY_NOT_SET" | "BID_VALIDITY_EXPIRED" | "VALIDITY_NOT_JUDGED";

/**
 * 6.11's submission and issue (flagged, new faults only): refused once the bids' validity has
 * expired without a recorded extension, or while the validity is not set. Null where the exercise
 * was not published through 6.5 (nothing is asked of it).
 */
export function awardValidityFault(publishedThroughWindow: boolean, v: ValidityState): Finding<AwardValidityFault> | null {
  if (!publishedThroughWindow) return null;
  switch (v.state) {
    case "VALID":
      return null;
    case "NOT_SET":
      return { code: "VALIDITY_NOT_SET", level: "block" };
    case "EXPIRED":
      return { code: "BID_VALIDITY_EXPIRED", level: "block", data: { expiry: v.expiry } };
    case "NO_CLOSING":
    case "TIME_ZONE_UNSET":
      return { code: "VALIDITY_NOT_JUDGED", level: "block", data: { why: v.state } };
    default: {
      const never: never = v.state;
      return never;
    }
  }
}
