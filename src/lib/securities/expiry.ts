/**
 * Expiry alerts for a security or a policy (FR-AWD-012), from the `security.expiring`
 * notification rule's offsets. Computed and shown; nothing is sent (6.11 ruling).
 */

import { daysFrom, type Day } from "./period";

export type ExpiryAlert =
  | { state: "NO_EXPIRY" }
  | { state: "EXPIRED"; daysAgo: number }
  | { state: "DUE"; offset: number; daysLeft: number }
  | { state: "NONE"; daysLeft: number };

/// The alert due today: the smallest offset the days left have reached.
export function expiryAlert(expiresOn: Day | null, offsets: readonly number[], today: Day): ExpiryAlert {
  if (!expiresOn) return { state: "NO_EXPIRY" };
  const left = daysFrom(today, expiresOn);
  if (left < 0) return { state: "EXPIRED", daysAgo: -left };
  const reached = offsets.filter((o) => left <= o);
  if (reached.length === 0) return { state: "NONE", daysLeft: left };
  return { state: "DUE", offset: Math.min(...reached), daysLeft: left };
}
