/**
 * Percentages of money, exactly, to six places (the Appendix's LAD rate is a Decimal(9,6),
 * "0.025" per cent a day). A percentage is read from its decimal string as whole
 * millionths of a per cent, so nothing passes through a float, and a figure is rounded
 * once, half up to the sen, at the point it is stated.
 */

import type { Sen } from "@/lib/money";

export class PercentError extends Error {}

const PLACES = 6;
const SCALE = 10n ** BigInt(PLACES);

/// A percentage string as millionths of a per cent: "0.025" → 25000n, "10" → 10000000n.
export function parsePct(pct: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(pct.trim());
  if (!m) throw new PercentError(`Not a percentage to six places: ${pct}`);
  return BigInt(m[1]) * SCALE + BigInt((m[2] ?? "").padEnd(PLACES, "0"));
}

/// Whether a string is a percentage the Appendix can hold (up to six places, not negative).
export function isPct(pct: string): boolean {
  try {
    parsePct(pct);
    return true;
  } catch {
    return false;
  }
}

/// `pct` per cent of `sen`, rounded half up to the sen. Money is never negative here.
export function pctOf(sen: Sen, pct: string): Sen {
  const n = sen * parsePct(pct);
  const d = 100n * SCALE;
  if (n < 0n) throw new PercentError("A negative amount has no percentage here.");
  return (n + d / 2n) / d;
}

/// A percentage as the screens print it: trailing zeros dropped, "0.025%".
export function formatPct(pct: string): string {
  const v = parsePct(pct);
  const whole = v / SCALE;
  const frac = (v % SCALE).toString().padStart(PLACES, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}
