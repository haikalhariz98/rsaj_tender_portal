/**
 * A variation's percentage (6.13 Part A step 4: §8.7, FR-VAR-003, 011, 012, 024; OD-A2, OD-A3 as ruled; ADR 0024).
 *
 *   base         = the original contract sum (ORIGINAL), or it plus every issued adjustment of the contract sum (REVISED)
 *   numerator    = this approval's value (THIS_VARIATION), or every other approved variation's value plus it (CUMULATIVE)
 *   percentage   = numerator ÷ base, kept as the exact ratio of the two amounts in sen, never a float
 *
 * Which basis and which base are the organisation's settings (OD-A2): shipped unset, and unset refuses, naming the
 * setting (never a default). The base is also the contract value the matrix's contract-value band is read at. The
 * ratio is judged exactly against the matrix's band edges (`inPercentBandExact` through the engine's exact path);
 * the figure shown is rounded to two places, half up, for display only, and where that rounded figure equals a band
 * edge the exact ratio is not on, it reads "more than 10.00%" or "less than 10.00%" (OD-A3 A), so a sen above an
 * edge reads as above it. The basis applies to a variation's value approvals (prior approval and an increase); the
 * use of agreed rates and a re-measurement are read on their own value over the base (BD-613-55). Pure.
 */

import type { Sen } from "@/lib/money";
import { comparePercent, onPercent, ratioPercentText, type ExactRatio } from "@/lib/percent-band";
import { parsePercent } from "@/lib/securities/money";

import type { Finding, VariationBase, VariationEvent, VariationPctBasis } from "./types";

export interface ReadingInput {
  basis: VariationPctBasis | null;
  base: VariationBase | null;
  /// The pinned baseline's contract sum.
  original: Sen;
  /// The net of each issued adjustment of the contract sum (FR-PAD-003: only issued ones).
  adjustments: readonly Sen[];
  /// Every other approved variation's value (FR-VAR-024), for the cumulative basis.
  cumulativeApproved: Sen;
  /// The event this reading is for, and its value (above nothing).
  event: VariationEvent;
  value: Sen;
  /// What this variation has approved already (its prior approval and any increase), for an increase.
  approvedSoFar?: Sen;
}

/// What a route is resolved on and what the screens print, frozen with the route when it is sent.
export interface Reading {
  basis: VariationPctBasis;
  base: VariationBase;
  /// The base amount (the contract value the band is read at).
  baseAmount: string;
  /// The ratio's two amounts, in sen as decimal strings (a snapshot is decimal strings, never a float).
  num: string;
  den: string;
  /// Whether the numerator carried the cumulative (the basis, applied to a value approval).
  cumulative: boolean;
  cumulativeApproved: string;
  value: string;
}

export type ReadingResult = { ok: true; reading: Reading; ratio: ExactRatio } | { ok: false; faults: Finding[] };

const str = (v: Sen) => v.toString();

/// Whether the basis applies to this event (a value approval) or its own value is read over the base.
export const basisApplies = (e: VariationEvent): boolean => e === "PRIOR" || e === "INCREASE";

export function variationReading(i: ReadingInput): ReadingResult {
  const faults: Finding[] = [];
  if (i.basis == null) faults.push({ code: "VARIATION_BASIS_NOT_SET", level: "block" });
  if (i.base == null) faults.push({ code: "VARIATION_BASE_NOT_SET", level: "block" });
  if (i.value <= 0n) faults.push({ code: "VARIATION_VALUE_NOT_POSITIVE", level: "block", data: { value: str(i.value) } });
  if (faults.length) return { ok: false, faults };
  const den = i.base === "ORIGINAL" ? i.original : i.adjustments.reduce((a, x) => a + x, i.original);
  if (den <= 0n) return { ok: false, faults: [{ code: "VARIATION_BASE_NOT_POSITIVE", level: "block", data: { base: str(den) } }] };
  const own = i.event === "INCREASE" ? (i.approvedSoFar ?? 0n) + i.value : i.value;
  const cumulative = basisApplies(i.event) && i.basis === "CUMULATIVE";
  const num = cumulative ? i.cumulativeApproved + own : own;
  return {
    ok: true,
    ratio: { num, den },
    reading: { basis: i.basis!, base: i.base!, baseAmount: str(den), num: str(num), den: str(den), cumulative, cumulativeApproved: str(i.cumulativeApproved), value: str(i.value) },
  };
}

/// The frozen reading's ratio, read back.
export const ratioOf = (r: Pick<Reading, "num" | "den">): ExactRatio => ({ num: BigInt(r.num), den: BigInt(r.den) });

export interface PercentLabel {
  /// The figure to two places, half up (display only).
  figure: string;
  /// Where the rounded figure equals an edge the exact ratio is not on: which side of it the ratio is.
  side: "ABOVE" | "BELOW" | null;
  edge: string | null;
}

/**
 * OD-A3 A: the percentage as shown. Two places, half up; where that figure equals one of the band edges given but the
 * exact ratio is not on the edge, it says which side it is on ("more than 10.00%").
 */
export function percentLabel(r: ExactRatio, edges: readonly (string | null)[]): PercentLabel {
  const figure = ratioPercentText(r, 2);
  for (const e of edges) {
    if (e == null) continue;
    if (parsePercent(figure) !== parsePercent(e)) continue;
    if (onPercent(r, e)) return { figure, side: null, edge: e };
    return { figure, side: comparePercent(r, e) > 0 ? "ABOVE" : "BELOW", edge: e };
  }
  return { figure, side: null, edge: null };
}

/// The label's words, English and Malay.
export function percentLabelText(l: PercentLabel): { en: string; ms: string } {
  if (l.side === "ABOVE") return { en: `more than ${l.figure}%`, ms: `lebih daripada ${l.figure}%` };
  if (l.side === "BELOW") return { en: `less than ${l.figure}%`, ms: `kurang daripada ${l.figure}%` };
  return { en: `${l.figure}%`, ms: `${l.figure}%` };
}
