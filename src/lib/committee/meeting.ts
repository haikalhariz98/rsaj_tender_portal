/**
 * The sitting lifecycle (ADR 0001).
 *
 *   SCHEDULED   -> IN_PROGRESS | CANCELLED
 *   IN_PROGRESS -> MINUTED | CANCELLED
 *   MINUTED, CANCELLED: terminal
 *
 * Once minuted, the sitting and everything under it are frozen: the minute is a legal
 * record. A sitting is minuted only with minutes written and no matter left pending,
 * and cancelled only with a reason and before any matter has been decided — a
 * cancelled sitting that carried a matter would be a contradiction on the record.
 */

import type { DecisionOutcome, MeetingStatus } from "./matter";

export type TransitionFault =
  | "NOT_ALLOWED"
  | "MINUTES_REQUIRED"
  | "MATTERS_PENDING"
  | "REASON_REQUIRED"
  | "MATTERS_DECIDED";

const NEXT: Record<MeetingStatus, readonly MeetingStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["MINUTED", "CANCELLED"],
  MINUTED: [],
  CANCELLED: [],
};

export function meetingTransition(
  from: MeetingStatus,
  to: MeetingStatus,
  f: { minutes: string; reason: string; matterOutcomes: readonly DecisionOutcome[] },
): { ok: true } | { ok: false; fault: TransitionFault } {
  if (!NEXT[from].includes(to)) return { ok: false, fault: "NOT_ALLOWED" };
  if (to === "MINUTED") {
    if (!f.minutes.trim()) return { ok: false, fault: "MINUTES_REQUIRED" };
    if (f.matterOutcomes.includes("PENDING")) return { ok: false, fault: "MATTERS_PENDING" };
  }
  if (to === "CANCELLED") {
    if (!f.reason.trim()) return { ok: false, fault: "REASON_REQUIRED" };
    if (f.matterOutcomes.some((o) => o === "CARRIED" || o === "NOT_CARRIED")) {
      return { ok: false, fault: "MATTERS_DECIDED" };
    }
  }
  return { ok: true };
}

/// Whether anything under the sitting may still change.
export function isFrozen(status: MeetingStatus): boolean {
  return status === "MINUTED" || status === "CANCELLED";
}

/// The transitions a sitting in this status offers.
export function nextStatuses(from: MeetingStatus): readonly MeetingStatus[] {
  return NEXT[from];
}
