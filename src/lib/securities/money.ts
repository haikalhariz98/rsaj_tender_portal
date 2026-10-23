/**
 * Percentages of money, exactly.
 *
 * A percentage arrives as its Decimal(9,4) string ("5", "5.0000", "12.5") and is read
 * as whole ten-thousandths, so a bond or a retention figure never passes through a
 * float. Rounded half up to the sen: the one percentage-of-money rule.
 */

import type { Sen } from "@/lib/money";

export class PercentFormatError extends Error {}

/// A percentage string as ten-thousandths of a percent: "5" → 50000n.
export function parsePercent(pct: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(pct.trim());
  if (!m) throw new PercentFormatError(`Not a percentage: ${pct}`);
  return BigInt(m[1]) * 10_000n + BigInt((m[2] ?? "").padEnd(4, "0"));
}

/// Whether a percentage string is a percentage above nothing ("0", "0.0000" are not),
/// read exactly. The one rule for "a bond of 0% is no bond" (BD-28).
export function percentAboveZero(pct: string | null): boolean {
  if (pct == null) return false;
  try {
    return parsePercent(pct) > 0n;
  } catch {
    return false;
  }
}

/// `pct` per cent of `sen`, rounded half up to the sen.
export function pctOfSen(sen: Sen, pct: string): Sen {
  const n = sen * parsePercent(pct);
  const d = 1_000_000n;
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const r = (abs + d / 2n) / d;
  return neg ? -r : r;
}

/// A ratio of money, rounded half up: `sen × num ÷ den`.
export function ratioOfSen(sen: Sen, num: bigint, den: bigint): Sen {
  const n = sen * num;
  return (n + den / 2n) / den;
}
