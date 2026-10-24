/**
 * The indent's validity (FR-AWD-006). The IN number is the finance system's, consumed
 * and never minted; validity runs from its receipt for `AwardPolicy.indentValidityDays`.
 * An indent is VALID through its expiry day and EXPIRED from the day after — the
 * reading of "fourteen days from receipt" is ASSUMED and shown. Unset validity is not
 * valid: it is NOT_SET.
 */

import { formatDate } from "@/lib/format";
import { addDays, type Day } from "@/lib/securities/period";

export type IndentState =
  | { state: "NOT_RECEIVED" }
  | { state: "NOT_SET" }
  | { state: "VALID"; expiresOn: Day }
  | { state: "EXPIRED"; expiresOn: Day };

export function indentState(receivedOn: Day | null, validityDays: number | null, today: Day): IndentState {
  if (!receivedOn) return { state: "NOT_RECEIVED" };
  if (validityDays == null) return { state: "NOT_SET" };
  const expiresOn = addDays(receivedOn, validityDays);
  return today > expiresOn ? { state: "EXPIRED", expiresOn } : { state: "VALID", expiresOn };
}

/**
 * FR-AWD-006 (product owner ruling, 2026-10-24): an expired work indent is not accepted, on paper or online. The day judged is the day the acceptance was received
 * (`signedLetterReceivedOn`; for a return sent online, the day it was lodged, WV-3), never the day an officer verifies it. The indent's expiry day where that day is past
 * it, else null. An indent not received, or a validity not set, is never refused here.
 */
export function indentReturnLate(receivedOn: Day | null, validityDays: number | null, returnedOn: Day): Day | null {
  const s = indentState(receivedOn, validityDays, returnedOn);
  return s.state === "EXPIRED" ? s.expiresOn : null;
}

/// FR-AWD-006: what a late acceptance is told. The staff instruction (cancel, raise a fresh indent) is the office's, so the contractor's words leave it out.
export const indentLateWords = (expiredOn: Day, receivedOn: Day, staff: boolean): string =>
  `The indent expired on ${formatDate(expiredOn)}; an acceptance received on ${formatDate(receivedOn)} is not taken.${staff ? " Cancel this award and raise a fresh indent." : ""}`;

/// The reading the expiry day rests on, behind an Assumed chip (0005 R15).
export const INDENT_READING_DETAIL = "Valid through its expiry day.";

/**
 * Whether an expired indent is still a live problem: until work commences under it, and
 * never on a cancelled award (build decision BD-12). Once work has started, the indent
 * was acted on inside its validity.
 */
export function indentExpiryRaised(state: IndentState | null, commencedOn: Day | null, status: string): boolean {
  return state?.state === "EXPIRED" && !commencedOn && status !== "CANCELLED";
}

/// An indent received before this day has expired today: lets a list count expired
/// indents in the database by the same reading as `indentState`. Null: validity unset.
export function expiredIfReceivedBefore(validityDays: number | null, today: Day): Day | null {
  return validityDays == null ? null : addDays(today, -validityDays);
}
