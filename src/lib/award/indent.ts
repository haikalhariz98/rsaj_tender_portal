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
