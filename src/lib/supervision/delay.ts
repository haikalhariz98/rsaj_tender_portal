/**
 * Project In Delay (FR-SUP-010), derived, never stored. A contract is In Delay where:
 * - its date for completion has lapsed with site work incomplete (the latest recorded progress below 100%), or
 * - its latest recorded actual progress is below the customer's percentage (`PostAwardPolicy.inDelayProgressPct`,
 *   SK005's 70%, never shipped) of the approved programme's planned progress on that day.
 * Exactly on the line is not below it: 60.9% against a planned 87% at 70% is 60.9 = 0.7 × 87, not In Delay;
 * 60.8% is. Compared exactly in integers (ten-thousandths, the planned figure a fraction).
 *
 * Unset policy is NOT_SET (never 0%, never "on track"); no approved programme, no progress recorded, or a day
 * before the programme's first point is NOT_JUDGED, saying which. The lapsed reading needs no policy. Pure.
 */

import { parsePercent } from "@/lib/securities/money";

import { plannedOn, type PointIn } from "./programme";
import type { Day } from "./types";

export type DelayReading =
  | { state: "IN_DELAY"; why: "LAPSED"; dateForCompletion: Day; actualPct: string | null }
  | { state: "IN_DELAY"; why: "BEHIND"; day: Day; actualPct: string; plannedPct: string; policyPct: string }
  | { state: "ON_TRACK"; day: Day; actualPct: string; plannedPct: string; policyPct: string }
  | { state: "NOT_SET" }
  | { state: "NOT_JUDGED"; why: "NOT_POSSESSED" | "NO_PROGRAMME" | "NO_PROGRESS" | "BEFORE_PROGRAMME" };

/// A fraction of ten-thousandths of a percent, as a decimal string to four places (display only).
function fractionText(num: bigint, den: bigint): string {
  const q = (num * 2n + den) / (2n * den); // half up, ten-thousandths
  const whole = q / 10_000n;
  const frac = (q % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function inDelay(i: {
  today: Day;
  possessed: boolean;
  dateForCompletion: Day | null;
  /// The approved programme in force, its points; null: none approved.
  programme: readonly PointIn[] | null;
  /// The latest progress recorded on or before today; null: none.
  latest: { day: Day; actualPct: string } | null;
  policyPct: string | null;
}): DelayReading {
  if (!i.possessed) return { state: "NOT_JUDGED", why: "NOT_POSSESSED" };
  const incomplete = !i.latest || parsePercent(i.latest.actualPct) < 100_0000n;
  if (i.dateForCompletion && i.today > i.dateForCompletion && incomplete) return { state: "IN_DELAY", why: "LAPSED", dateForCompletion: i.dateForCompletion, actualPct: i.latest?.actualPct ?? null };
  if (i.policyPct == null) return { state: "NOT_SET" };
  if (!i.programme) return { state: "NOT_JUDGED", why: "NO_PROGRAMME" };
  if (!i.latest) return { state: "NOT_JUDGED", why: "NO_PROGRESS" };
  const planned = plannedOn(i.programme, i.latest.day);
  if (!planned) return { state: "NOT_JUDGED", why: "BEFORE_PROGRAMME" };
  // actual < policy% × planned  ⇔  actual × 100 × den < policy × planned.num  (all in ten-thousandths)
  const actual = parsePercent(i.latest.actualPct);
  const policy = parsePercent(i.policyPct);
  const behind = actual * 1_000_000n * planned.den < policy * planned.num;
  const reading = { day: i.latest.day, actualPct: i.latest.actualPct, plannedPct: fractionText(planned.num, planned.den), policyPct: i.policyPct };
  return behind ? { state: "IN_DELAY", why: "BEHIND", ...reading } : { state: "ON_TRACK", ...reading };
}

export const isInDelay = (r: DelayReading): boolean => r.state === "IN_DELAY";

/// The ids whose reading is In Delay (review 14: the Projects list's view over the whole set).
export const inDelayIds = (readings: ReadonlyMap<string, DelayReading>): string[] => [...readings].filter(([, r]) => r.state === "IN_DELAY").map(([id]) => id);
