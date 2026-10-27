/**
 * The valuation cycle (6.13 Part A step 3: FR-PAY-003–006).
 *
 * - The valuation calendar (FR-PAY-003): a day of the month agreed with the contractor, recorded once at the start
 *   of the contract and changed only with a reason; in a shorter month the cycle falls on its last day.
 * - Opening a valuation (FR-PAY-004): driven by the calendar (on that month's day) or by a contractor's claim
 *   (valued on or after the day the claim was received; the issue period runs from the claim's day). One at a time:
 *   a valuation whose certificate is neither issued nor void holds the next; each cycle's day comes after the last
 *   issued one's. Never in the future.
 * - The joint valuation (FR-PAY-006): its participants, the method as explained to the contractor, and the
 *   contractor's agreement or dissent (a dissent says what is disputed). Required before the certificate is raised.
 * Pure.
 */

import type { ContractorAnswer, Day, Finding, ValuationTrigger } from "./types";

/// The calendar's day in a month (YYYY-MM): the day agreed, or the month's last day where it has fewer.
export function valuationDayIn(month: string, dayOfMonth: number): Day {
  const [y, mo] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${month}-${String(Math.min(dayOfMonth, last)).padStart(2, "0")}`;
}

export function calendarFaults(i: { dayOfMonth: number | null; agreedOn: Day | null; agreedWith: string; today: Day; existing: boolean; reason: string }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.dayOfMonth == null || !Number.isInteger(i.dayOfMonth) || i.dayOfMonth < 1 || i.dayOfMonth > 31) f("CALENDAR_DAY_INVALID");
  if (!i.agreedOn) f("CALENDAR_AGREED_ON_REQUIRED");
  else if (i.agreedOn > i.today) f("FUTURE_DATE", { day: i.agreedOn });
  if (!i.agreedWith.trim()) f("CALENDAR_AGREED_WITH_REQUIRED");
  if (i.existing && !i.reason.trim()) f("CALENDAR_CHANGE_REASON_REQUIRED");
  return out;
}

export interface OpenInput {
  trigger: ValuationTrigger | null;
  /// The claim's day (CLAIM) or the calendar day (VALUATION_DATE).
  triggerDate: Day | null;
  valuationDate: Day | null;
  today: Day;
  calendarDay: number | null;
  /// A valuation of this contract not yet closed (open, or raised and its certificate neither issued nor void).
  inProgress: boolean;
  /// The last issued valuation's day. Null: none.
  lastIssuedOn: Day | null;
  /// A baseline version in force today.
  baselineInForce: boolean;
  /// Ruling 1a (code review of close-out stage B, P2): the latest retention release's day. A valuation is not dated before it, as the release counts
  /// against valuations on or after its day. Absent or null: none.
  lastReleaseOn?: Day | null;
}

export function openFaults(i: OpenInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.baselineInForce) f("NO_BASELINE");
  if (i.inProgress) f("VALUATION_IN_PROGRESS");
  if (!i.trigger) f("TRIGGER_REQUIRED");
  if (!i.valuationDate) f("VALUATION_DATE_REQUIRED");
  else {
    if (i.valuationDate > i.today) f("FUTURE_DATE", { day: i.valuationDate });
    if (i.lastIssuedOn && i.valuationDate <= i.lastIssuedOn) f("NOT_AFTER_LAST", { day: i.lastIssuedOn });
    if (i.lastReleaseOn && i.valuationDate < i.lastReleaseOn) f("BEFORE_RELEASE", { day: i.lastReleaseOn });
    if (i.trigger === "VALUATION_DATE") {
      if (i.calendarDay == null) f("CALENDAR_NOT_SET");
      else if (valuationDayIn(i.valuationDate.slice(0, 7), i.calendarDay) !== i.valuationDate) f("NOT_THE_VALUATION_DAY", { day: valuationDayIn(i.valuationDate.slice(0, 7), i.calendarDay) });
    }
  }
  if (i.trigger === "CLAIM") {
    if (!i.triggerDate) f("CLAIM_DATE_REQUIRED");
    else {
      if (i.triggerDate > i.today) f("FUTURE_DATE", { day: i.triggerDate });
      if (i.valuationDate && i.valuationDate < i.triggerDate) f("VALUED_BEFORE_CLAIM", { day: i.triggerDate });
    }
  }
  return out;
}

/// The day the issue period runs from (FR-PAY-004, 018): the claim's day, or the valuation day.
export const issueClockFrom = (trigger: ValuationTrigger, triggerDate: Day | null, valuationDate: Day): Day => (trigger === "CLAIM" && triggerDate ? triggerDate : valuationDate);

export function jointFaults(i: { participants: readonly string[]; method: string; answer: ContractorAnswer | null; dissent: string; on: Day | null; valuationDate: Day; today: Day }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (i.participants.filter((p) => p.trim()).length < 2) f("PARTICIPANTS_REQUIRED");
  if (!i.method.trim()) f("METHOD_REQUIRED");
  if (!i.answer) f("ANSWER_REQUIRED");
  else if (i.answer === "DISSENT" && !i.dissent.trim()) f("DISSENT_REQUIRED");
  if (!i.on) f("JOINT_DAY_REQUIRED");
  else {
    if (i.on > i.today) f("FUTURE_DATE", { day: i.on });
    if (i.on < i.valuationDate) f("JOINT_BEFORE_VALUATION", { day: i.valuationDate });
  }
  return out;
}
