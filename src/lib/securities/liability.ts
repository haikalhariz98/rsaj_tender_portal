/**
 * The public-liability limit by contract price (FR-AWD-013, §8.10).
 *
 * Bands are (min, max]: above the lower figure, up to and including the upper. The
 * printed seven-band table leaves sen gaps between its whole-ringgit edges ("up to
 * RM25,000", "RM25,001 to RM50,000"); transcribed faithfully, a price in a gap falls in
 * no band and is refused, never placed (6.11 ruling). Which band holds RM25,000.50 is
 * a question for the customer. The band set is checked for gaps and overlaps.
 */

import type { Sen } from "@/lib/money";

export interface LiabilityBand {
  code: string;
  minValue: Sen | null;
  maxValue: Sen | null;
  limit: Sen;
  retiredOn?: Date | null;
}

export type LimitResult =
  | { state: "SET"; limit: Sen; band: LiabilityBand }
  | { state: "NOT_SET" }
  | { state: "NO_BAND" }
  | { state: "AMBIGUOUS"; bands: string[] };

const live = (bands: readonly LiabilityBand[], on?: Date) => bands.filter((b) => b.retiredOn == null || (on != null && b.retiredOn > on));

export function inLiabilityBand(price: Sen, b: Pick<LiabilityBand, "minValue" | "maxValue">): boolean {
  return (b.minValue == null || price > b.minValue) && (b.maxValue == null || price <= b.maxValue);
}

export function liabilityLimit(bands: readonly LiabilityBand[], price: Sen, on?: Date): LimitResult {
  const set = live(bands, on);
  if (set.length === 0) return { state: "NOT_SET" };
  const hits = set.filter((b) => inLiabilityBand(price, b));
  if (hits.length === 0) return { state: "NO_BAND" };
  if (hits.length > 1) return { state: "AMBIGUOUS", bands: hits.map((b) => b.code) };
  return { state: "SET", limit: hits[0].limit, band: hits[0] };
}

export type BandSetFault =
  | { kind: "GAP"; after: Sen | null; before: Sen }
  | { kind: "OVERLAP"; a: string; b: string }
  | { kind: "OPEN_TOP"; above: Sen };

/**
 * Where the band set leaves prices with no band, or gives one price two. A gap is the
 * prices above `after` and up to and including `before`'s lower edge; `after` null is
 * a set that does not start at nothing.
 */
export function bandSetFaults(bands: readonly LiabilityBand[], on?: Date): BandSetFault[] {
  const set = [...live(bands, on)].sort((x, y) => (x.minValue == null ? -1 : y.minValue == null ? 1 : x.minValue < y.minValue ? -1 : x.minValue > y.minValue ? 1 : 0));
  if (set.length === 0) return [];
  const out: BandSetFault[] = [];
  if (set[0].minValue != null && set[0].minValue > 0n) out.push({ kind: "GAP", after: null, before: set[0].minValue });
  for (let i = 1; i < set.length; i++) {
    const a = set[i - 1];
    const b = set[i];
    if (a.maxValue == null || b.minValue == null || b.minValue < a.maxValue) out.push({ kind: "OVERLAP", a: a.code, b: b.code });
    else if (b.minValue > a.maxValue) out.push({ kind: "GAP", after: a.maxValue, before: b.minValue });
  }
  const top = set[set.length - 1];
  if (top.maxValue != null) out.push({ kind: "OPEN_TOP", above: top.maxValue });
  return out;
}

export type LimitFault = "LOWERED" | "JUSTIFICATION_REQUIRED";

/// A limit may be raised above the derived one for unusual risk, with a justification;
/// never lowered below it.
export function limitFault(derived: Sen, chosen: Sen, justification: string): LimitFault | null {
  if (chosen < derived) return "LOWERED";
  if (chosen > derived && !justification.trim()) return "JUSTIFICATION_REQUIRED";
  return null;
}
