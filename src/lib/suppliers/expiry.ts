/**
 * How near a supplier's document is to its expiry (FR-VND-008), from the register's configured day
 * thresholds, and which reminders are due from the `supplier.document.expiring` notification rule's
 * offsets. Shown, never sent (INT-09). Pure: the organisation's day is passed in.
 *
 * Bands are inclusive of their own figure, from the soonest: with critical 30, warning 60 and upcoming
 * 90, a document 30 days from expiry is CRITICAL, 31 is WARNING, 60 is WARNING, 61 UPCOMING and 91 is in
 * no band. The expiry day itself is still valid, so it is CRITICAL (0 days left); the day after it is
 * EXPIRED. Any threshold not set: nothing is banded, and the band says so (never "valid").
 */

import { addDays, daysFrom } from "@/lib/securities/period";

import type { Finding } from "./types";

/// The event key of the reminder rule (NotificationRule.eventKey): a configuration key, never rendered.
export const SUPPLIER_EXPIRY_EVENT = "supplier.document.expiring";

export type ExpiryBand = "EXPIRED" | "CRITICAL" | "WARNING" | "UPCOMING" | "NONE" | "NO_EXPIRY" | "BANDS_NOT_SET";

export interface BandPolicy {
  criticalDays: number | null;
  warningDays: number | null;
  upcomingDays: number | null;
}

export interface ExpiryReading {
  band: ExpiryBand;
  /// Days from today to the expiry day (negative once expired). Null with no expiry.
  daysLeft: number | null;
}

/// The band a document stands in on `today`. An expired document is EXPIRED whatever the thresholds.
export function expiryBand(expiresOn: string | null, today: string, policy: BandPolicy): ExpiryReading {
  if (!expiresOn) return { band: "NO_EXPIRY", daysLeft: null };
  const daysLeft = daysFrom(today, expiresOn);
  if (daysLeft < 0) return { band: "EXPIRED", daysLeft };
  const { criticalDays, warningDays, upcomingDays } = policy;
  if (criticalDays == null || warningDays == null || upcomingDays == null) return { band: "BANDS_NOT_SET", daysLeft };
  if (daysLeft <= criticalDays) return { band: "CRITICAL", daysLeft };
  if (daysLeft <= warningDays) return { band: "WARNING", daysLeft };
  if (daysLeft <= upcomingDays) return { band: "UPCOMING", daysLeft };
  return { band: "NONE", daysLeft };
}

/// The order bands are listed in, soonest first: a register sorts by it and shows the worst.
export const BAND_ORDER: readonly ExpiryBand[] = ["EXPIRED", "CRITICAL", "WARNING", "UPCOMING", "BANDS_NOT_SET", "NONE", "NO_EXPIRY"];

/// The worst of several bands (a supplier's, over its documents). Null with none.
export function worstBand(bands: readonly ExpiryBand[]): ExpiryBand | null {
  if (bands.length === 0) return null;
  return [...bands].sort((a, b) => BAND_ORDER.indexOf(a) - BAND_ORDER.indexOf(b))[0];
}

export type BandFault = "BAND_NEGATIVE" | "BANDS_OUT_OF_ORDER" | "BANDS_PARTLY_SET";

/// The thresholds as configured: whole days, at least 0, critical < warning < upcoming. All or none.
export function bandPolicyFaults(p: BandPolicy): Finding<BandFault>[] {
  const out: Finding<BandFault>[] = [];
  const set = [p.criticalDays, p.warningDays, p.upcomingDays].filter((x) => x != null) as number[];
  if (set.some((x) => !Number.isInteger(x) || x < 0)) out.push({ code: "BAND_NEGATIVE", level: "block" });
  if (set.length > 0 && set.length < 3) out.push({ code: "BANDS_PARTLY_SET", level: "block" });
  if (set.length === 3 && !(p.criticalDays! < p.warningDays! && p.warningDays! < p.upcomingDays!)) out.push({ code: "BANDS_OUT_OF_ORDER", level: "block" });
  return out;
}

export interface Reminder {
  /// Days before the expiry the reminder is for.
  offset: number;
  /// The day it falls due.
  dueOn: string;
}

/**
 * The reminders a document can have: one per offset, on its expiry day less the offset, dropping any
 * that would fall before the document began (its validity's start, else its issue, else its lodging):
 * a document valid for 7 days takes only the 7-day reminder of [90, 60, 30, 7]. Largest offset first.
 */
export function remindersFor(doc: { startsOn: string; expiresOn: string | null }, offsets: readonly number[]): Reminder[] {
  if (!doc.expiresOn) return [];
  return [...new Set(offsets)]
    .filter((o) => Number.isInteger(o) && o >= 0)
    .sort((a, b) => b - a)
    .map((offset) => ({ offset, dueOn: addDays(doc.expiresOn!, -offset) }))
    .filter((r) => r.dueOn >= doc.startsOn);
}

/// The reminder due on `today`, if any: the latest one already reached while the document has not expired. Shown, not sent.
export function reminderDue(doc: { startsOn: string; expiresOn: string | null }, offsets: readonly number[], today: string): Reminder | null {
  if (!doc.expiresOn || doc.expiresOn < today) return null;
  const reached = remindersFor(doc, offsets).filter((r) => r.dueOn <= today);
  return reached.at(-1) ?? null;
}

/// Where a document's validity starts, for its reminders: its validity's start, else its issue, else its lodging.
export const startsOn = (d: { validFrom: string | null; issuedOn: string | null; lodgedOn: string }) => d.validFrom ?? d.issuedOn ?? d.lodgedOn;
