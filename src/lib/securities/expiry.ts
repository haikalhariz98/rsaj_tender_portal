/**
 * Expiry alerts for a security or a policy (FR-AWD-012), from the `security.expiring`
 * notification rule's offsets. Computed and shown; nothing is sent (6.11 ruling).
 */

import { addDays, daysFrom, type Day } from "./period";

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

/// The last expiry day that raises an alert today: today plus the largest offset, or —
/// with no offsets set — yesterday, so only what has already expired. Lets a register
/// count what is expiring in the database, by the same rule `expiryAlert` applies.
export function alertingUpTo(offsets: readonly number[], today: Day): Day {
  return offsets.length ? addDays(today, Math.max(...offsets)) : addDays(today, -1);
}

/**
 * Where a register row sorts: live rows first (0), then those long expired — past the
 * largest reminder offset, or past at all where none is set (1) — then rejected ones
 * (2). Within a rank, soonest to expire first, with no expiry recorded leading.
 */
export function longExpiredBefore(offsets: readonly number[], today: Day): Day {
  return offsets.length ? addDays(today, -Math.max(...offsets)) : today;
}
export function registerRank(row: { status: string; expiresOn: Day | null }, cutoff: Day): 0 | 1 | 2 {
  if (row.status === "REJECTED") return 2;
  return row.expiresOn != null && row.expiresOn < cutoff ? 1 : 0;
}

/**
 * The chip a security or policy carries for its expiry alert (FR-AWD-012; AC-15): the one wording, so the award's
 * Securities tab, the contract's and the Contracts list's view show the same chip for the same instrument. Null when
 * the alert is not due.
 */
export function expiryChip(a: ExpiryAlert | null): { text: string; tone: "err" | "warn" } | null {
  if (!a) return null;
  if (a.state === "EXPIRED") return { text: `Expired ${a.daysAgo} days ago`, tone: "err" };
  if (a.state === "DUE") return { text: `Expires in ${a.daysLeft} days`, tone: "warn" };
  if (a.state === "NO_EXPIRY") return { text: "No expiry recorded", tone: "warn" };
  return null;
}

/// The configured reminder intervals in words. With none configured it says so; it is never "0 days" (AC-15).
export function remindersText(offsets: readonly number[]): string {
  return offsets.length ? `Reminders at ${offsets.join(", ")} days` : "Expiry reminders are not set";
}
