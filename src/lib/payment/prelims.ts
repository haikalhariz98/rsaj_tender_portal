/**
 * Preliminaries and general items (6.13 Part A step 3: FR-PAY-009, a Should; §8.3's insurance rule).
 *
 * Each item carries its payment category: paid in full in the first payment, progressively (by time or progress),
 * or on completion. Where the priced insurance exceeds the premium actually paid, the first valuation pays the
 * premium paid and the balance goes progressively. The rule only; the valuation's preliminaries entry waits for a
 * later step (BD-613-33): the main contractor's works are valued as one figure to date. Pure.
 */

import type { Sen } from "@/lib/money";

export type PrelimsCategory = "FIRST" | "PROGRESSIVE" | "ON_COMPLETION";

export interface PrelimsItem {
  category: PrelimsCategory;
  priced: Sen;
  /// For an insurance item: the premium actually paid. Null: not an insurance item.
  premiumPaid: Sen | null;
}

/// What an item pays in the first valuation, and what is left to go progressively (or on completion).
export function prelimsFirst(i: PrelimsItem): { first: Sen; progressive: Sen; onCompletion: Sen } {
  if (i.premiumPaid != null && i.priced > i.premiumPaid) return { first: i.premiumPaid, progressive: i.priced - i.premiumPaid, onCompletion: 0n };
  if (i.category === "FIRST") return { first: i.priced, progressive: 0n, onCompletion: 0n };
  if (i.category === "PROGRESSIVE") return { first: 0n, progressive: i.priced, onCompletion: 0n };
  return { first: 0n, progressive: 0n, onCompletion: i.priced };
}
