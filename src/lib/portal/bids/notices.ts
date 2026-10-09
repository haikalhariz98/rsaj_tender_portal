/**
 * The notices a supplier is shown in its portal (FR-ADV-012, 014, 015, 016 and FR-AWD-010, Phase 4d). Pure.
 *
 * The notices are the office's own records, read for the exercises where one of the supplier's linked parties bought the documents: an addendum it holds a copy of (a later purchaser gets every issued
 * addendum "with the documents"), a change of the closing that was applied, the cancellation of the exercise, and a notice of non-award. They are SHOWN in the portal and are NOT SENT: email is not connected
 * (INT-09). Seeing one here is not delivery: it sets nothing the officers record of a paper copy (`despatchedOn`, `acknowledgedOn`), and no notice here counts as delivered because it was read. A closing change or a
 * cancellation that was only requested is not a notice yet: it is shown once applied.
 */

import { NOTICE_DELIVERY_STATEMENT } from "@/lib/inbox/kinds";

export type PortalNoticeKind = "ADDENDUM" | "CLOSING_CHANGED" | "EXERCISE_CANCELLED" | "NON_AWARD";

export const NOTICE_KIND_WORDS: Record<PortalNoticeKind, string> = {
  ADDENDUM: "Addendum",
  CLOSING_CHANGED: "Closing changed",
  EXERCISE_CANCELLED: "Exercise cancelled",
  NON_AWARD: "Notice of the outcome",
};

export interface PortalNotice {
  /// Unique within a list: the kind and the record it is.
  key: string;
  kind: PortalNoticeKind;
  exerciseId: string;
  exerciseReference: string;
  exerciseTitle: string;
  /// The organisation's day the notice was issued or applied (YYYY-MM-DD).
  on: string;
  title: string;
  body: string;
  /// For an addendum: its id, whether the supplier has acknowledged it and on what day.
  addendum?: { id: string; acknowledgedOn: string | null };
}

/// Newest first; on the same day the later kind in this order first, then by key, so the order never depends on the database's.
const KIND_ORDER: Record<PortalNoticeKind, number> = { NON_AWARD: 0, EXERCISE_CANCELLED: 1, CLOSING_CHANGED: 2, ADDENDUM: 3 };
export function sortNotices(ns: readonly PortalNotice[]): PortalNotice[] {
  return [...ns].sort((a, b) => b.on.localeCompare(a.on) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key));
}

/// How many addenda this supplier holds and has not acknowledged.
export const unacknowledged = (ns: readonly PortalNotice[]): number => ns.filter((n) => n.kind === "ADDENDUM" && n.addendum && n.addendum.acknowledgedOn == null).length;

export { NOTICE_DELIVERY_STATEMENT };
