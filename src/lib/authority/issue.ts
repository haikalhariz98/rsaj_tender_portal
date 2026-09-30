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
