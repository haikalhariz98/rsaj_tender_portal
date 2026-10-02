/**
 * Percentage bands judged on exact ratios (ADR 0024).
 *
 * A percentage that decides a route or a target ("2 weeks up to 20%, 6 weeks above") is a ratio of two
 * amounts of money: a variation's sum over the contract sum. Read as a float it can land on the wrong
 * side of an edge (20,010.00 / 100,000.00 is not 20.01 in binary), and rounded to two places first it
 * puts 20.004% inside a band that ends at 20%. So the ratio is kept as its two amounts, in sen, and a
 * band edge as its Decimal(9,4) string, and the comparison is done in integers: `num / den` against
 * `edge / 100` is `num × 1,000,000` against `edge in ten-thousandths × den`.
 *
 * Which band an edge value falls in is not assumed. The caller passes the side configured for it
 * (`upperInclusive`): true reads a band as (min, max], false as [min, max). With the side not decided, a
 * value exactly on an edge has no band (`bandFor` says EDGE_UNDECIDED), and every other value still has one.
 *
 * Pure: no clock, no I/O, no floats.
 */

import type { Sen } from "@/lib/money";
import { parsePercent } from "@/lib/securities/money";

/// A ratio of two amounts of money, exactly. `den` is above zero.
export interface ExactRatio {
  num: Sen;
  den: Sen;
}

export class RatioError extends Error {}

const TEN_THOUSANDTHS_PER_UNIT = 1_000_000n; // 100 (per cent) × 10,000 (ten-thousandths of a per cent)

/// A ratio's sign against a percentage given as its decimal string: −1 below, 0 exactly on it, 1 above.
export function comparePercent(r: ExactRatio, pct: string): -1 | 0 | 1 {
  if (r.den <= 0n) throw new RatioError("A ratio's denominator must be above zero.");
  const lhs = r.num * TEN_THOUSANDTHS_PER_UNIT;
  const rhs = parsePercent(pct) * r.den;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/// Whether the ratio is exactly on a percentage.
export const onPercent = (r: ExactRatio, pct: string): boolean => comparePercent(r, pct) === 0;

/**
 * Whether the ratio is inside a band. Null edges are open. `upperInclusive` true: (min, max]; false:
 * [min, max).
 */
export function inPercentBandExact(r: ExactRatio, min: string | null, max: string | null, upperInclusive: boolean): boolean {
  if (min != null) {
    const c = comparePercent(r, min);
    if (c < 0 || (c === 0 && upperInclusive)) return false;
  }
  if (max != null) {
    const c = comparePercent(r, max);
    if (c > 0 || (c === 0 && !upperInclusive)) return false;
  }
  return true;
}

export type BandResult<B> = { state: "IN"; band: B } | { state: "NONE" } | { state: "EDGE_UNDECIDED"; edge: string } | { state: "OVERLAP"; bands: B[] };

/**
 * The band a ratio falls in. With `upperInclusive` null (not decided), a ratio exactly on any band's edge
 * has no band (EDGE_UNDECIDED), naming the edge; otherwise the bands that contain it under the side
 * given: one (IN), none (NONE) or more than one (OVERLAP, a configuration fault, never resolved by order).
 */
export function bandFor<B extends { pctMin: string | null; pctMax: string | null }>(r: ExactRatio, bands: readonly B[], upperInclusive: boolean | null): BandResult<B> {
  if (upperInclusive == null) {
    for (const b of bands) for (const e of [b.pctMin, b.pctMax]) if (e != null && onPercent(r, e)) return { state: "EDGE_UNDECIDED", edge: e };
    // Off every edge, either reading gives the same band.
    upperInclusive = true;
  }
  const hits = bands.filter((b) => inPercentBandExact(r, b.pctMin, b.pctMax, upperInclusive!));
  if (hits.length === 0) return { state: "NONE" };
  if (hits.length > 1) return { state: "OVERLAP", bands: hits };
  return { state: "IN", band: hits[0] };
}

/// The ratio as a percentage to `places` decimals, rounded half up, for display only (never judged).
export function ratioPercentText(r: ExactRatio, places = 2): string {
  if (r.den <= 0n) throw new RatioError("A ratio's denominator must be above zero.");
  const scale = 10n ** BigInt(places);
  const n = r.num * 100n * scale;
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const q = (abs * 2n + r.den) / (2n * r.den);
  const whole = q / scale;
  const frac = (q % scale).toString().padStart(places, "0");
  return `${neg ? "-" : ""}${whole}${places > 0 ? `.${frac}` : ""}`;
}
