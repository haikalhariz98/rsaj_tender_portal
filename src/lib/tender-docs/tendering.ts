/**
 * Approval for Tendering (FR-DOC-012; §7.3.2; DAL §3.1.4.4 item 1): the exercise's route
 * under its own rule domain, resolved by the generic engine from the customer's matrix
 * rows (none shipped; no approver is named here), and what its approving step records.
 *
 * The approving step records DATE START and CLOSING DATE (X-2): the day tendering starts
 * and the closing day and time, judged in the organisation's time zone. Q-5: only that
 * the dates are there and in order; the closing-time and period rules are 6.5's.
 *
 * Q-3: a rejection always returns the documents for amendment (§7.3.2 gives exactly two
 * exits). It is snapshotted on the route as a return to the originator, STATED, never
 * read from configured destinations; ending the exercise is the separate cancel act.
 * Pure.
 */

import type { RejectionOutcome } from "@/lib/authority/rejection";
import { dayIn, isDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { exerciseRoutePreview, withRequester, type AppointmentPreview, type FunderContext, type RequesterOnName } from "@/lib/method/approval";
import { TENDERING_APPROVAL_DOMAIN, type Method } from "@/lib/method/types";
import { leadTime, type LeadState } from "@/lib/scope/estimate";
import type { ScopePolicy } from "@/lib/scope/types";

import type { Finding } from "./types";

/// The rule domain the customer's Approval for Tendering rows are written under.
export const TENDERING_DOMAIN = TENDERING_APPROVAL_DOMAIN;

export type TenderingRouteState = "NO_METHOD_KEY" | "NO_RULE" | "HAS_COMMITTEE_STEP" | "RESOLVED";

/**
 * The route for approval for tendering, at the exercise's value under its method's key. A
 * committee step cannot be discharged on an exercise route yet (as for the name, 6.3), so a
 * route with one is refused and says so; no rule is refused naming the matrix. Neither is a
 * guess at who approves.
 */
export function resolveTendering(ctx: FunderContext, method: Method, value: number): AppointmentPreview & { tenderingState: TenderingRouteState } {
  const p = exerciseRoutePreview(ctx, TENDERING_DOMAIN, method, value);
  if (p.state === "NO_METHOD_KEY") return { ...p, tenderingState: "NO_METHOD_KEY" };
  if (p.state !== "RESOLVED") return { ...p, tenderingState: "NO_RULE" };
  if (p.chain.some((s) => s.committeeCode)) return { ...p, tenderingState: "HAS_COMMITTEE_STEP" };
  return { ...p, tenderingState: "RESOLVED" };
}

/// The route with the requester in mind (FR-APR-008): self-approval escalates or is refused.
export function tenderingRouteForRequester(ctx: FunderContext, method: Method, value: number, requester: RequesterOnName): AppointmentPreview & { tenderingState: TenderingRouteState; refusal: string | null } {
  const r = resolveTendering(ctx, method, value);
  if (r.tenderingState !== "RESOLVED") return { ...r, refusal: null };
  const w = withRequester(ctx, TENDERING_DOMAIN, method, value, r, requester, "tendering");
  // Escalating past the requester can land on a committee (an office whose self-approval
  // escalates to one): judged again on the chain that would open, as the first chain was.
  return { ...r, ...w, tenderingState: w.chain.some((s) => s.committeeCode) ? "HAS_COMMITTEE_STEP" : "RESOLVED" };
}

/// What the route stores when it opens (Q-3): a return to the originator, STATED by §7.3.2.
export function tenderingRejectionSnapshot(at: Date) {
  return {
    rejectionSnapshotAt: at,
    rejectionDestinationId: null,
    rejectionKind: "RETURN_TO_ORIGINATOR" as const,
    rejectionReturnToRoleCode: null,
    rejectionProvenance: "STATED" as const,
  };
}

/// Where a rejection on the route sends the documents: always back for amendment (Q-3).
/// A committee's terminal outcome does not end the exercise here: cancelling is its own act.
export function returnOutcome(): RejectionOutcome & { apply: "RETURN_TO_ORIGINATOR" } {
  return { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" };
}

/// How the trail says who decided the rejection's destination.
export const RETURN_DECIDED_BY = "the procedure: returned for amendment (§7.3.2)";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/// The UTC offset (ms) of a zone at an instant.
function offsetAt(t: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - t;
}

/// The instant a wall-clock day and time names in a zone ("2026-10-29", "14:30", "Asia/Kuala_Lumpur").
export function zonedInstant(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let t = wall - offsetAt(wall, timeZone);
  t = wall - offsetAt(t, timeZone);
  return new Date(t);
}

/// The closing time as the zone's clock reads it, "14:30".
export function timeIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
}

export type DatesFault = "TIME_ZONE_NOT_SET" | "DATES_REQUIRED" | "DATE_NOT_VALID" | "CLOSING_TIME_NOT_VALID" | "START_IN_PAST" | "CLOSING_NOT_AFTER_START" | "DATES_DIFFER_FROM_DOCUMENTS";

/**
 * The start day and the closing day and time, as proposed at submission or recorded by the
 * approving step. Judged in the organisation's day: unset zone blocks, never UTC's day.
 * The start may be today; the closing day must be after the start day.
 */
export function approvalDatesFault(i: { startOn: string | null; closingDay: string | null; closingTime: string | null; timeZone: string | null; today: string | null }): { faults: Finding<DatesFault>[]; closingAt: Date | null } {
  const f = (code: DatesFault): { faults: Finding<DatesFault>[]; closingAt: null } => ({ faults: [{ code, level: "block" }], closingAt: null });
  if (!i.timeZone || !i.today) return f("TIME_ZONE_NOT_SET");
  if (!i.startOn || !i.closingDay || !i.closingTime) return f("DATES_REQUIRED");
  // A real day each, by the round trip: 2026-11-31 is refused, never read as 1 December.
  if (!isDay(i.startOn) || !isDay(i.closingDay)) return f("DATE_NOT_VALID");
  if (!TIME.test(i.closingTime)) return f("CLOSING_TIME_NOT_VALID");
  const faults: Finding<DatesFault>[] = [];
  if (i.startOn < i.today) faults.push({ code: "START_IN_PAST", level: "block" });
  if (i.closingDay <= i.startOn) faults.push({ code: "CLOSING_NOT_AFTER_START", level: "block" });
  if (faults.length) return { faults, closingAt: null };
  return { faults: [], closingAt: zonedInstant(i.closingDay, i.closingTime, i.timeZone) };
}

/**
 * 6.2's estimate lead, read against the closing the approver is about to record: a warning
 * at approval, never a refusal (6.7 refuses on a late estimate and owns its override).
 */
export function estimateLeadWarning(lastVersion: string | Date | null, closingAt: Date | null, policy: Pick<ScopePolicy, "estimateLeadDays">, timeZone: string | null): { state: LeadState; lastPermittedDay?: string; lastVersionDay?: string; warn: boolean } {
  const l = leadTime(lastVersion, closingAt, policy, timeZone);
  return { ...l, warn: l.state !== "READY" };
}

/// The day an instant falls on in the organisation's zone (for a closing instant's day).
export const closingDayOf = (closingAt: Date, timeZone: string) => dayIn(closingAt, timeZone);

/**
 * Increment 2 (FR-DOC-005): where the frozen documents state the registrations' validity
 * window, they state the days proposed at submission. The approving step records those days,
 * or the documents would contradict the record: other days need the documents returned for
 * amendment, and the next version states the new ones. Where no frozen document states the
 * window (`stated` null, or a pack frozen before increment 2), the approver may set any valid
 * days, as before. The closing time is not part of the window and may differ.
 */
export function frozenWindowFault(stated: { startOn: string; closingDay: string } | null, recorded: { startOn: string | null; closingDay: string | null }): Finding<"DATES_DIFFER_FROM_DOCUMENTS"> | null {
  if (!stated) return null;
  if (recorded.startOn === stated.startOn && recorded.closingDay === stated.closingDay) return null;
  return { code: "DATES_DIFFER_FROM_DOCUMENTS", level: "block", data: { startOn: stated.startOn, closingDay: stated.closingDay } };
}

/**
 * What the approving step's form shows when a frozen notice states the validity window (U2):
 * the start and closing day as fixed values ("08 Oct 2026, as the notice states"), with the
 * words that say why; only the closing time stays editable. Null where no document states it:
 * then the approver sets the days. The values posted are the stated days, and
 * `frozenWindowFault` still judges what arrives.
 */
export function decisionWindow(stated: { startOn: string; closingDay: string } | null) {
  if (!stated) return null;
  return {
    startOn: stated.startOn,
    closingDay: stated.closingDay,
    startText: `${formatDate(stated.startOn)}, as the notice states`,
    closingText: `${formatDate(stated.closingDay)}, as the notice states`,
    note: "Approving records these days. To change them, return the documents.",
  };
}
