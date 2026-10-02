/**
 * Scores, weights and percentages as fixed point: a bigint of ten-thousandths (four decimal places,
 * the `Decimal(9, 4)` columns), parsed from decimal strings, never a JavaScript number (`0.1 + 0.2`).
 * Every division rounds half up — a half goes away from zero, so a negative variance rounds as its
 * positive twin does — once, at four places; a figure is rounded to the organisation's places only
 * where it is shown and judged (E-5), and a composite is formed from the unrounded stage figures.
 * Money stays in sen (`src/lib/money.ts`); where a ratio of two amounts is wanted it is taken here,
 * straight from the two bigints. Pure.
 */

import type { Sen } from "@/lib/money";

/// Ten-thousandths: 85.01 is 850100n.
export type Fixed = bigint;
export const FIXED_PLACES = 4;
const SCALE = 10_000n;

export class FixedFormatError extends Error {}

/**
 * A decimal string to fixed point: an optional minus, digits, and at most four places. Anything else
 * is refused rather than rounded, as `parseSen` refuses a third place: a figure nobody typed must not
 * reach a score.
 */
export function parseFixed(value: string): Fixed {
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!m) throw new FixedFormatError(`Not a figure to four places: ${value}`);
  const [, sign, whole, frac = ""] = m;
  const v = BigInt(whole) * SCALE + BigInt(frac.padEnd(4, "0"));
  return sign === "-" ? -v : v;
}

/// Whether a string parses (forms check before they parse).
export const isFixed = (value: string) => /^-?\d+(?:\.\d{1,4})?$/.test(value.trim());

/// A stored `Decimal(9, 4)` (Prisma renders it as a plain decimal string) to fixed point; null stays null.
export const fixedOf = (v: { toString(): string } | null | undefined): Fixed | null => (v == null ? null : parseFixed(v.toString()));

/// A whole number to fixed point.
export const fixedFromWhole = (n: number | bigint): Fixed => BigInt(n) * SCALE;

/// Divide, rounding half away from zero.
export function divRound(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError("Division by zero");
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (2n * ad);
  return neg ? -q : q;
}

/// Rounded half up to `dp` places (0–4), still in ten-thousandths: 2.345 → 2.35 at two places.
export function roundHalfUp(v: Fixed, dp: number): Fixed {
  if (!Number.isInteger(dp) || dp < 0 || dp > FIXED_PLACES) throw new RangeError(`Places must be 0 to ${FIXED_PLACES}`);
  const step = 10n ** BigInt(FIXED_PLACES - dp);
  return divRound(v, step) * step;
}

/// The sum, exactly: 0.1 + 0.2 = 0.3.
export const sumFixed = (...vs: readonly Fixed[]): Fixed => vs.reduce((a, b) => a + b, 0n);

/// `v` × `pct` %, at four places half up: 80.35 × 60 % = 48.2100.
export const mulPct = (v: Fixed, pct: Fixed): Fixed => divRound(v * pct, 100n * SCALE);

/// `part` as a percentage of `whole`, at four places half up; both in the same unit (sen, or fixed). Null where `whole` is zero.
export const ratioPct = (part: bigint, whole: bigint): Fixed | null => (whole === 0n ? null : divRound(part * 100n * SCALE, whole));

/// An amount × `pct` %, to the sen, half up: 10 % of 1,077,508.60 = 107,750.86.
export const senTimesPct = (sen: Sen, pct: Fixed): Sen => divRound(sen * pct, 100n * SCALE);

export const compareFixed = (a: Fixed, b: Fixed): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);

/// For display and storage: exactly `dp` places, rounded half up first. "-15.0000" at four.
export function formatFixed(v: Fixed, dp: number = FIXED_PLACES): string {
  const r = roundHalfUp(v, dp);
  const neg = r < 0n;
  const a = neg ? -r : r;
  const whole = a / SCALE;
  const frac = (a % SCALE).toString().padStart(4, "0").slice(0, dp);
  return `${neg ? "-" : ""}${whole}${dp > 0 ? `.${frac}` : ""}`;
}

/// The four-place string a `Decimal(9, 4)` column is written with.
export const fixedToDecimalString = (v: Fixed) => formatFixed(v, FIXED_PLACES);

/// A percentage for a screen: signed where asked ("+6.9519%", "−15.0000%"), to `dp` places.
export function pctText(v: Fixed, dp: number = FIXED_PLACES, signed = false): string {
  const r = roundHalfUp(v, dp);
  const s = formatFixed(r, dp);
  if (!signed) return `${s}%`;
  return r > 0n ? `+${s}%` : r < 0n ? `−${s.slice(1)}%` : `${s}%`;
}
