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
  | "MATTERS_DECIDED"
  | "NOT_YET_DUE"
  | "REGISTER_FAULTS"
  | "DECISION_NO_LONGER_HOLDS"
  | "TIME_ZONE_UNSET";

const NEXT: Record<MeetingStatus, readonly MeetingStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["MINUTED", "CANCELLED"],
  MINUTED: [],
  CANCELLED: [],
};

export function meetingTransition(
  from: MeetingStatus,
  to: MeetingStatus,
  f: {
    minutes: string;
    /// Founder, 2026-10-05: the minutes are uploaded as a file. Either the file or minutes
    /// typed before uploads existed satisfies minuting.
    minutesFiled?: boolean;
    reason: string;
    matterOutcomes: readonly DecisionOutcome[];
    /// Today in the organisation's zone and the sitting's date, both YYYY-MM-DD. A
    /// sitting cannot start before the day it is dated.
    /// Null while the organisation has no time zone: a sitting cannot start then.
    today?: string | null;
    meetingDay?: string;
    /// Faults in the register as it stands. A minute of a faulty register is refused.
    registerFaults?: number;
    /// Decided matters that no longer follow from the register and votes.
    brokenDecisions?: number;
  },
): { ok: true } | { ok: false; fault: TransitionFault } {
  if (!NEXT[from].includes(to)) return { ok: false, fault: "NOT_ALLOWED" };
  if (to === "IN_PROGRESS" && f.today === null) return { ok: false, fault: "TIME_ZONE_UNSET" };
  if (to === "IN_PROGRESS" && f.today && f.meetingDay && f.meetingDay > f.today) {
    return { ok: false, fault: "NOT_YET_DUE" };
  }
  if (to === "MINUTED") {
    if (!f.minutes.trim() && !f.minutesFiled) return { ok: false, fault: "MINUTES_REQUIRED" };
    if (f.matterOutcomes.includes("PENDING")) return { ok: false, fault: "MATTERS_PENDING" };
    if ((f.registerFaults ?? 0) > 0) return { ok: false, fault: "REGISTER_FAULTS" };
    if ((f.brokenDecisions ?? 0) > 0) return { ok: false, fault: "DECISION_NO_LONGER_HOLDS" };
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

export type SittingAct = "VOTE" | "ATTENDANCE" | "OUTCOME" | "TABLE" | "RECUSE" | "MINUTES" | "EDIT";

/**
 * Which writes a sitting in this status accepts (ruling §8.2): the register, votes and
 * outcomes only while in progress; tabling, recusals, minutes and edits until it is
 * minuted or cancelled.
 */
export function sittingPermits(status: MeetingStatus, act: SittingAct): boolean {
  if (isFrozen(status)) return false;
  if (act === "VOTE" || act === "ATTENDANCE" || act === "OUTCOME") return status === "IN_PROGRESS";
  return true;
}
