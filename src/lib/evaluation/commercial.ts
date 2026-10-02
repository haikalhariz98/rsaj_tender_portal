/**
 * Variances (FR-EVL-004, 011, 018): each price against the disclosed company estimate and against the
 * lowest price in the running, in RM and as a percentage of the reference, at four places, signed. The
 * band is the configured set's, edges inclusive as set; a variance is shown, never gating, unless the
 * stage that holds it must be passed (spec note). Whether a price is reasonable is the evaluators'
 * judgement on aspect (b), the band only a guide (OD-6 A). Pure.
 */

import { ratioPct, type Fixed } from "./fixed";
import type { Sen } from "@/lib/money";

export interface Variance {
  /// The price less the reference, signed.
  difference: Sen;
  /// As a percentage of the reference; null with a reference of nothing.
  pct: Fixed | null;
}

/// 280,500.00 against 330,000.00: −49,500.00, −15.0000 %.
export function variance(price: Sen, reference: Sen): Variance {
  const difference = price - reference;
  return { difference, pct: ratioPct(difference, reference) };
}

/// The lowest of the prices; null with none.
export const lowestPrice = (prices: readonly Sen[]): Sen | null => (prices.length ? prices.reduce((a, b) => (b < a ? b : a)) : null);
