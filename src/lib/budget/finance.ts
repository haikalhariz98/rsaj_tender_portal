/**
 * Where the portal and the customer's finance system disagree.
 *
 * The difference is always the two figures subtracted here, never a stored column —
 * and it is taken from the full amounts rather than from the abbreviated ones a
 * screen shows, so "RM 2.35M less RM 2.30M" does not come out as fifty thousand
 * when the real gap is forty-seven.
 */

import { senFromDecimal, subtractSen, type Sen } from "@/lib/money";

export interface Variance {
  id: string;
  budgetCodeCode: string;
  accountCode: string;
  compares: string;
  /// Decimal strings, converted once here.
  portalAmount: string;
  financeAmount: string;
  reason: string;
  lastSeenAt: Date;
  resolvedOn: Date | null;
  resolvedNote: string;
}

export interface VarianceLine {
  variance: Variance;
  portal: Sen;
  finance: Sen;
  /// Finance less portal. Negative means the finance system holds less.
  difference: Sen;
  /// True where the gap is inside the tolerance the customer set, null where none is.
  withinTolerance: boolean | null;
  settled: boolean;
}

export function lineFor(variance: Variance, tolerance: Sen | null, on: Date): VarianceLine {
  const portal = senFromDecimal(variance.portalAmount);
  const finance = senFromDecimal(variance.financeAmount);
  const difference = subtractSen(finance, portal);
  const magnitude = difference < 0n ? -difference : difference;

  return {
    variance,
    portal,
    finance,
    difference,
    withinTolerance: tolerance == null ? null : magnitude <= tolerance,
    settled: variance.resolvedOn != null && variance.resolvedOn <= on,
  };
}

/// The lines still worth somebody's attention: unsettled, and outside any tolerance.
export function outstanding(lines: readonly VarianceLine[]): VarianceLine[] {
  return lines.filter((l) => !l.settled && l.difference !== 0n && l.withinTolerance !== true);
}

export interface FinanceSummary {
  /// What the two sides are apart by in total, ignoring direction.
  gap: Sen;
  outstanding: number;
}

export function summarise(lines: readonly VarianceLine[]): FinanceSummary {
  const live = outstanding(lines);
  let gap = 0n;
  for (const l of live) gap += l.difference < 0n ? -l.difference : l.difference;
  return { gap, outstanding: live.length };
}

/**
 * How long ago something happened, in the sample's shorthand.
 *
 * Null in, null out: a run that has never happened is not "0d ago".
 */
export function ago(then: Date | null, now: Date): string | null {
  if (!then) return null;
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor((now.getTime() - then.getTime()) / 3600000);
  if (hours >= 1) return `${hours}h ago`;
  const minutes = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60000));
  return `${minutes}m ago`;
}

/**
 * Whether the portal can synchronise at all.
 *
 * There is no adapter behind this yet. Saying so is the honest answer — a button
 * that reported success without talking to anything would put a timestamp on the
 * screen that means nothing.
 */
export type SyncReadiness = "NO_ADAPTER" | "NOT_CONFIGURED" | "READY";

export function syncReadiness(direction: string | null | undefined): SyncReadiness {
  if (!direction) return "NOT_CONFIGURED";
  return "NO_ADAPTER";
}
