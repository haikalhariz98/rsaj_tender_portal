/**
 * The indent's validity (FR-AWD-006). The IN number is the finance system's, consumed
 * and never minted; validity runs from its receipt for `AwardPolicy.indentValidityDays`.
 * An indent is VALID through its expiry day and EXPIRED from the day after — the
 * reading of "fourteen days from receipt" is ASSUMED and shown. Unset validity is not
 * valid: it is NOT_SET.
 */

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

/// The reading the expiry day rests on, said wherever it is shown.
export const INDENT_READING = "Valid through its expiry day (the day of receipt plus the validity days): an assumed reading of the rule.";

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
