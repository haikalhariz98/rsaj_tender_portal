/**
 * Whether a supplier's documents of a type hold across an invitation window (FR-VND-009, SK001
 * 7.3.4 (a)): from the advertisement day to the closing day, inclusive, never at one point in time. A
 * certificate valid today that lapses before the closing fails, though valid today.
 *
 * Only verified documents count (a renewal does not take effect until verified, FR-VND-008), and they
 * count together: a verified renewal that starts the day after its predecessor ends carries the cover
 * on. A document expiring on the closing day itself is the customer's call (OD-4,
 * `expiryOnClosingDayCounts`): true passes, false fails, unset reads NOT_ASSESSED, never a pass. A window
 * not yet published (no advertisement day) or with no closing is not assessed. Pure.
 */

import { addDays } from "@/lib/securities/period";

import { chainOrder } from "./documents";
import type { DocumentFacts } from "./types";

export type Assessment = "PASS" | "FAIL" | "NOT_ASSESSED";

export type WindowReason =
  | "COVERS_WINDOW"
  | "COVERS_TO_CLOSING_DAY"
  | "NOT_PUBLISHED"
  | "CLOSING_NOT_SET"
  | "NOT_HELD"
  | "RECORDED_NOT_APPLICABLE"
  | "UNVERIFIED"
  | "RENEWAL_UNVERIFIED"
  | "STARTS_AFTER_ADVERTISEMENT"
  | "EXPIRED_BEFORE_ADVERTISEMENT"
  | "LAPSES_BEFORE_CLOSING"
  | "LAPSES_ON_CLOSING_DAY"
  | "CLOSING_DAY_RULE_NOT_SET";

export interface WindowReading {
  result: Assessment;
  reason: WindowReason;
  /// Days the words are written with (YYYY-MM-DD).
  data?: Record<string, string>;
}

export interface WindowDays {
  /// The advertisement day (a stored day, set at publication). Null: not published.
  advertisementDay: string | null;
  /// The closing's organisation day. Null: no closing set.
  closingDay: string | null;
}

/// The cover of the verified documents, merged where one starts no later than the day after another ends.
function cover(docs: readonly DocumentFacts[]): { from: string | null; to: string | null }[] {
  const spans = docs
    .map((d) => ({ from: d.validFrom ?? d.issuedOn ?? null, to: d.expiresOn }))
    .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
  const out: { from: string | null; to: string | null }[] = [];
  for (const s of spans) {
    const last = out.at(-1);
    if (last && (last.to == null || s.from == null || s.from <= addDays(last.to, 1))) {
      if (last.to != null && (s.to == null || s.to > last.to)) last.to = s.to;
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

/// One type's documents (its chain) across a window.
export function windowValidity(chain: readonly DocumentFacts[], w: WindowDays, policy: { expiryOnClosingDayCounts: boolean | null }): WindowReading {
  if (!w.advertisementDay) return { result: "NOT_ASSESSED", reason: "NOT_PUBLISHED" };
  if (!w.closingDay) return { result: "NOT_ASSESSED", reason: "CLOSING_NOT_SET" };
  const ordered = chainOrder(chain);
  const verified = ordered.filter((d) => d.verification === "VERIFIED");
  const pending = ordered.some((d) => d.verification === "NOT_CHECKED");
  if (verified.length === 0) return pending ? { result: "NOT_ASSESSED", reason: "UNVERIFIED" } : { result: "FAIL", reason: "NOT_HELD" };
  if (verified[0].notApplicable) return { result: "FAIL", reason: "RECORDED_NOT_APPLICABLE" };
  const spans = cover(verified.filter((d) => !d.notApplicable));
  const ad = w.advertisementDay;
  const closing = w.closingDay;
  const holding = spans.find((s) => (s.from == null || s.from <= ad) && (s.to == null || s.to >= ad));
  if (!holding) {
    const later = spans.find((s) => s.from != null && s.from > ad && s.from <= closing);
    if (later) return { result: "FAIL", reason: "STARTS_AFTER_ADVERTISEMENT", data: { from: later.from!, advertisementDay: ad } };
    return pending ? { result: "NOT_ASSESSED", reason: "RENEWAL_UNVERIFIED" } : { result: "FAIL", reason: "EXPIRED_BEFORE_ADVERTISEMENT", data: { advertisementDay: ad } };
  }
  if (holding.to == null || holding.to > closing) return { result: "PASS", reason: "COVERS_WINDOW" };
  if (holding.to === closing) {
    if (policy.expiryOnClosingDayCounts == null) return { result: "NOT_ASSESSED", reason: "CLOSING_DAY_RULE_NOT_SET", data: { expiresOn: closing } };
    return policy.expiryOnClosingDayCounts ? { result: "PASS", reason: "COVERS_TO_CLOSING_DAY", data: { expiresOn: closing } } : { result: "FAIL", reason: "LAPSES_ON_CLOSING_DAY", data: { expiresOn: closing } };
  }
  // Lapses inside the window. A renewal lodged and not yet verified may yet carry it: not assessed until checked.
  if (pending) return { result: "NOT_ASSESSED", reason: "RENEWAL_UNVERIFIED", data: { expiresOn: holding.to } };
  return { result: "FAIL", reason: "LAPSES_BEFORE_CLOSING", data: { expiresOn: holding.to, closingDay: closing } };
}

/// The best reading across several types that could each evidence the same thing (a body's documents).
export function bestReading(readings: readonly WindowReading[]): WindowReading | null {
  const rank: Record<Assessment, number> = { PASS: 0, NOT_ASSESSED: 1, FAIL: 2 };
  return [...readings].sort((a, b) => rank[a.result] - rank[b.result])[0] ?? null;
}
