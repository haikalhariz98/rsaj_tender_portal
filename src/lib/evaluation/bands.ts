/**
 * Band sets (FR-EVL-010, 011, 012): a value — a capital ratio, a variance, a CPR percentage — placed in
 * the configured band whose edges hold it. Each edge is inclusive or not, or open; an edge may be the
 * stage's floor (a minimum capital's factor), which is known only for the bidder being judged. A value
 * no band holds is NOT_BANDED, never the nearest band (OD-5 A): the gap is the source's, and the
 * evaluator records a narrative. Overlapping bands are refused when the model is issued; a gap only
 * warns. Pure.
 */

import { compareFixed, FIXED_PLACES, type Fixed } from "./fixed";
import type { BandOutcome, Finding } from "./types";

export interface Band {
  labelEn: string;
  labelMs: string | null;
  lower: Fixed | null;
  lowerInclusive: boolean;
  lowerIsFloor: boolean;
  upper: Fixed | null;
  upperInclusive: boolean;
  upperIsFloor: boolean;
  outcome: BandOutcome;
  sortOrder: number;
}

export type BandPlacement =
  | { placed: true; band: Band }
  | { placed: false; reason: "NOT_BANDED" }
  /// An edge is the floor, and no floor was given (no factor chosen).
  | { placed: false; reason: "FLOOR_NOT_SET" };

const edge = (b: Band, side: "lower" | "upper", floor: Fixed | null): Fixed | null | "FLOOR_MISSING" => {
  if (side === "lower") return b.lowerIsFloor ? (floor ?? "FLOOR_MISSING") : b.lower;
  return b.upperIsFloor ? (floor ?? "FLOOR_MISSING") : b.upper;
};

/**
 * Whether a band holds the value; null when it cannot be told (its floor edge with no floor).
 * `floorCmp`: the value against the floor, judged exactly by the caller where the value is a rounded
 * ratio (a capital one sen below its minimum is below it, whatever four places of a percentage say).
 */
export function bandHolds(b: Band, v: Fixed, floor: Fixed | null = null, floorCmp?: -1 | 0 | 1): boolean | null {
  const lo = edge(b, "lower", floor);
  const hi = edge(b, "upper", floor);
  if (lo === "FLOOR_MISSING" || hi === "FLOOR_MISSING") return null;
  const cmp = (e: Fixed, isFloor: boolean) => (isFloor && floorCmp !== undefined ? floorCmp : compareFixed(v, e));
  if (lo != null) {
    const c = cmp(lo, b.lowerIsFloor);
    if (c < 0 || (c === 0 && !b.lowerInclusive)) return false;
  }
  if (hi != null) {
    const c = cmp(hi, b.upperIsFloor);
    if (c > 0 || (c === 0 && !b.upperInclusive)) return false;
  }
  return true;
}

/// The band that holds `v`, first by sort order; a floor edge reads `floor` (compared by `floorCmp` where given).
export function placeInBands(v: Fixed, bands: readonly Band[], floor: Fixed | null = null, floorCmp?: -1 | 0 | 1): BandPlacement {
  let unknown = false;
  for (const b of [...bands].sort((a, c) => a.sortOrder - c.sortOrder)) {
    const h = bandHolds(b, v, floor, floorCmp);
    if (h === true) return { placed: true, band: b };
    if (h === null) unknown = true;
  }
  return { placed: false, reason: unknown ? "FLOOR_NOT_SET" : "NOT_BANDED" };
}

export type BandSetFault = "BANDS_OVERLAP" | "BANDS_GAP" | "BANDS_EMPTY" | "BAND_EDGES_REVERSED";

type Interval = { lo: Fixed | null; loIn: boolean; hi: Fixed | null; hiIn: boolean; label: string };

/// Whether interval a ends before b starts (no shared point).
function endsBefore(a: Interval, b: Interval): boolean {
  if (a.hi == null || b.lo == null) return false;
  const c = compareFixed(a.hi, b.lo);
  return c < 0 || (c === 0 && !(a.hiIn && b.loIn));
}

/// Phase 0.3 item 14: the first point after `hi` a value can take once rounded to `places` (a value is banded as rounded, `bandedValue`).
function firstGridPointAfter(hi: Fixed, held: boolean, places: number): Fixed {
  const step = 10n ** BigInt(Math.max(0, FIXED_PLACES - places));
  const floor = hi >= 0n ? (hi / step) * step : -(((-hi + step - 1n) / step) * step);
  return held || floor !== hi ? floor + step : floor;
}

/**
 * Overlaps refuse the model's issue; a gap warns (OD-5 A). Judged on the numeric edges only: a band
 * with a floor edge moves with the factor chosen per bidder, so it is placed at judging time and left
 * out here. Ordered by their lower edges. Where the set rounds before banding (`roundPlaces`), a gap is
 * judged on the rounded grid: 79 to 80 with whole-number rounding holds every value (Phase 0.3 item 14).
 */
export function bandSetFaults(set: { code: string; nameEn: string; bands: readonly Band[]; roundPlaces?: number | null }): Finding<BandSetFault>[] {
  const out: Finding<BandSetFault>[] = [];
  if (set.bands.length === 0) return [{ code: "BANDS_EMPTY", level: "block", data: { set: set.nameEn } }];
  for (const b of set.bands) {
    if (b.lower != null && b.upper != null && compareFixed(b.lower, b.upper) > 0) out.push({ code: "BAND_EDGES_REVERSED", level: "block", data: { set: set.nameEn, band: b.labelEn } });
  }
  const iv: Interval[] = set.bands
    .filter((b) => !b.lowerIsFloor && !b.upperIsFloor)
    .map((b) => ({ lo: b.lower, loIn: b.lowerInclusive, hi: b.upper, hiIn: b.upperInclusive, label: b.labelEn }))
    .sort((a, b) => (a.lo == null ? -1 : b.lo == null ? 1 : compareFixed(a.lo, b.lo)));
  for (let i = 0; i < iv.length; i++) {
    for (let j = i + 1; j < iv.length; j++) {
      if (!endsBefore(iv[i], iv[j]) && !endsBefore(iv[j], iv[i])) out.push({ code: "BANDS_OVERLAP", level: "block", data: { set: set.nameEn, band: iv[i].label, other: iv[j].label } });
    }
  }
  for (let i = 0; i + 1 < iv.length; i++) {
    const a = iv[i];
    const b = iv[i + 1];
    if (a.hi == null || b.lo == null) continue;
    // On the rounded grid, the first value after a's top edge; else a's top edge itself, as the interval reads.
    const rounded = set.roundPlaces != null && set.roundPlaces >= 0 && set.roundPlaces <= FIXED_PLACES;
    const from = rounded ? firstGridPointAfter(a.hi, a.hiIn, set.roundPlaces!) : a.hi;
    const c = compareFixed(from, b.lo);
    // Touching at one point, held by at least one side, is no gap. On the grid, `from` is a value a does not hold.
    if (rounded ? c < 0 || (c === 0 && !b.loIn) : c < 0 || (c === 0 && !a.hiIn && !b.loIn)) out.push({ code: "BANDS_GAP", level: "warn", data: { set: set.nameEn, band: a.label, other: b.label } });
  }
  return out;
}
