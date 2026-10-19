/**
 * The life of an issue of the approval limits: a draft, then issued, then superseded.
 *
 * A draft is editable and invisible to routing. Issuing puts it into force from a
 * date and freezes it; the issue it replaces ends on that date and is kept, so a
 * decision taken under it can always be shown the rules it ran under (FR-APR-020).
 * Issuing is also where a second approval will sit once sign-in exists.
 */

/**
 * The one definition of "the issue in force on a date", as a query filter. Every read
 * that means "the rules that apply" goes through this — a draft must never route a
 * matter, block a delegation or name a committee's mandate.
 *
 * `fundingRouteCode` picks whose rules: null (the default, so every existing reader
 * is unchanged) is the organisation's own issue and excludes every funder's rule set;
 * a route's code reads that funder's rule set instead (FR-REQ-006).
 */
export function issuedInForce(asOf: Date, fundingRouteCode: string | null = null) {
  return {
    fundingRouteCode,
    issuedAt: { not: null },
    effectiveFrom: { lte: asOf },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
  };
}

export interface IssuePeriod {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/// Midnight UTC of a date: issues run from whole days.
export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/// Issuing writes when it was issued on the organisation's clock (formatOrgDateTime); with no zone
/// there is no honest time to write, so the issue is refused rather than stamped as UTC (68-C5 residual).
export const ISSUE_TIME_ZONE_UNSET = "Set the organisation's time zone first, under Configuration › Organisation: when an issue was issued is recorded on the organisation's clock, and it is not assumed to be UTC.";

export type IssueFault = "IN_THE_PAST" | "NOT_AFTER_LATEST";

/**
 * Why a draft cannot be issued from `from`.
 *
 * Never back-dated: that would change the rules decisions already ran under. And never
 * slotted in before an issue already issued to start later — issues follow one another
 * in the order they are issued, so the history reads the way it happened.
 */
export function issueFault(from: Date, today: Date, issued: readonly IssuePeriod[]): IssueFault | null {
  if (startOfDay(from) < startOfDay(today)) return "IN_THE_PAST";
  if (issued.some((i) => i.effectiveFrom >= startOfDay(from))) return "NOT_AFTER_LATEST";
  return null;
}

/// The issued issue a new one starting on `from` replaces: the one in force that day.
export function predecessorOf(issued: readonly IssuePeriod[], from: Date): IssuePeriod | null {
  const day = startOfDay(from);
  return (
    issued.find(
      (i) => i.effectiveFrom < day && (i.effectiveTo == null || i.effectiveTo > day),
    ) ?? null
  );
}

/**
 * The issues a draft's lifecycle is judged against: those on its own route. A funder's
 * rule set follows its own line of issues, so issuing one never ends the
 * organisation's own issue, and is never refused for starting before it.
 */
export function onRoute<T extends { fundingRouteCode: string | null }>(
  issues: readonly T[],
  fundingRouteCode: string | null,
): T[] {
  return issues.filter((i) => (i.fundingRouteCode ?? null) === (fundingRouteCode ?? null));
}

/**
 * Which day picks the issue a route runs under (FR-APR-020, ruling R2).
 *
 * A requisition routes under the limits in force on the day it was raised — not the day
 * it is submitted — so a new issue coming into force between the two does not change
 * the route its raiser was working to. `raisedOn` is set at creation and not edited
 * after, so the day cannot be moved to choose an issue. A name-approval route and an
 * award's appointment route are matters of their own day: they route under the issue in
 * force when they are submitted. Holders and absence are always read on the submission
 * day: who can act is a fact of the day the route opens.
 */
export type RoutedMatter = "REQUISITION" | "NAME_APPROVAL" | "AWARD";

export function issueDayFor(matter: RoutedMatter, days: { raisedOn: Date; submittedOn: Date }): Date {
  return startOfDay(matter === "REQUISITION" ? days.raisedOn : days.submittedOn);
}

/// The issue in force on a day among issued periods: from its start day, up to (not
/// including) its end day — the same reading as `issuedInForce`.
export function inForceOn<T extends IssuePeriod>(issues: readonly T[], day: Date): T | null {
  const d = startOfDay(day);
  const live = issues.filter((i) => startOfDay(i.effectiveFrom) <= d && (i.effectiveTo == null || i.effectiveTo > d));
  return live.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}

/**
 * Said on the route where the issue it ran under is not the one in force on the day it
 * was submitted, so nobody mistakes the older limits for an error. Null where they are
 * the same issue, or where no issue is in force at submission.
 */
export function newerIssueNote(
  routedUnder: { id: string; label: string },
  inForceAtSubmission: { id: string; label: string } | null,
  raisedOnText: string,
): { code: "NEWER_ISSUE_IN_FORCE"; level: "info"; messageEn: string; } | null {
  if (!inForceAtSubmission || inForceAtSubmission.id === routedUnder.id) return null;
  return {
    code: "NEWER_ISSUE_IN_FORCE",
    level: "info",
    messageEn: `Routed under “${routedUnder.label}”, the issue in force on ${raisedOnText}, when the requisition was raised. “${inForceAtSubmission.label}” is in force on the day it was submitted; a requisition keeps the limits it was raised under.`,
  };
}

/// The refusal where no issue was in force on the day the requisition was raised. It
/// names that day and never falls back to today; the exit is a new requisition.
export function noIssueOnRaisedText(raisedOnText: string): string {
  return `No approval matrix was in force on ${raisedOnText}, the day this requisition was raised, so it cannot be routed: a requisition routes under the limits in force when it was raised, and an issue is never back-dated. Cancel it and raise a new requisition to route under the issue in force now.`;
}
