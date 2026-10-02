/**
 * The window's phases (§7.3.2: Advertised / Invited → Open for purchase → Closed for purchase →
 * Open for submission → Closed), derived from the stored instants on every read and every write,
 * never stored (ADR 0014, 6.5 OD-2). Only acts are statuses: advertised, invited, cancelled.
 * There is no scheduler: "now" is a parameter, and a write re-derives the phase under its lock.
 *
 * - Before publication: NOT_PUBLISHED.
 * - Published, before the first purchase day (in the organisation's zone): PUBLISHED.
 * - From the first purchase day to the end of the last: OPEN_FOR_PURCHASE.
 * - After the last purchase day, until the closing instant: CLOSED_FOR_PURCHASE.
 * - From the closing instant (14:30:00 is closed): CLOSED. A bidder's act reads the closing a
 *   second later: an envelope recorded at 14:30:00 is in time and late only from 14:30:01, and a
 *   withdrawal or correction is taken in the closing second (bids/lateness.ts `isLate`, BD-66-3).
 *   Both readings are pinned together by src/lib/bids/closing-instant.test.ts; change neither alone.
 * - Cancelled wins over everything.
 * Submission is open in both purchase phases. A day-based phase cannot be told with no zone set
 * (an unset zone is not UTC): it reads UNKNOWN, and acts that depend on it are refused.
 */

import { dayIn, storedDay } from "@/lib/dates";
import type { ExerciseStatus } from "@/lib/method/types";

export type WindowPhase = "NOT_PUBLISHED" | "PUBLISHED" | "OPEN_FOR_PURCHASE" | "CLOSED_FOR_PURCHASE" | "CLOSED" | "CANCELLED" | "UNKNOWN";
export const WINDOW_PHASES: readonly WindowPhase[] = ["NOT_PUBLISHED", "PUBLISHED", "OPEN_FOR_PURCHASE", "CLOSED_FOR_PURCHASE", "CLOSED", "CANCELLED", "UNKNOWN"];

export interface PhaseInput {
  status: ExerciseStatus;
  /// The stored days (midnight UTC of the day), or null where not set.
  purchaseFromDay: Date | null;
  purchaseCloseDay: Date | null;
  closingAt: Date | null;
}

/// Whether the exercise has been published: one of the two acts that publish it, or one of 6.7's
/// opening acts that follow (X-8), so its window still reads CLOSED after the box is opened, or one
/// of 6.8's evaluation states, so it reads CLOSED while evaluated and is cancelled the same way (E-10).
export const isPublished = (status: ExerciseStatus) => status === "ADVERTISED" || status === "INVITED" || status === "OPENING_IN_PROGRESS" || status === "OPENED" || status === "UNDER_EVALUATION" || status === "EVALUATED";

export function windowPhase(w: PhaseInput, now: Date, timeZone: string | null): { phase: WindowPhase; submissionOpen: boolean } {
  const out = (phase: WindowPhase) => ({ phase, submissionOpen: phase === "OPEN_FOR_PURCHASE" || phase === "CLOSED_FOR_PURCHASE" });
  if (w.status === "CANCELLED") return out("CANCELLED");
  if (!isPublished(w.status)) return out("NOT_PUBLISHED");
  if (!w.closingAt) return out("UNKNOWN");
  // The closing is an instant: judged without a zone.
  if (now.getTime() >= w.closingAt.getTime()) return out("CLOSED");
  if (!timeZone || !w.purchaseFromDay || !w.purchaseCloseDay) return out("UNKNOWN");
  const today = dayIn(now, timeZone);
  if (today < storedDay(w.purchaseFromDay)) return out("PUBLISHED");
  if (today <= storedDay(w.purchaseCloseDay)) return out("OPEN_FOR_PURCHASE");
  return out("CLOSED_FOR_PURCHASE");
}

/**
 * FR-DOC-010: the Tender Table Document is available for inspection from publication to the
 * closing, and withdrawn after it. Derived from the phase; the inspection log waits for sign-in.
 */
export type TableAvailability = "NOT_YET" | "AVAILABLE" | "WITHDRAWN" | "UNKNOWN";
export function tableDocumentAvailability(phase: WindowPhase): TableAvailability {
  switch (phase) {
    case "NOT_PUBLISHED":
      return "NOT_YET";
    case "PUBLISHED":
    case "OPEN_FOR_PURCHASE":
    case "CLOSED_FOR_PURCHASE":
      return "AVAILABLE";
    case "CLOSED":
    case "CANCELLED":
      return "WITHDRAWN";
    case "UNKNOWN":
      return "UNKNOWN";
    default: {
      const never: never = phase;
      return never;
    }
  }
}

/**
 * Whether the Tender Table Document may be PRINTED now (FR-DOC-010): only while it is available
 * for inspection, from publication to the closing. Outside that window the print is refused with
 * the availability in words beside it, never a blank page; null where it may be printed.
 */
export function tablePrintRefusal(availability: TableAvailability): string | null {
  return availability === "AVAILABLE" ? null : "It is printed only while it is available for inspection, from publication to the closing.";
}

/**
 * What a printout of the documents as approved does not say: the print is the text frozen at
 * approval, so a closing moved since and the addenda issued since are named beside it.
 */
export function sinceApprovedLines(i: { closing: string | null; closingChanges: number; addendaIssued: number }): string[] {
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  return [
    i.closingChanges > 0 ? `The closing has been changed ${i.closingChanges} ${plural(i.closingChanges, "time", "times")} since approval; it now stands at ${i.closing ?? "a time not set"}.` : "The closing is as approved.",
    i.addendaIssued > 0 ? `${i.addendaIssued} ${plural(i.addendaIssued, "addendum has", "addenda have")} been issued since approval. This text is as approved and does not include ${plural(i.addendaIssued, "it", "them")}.` : "No addendum has been issued since approval.",
  ];
}

export interface ClosingHistoryEntry {
  /// APPROVED: 6.4's approved dates, frozen on the pack (X-2). Otherwise the applied change's kind.
  source: "APPROVED" | "CORRECTION" | "EXTENSION";
  closingAt: Date;
  purchaseCloseDay: Date | null;
  /// When it took effect: the approval, or the change's application.
  at: Date | null;
  reason: string;
}

/**
 * The closing's history (FR-ADV-015, X-2): the approved pack's dates first, then each applied
 * change in the order applied. Refused and pending changes are not in it. Its last entry is the
 * exercise's closing (`closingConsistent`).
 */
export function closingHistory(
  approved: { closingAt: Date; approvedAt: Date | null } | null,
  changes: readonly { kind: "CORRECTION" | "EXTENSION"; toClosingAt: Date; toPurchaseCloseDay: Date | null; appliedAt: Date | null; reason: string }[],
): ClosingHistoryEntry[] {
  const out: ClosingHistoryEntry[] = approved ? [{ source: "APPROVED", closingAt: approved.closingAt, purchaseCloseDay: null, at: approved.approvedAt, reason: "" }] : [];
  const applied = changes.filter((c) => c.appliedAt != null).sort((a, b) => a.appliedAt!.getTime() - b.appliedAt!.getTime());
  for (const c of applied) out.push({ source: c.kind, closingAt: c.toClosingAt, purchaseCloseDay: c.toPurchaseCloseDay, at: c.appliedAt, reason: c.reason });
  return out;
}

/**
 * The history entry that "stands now": the last, unless the exercise is cancelled. Cancelled is
 * judged first (as in `windowPhase`): a cancelled exercise's closing is no longer a date anything
 * will happen on, so no entry stands. Null where none does.
 */
export function standingEntry(historyLength: number, phase: WindowPhase): number | null {
  if (phase === "CANCELLED" || historyLength === 0) return null;
  return historyLength - 1;
}

/// The verb a header puts before the closing: it closes, it closed, or it was to close and the exercise was cancelled.
export function closingVerb(phase: WindowPhase): "Closes" | "Closed" | "Was to close" {
  if (phase === "CANCELLED") return "Was to close";
  return phase === "CLOSED" ? "Closed" : "Closes";
}

/// Whether the exercise's closing is the history's last entry (X-2: only the two writers write it).
export function closingConsistent(history: readonly ClosingHistoryEntry[], closingAt: Date | null): boolean {
  const last = history.at(-1);
  if (!last || !closingAt) return history.length === 0 && closingAt == null;
  return last.closingAt.getTime() === closingAt.getTime();
}
