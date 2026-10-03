/**
 * The interim certificate's minimum (6.13 Part A step 3: FR-PAY-013; §8.3).
 *
 * The first certificate is withheld until the value of work executed and materials delivered (the gross value to
 * date) reaches the first minimum; a later one until the amount it carries forward (gross less retention and what
 * was certified before) reaches the subsequent minimum (an assumed reading of "the minimum amount of an interim
 * certificate": the sources state no measure, BD-613-29). Both minimums are read from the certificate's pinned
 * baseline (the first computed once by 6.12 as the lesser of the policy's floor and percentage of the builders'
 * works value), never recomputed here. Unset reads NOT_SET and refuses; below the minimum the valuation is held to
 * the next cycle, which is an exit, not a dead end (B4). Exactly the minimum passes. Pure.
 */

import type { Sen } from "@/lib/money";

import type { Finding } from "./types";

export type MinimumReading =
  | { state: "MET"; minimum: Sen; value: Sen; first: boolean }
  | { state: "BELOW"; minimum: Sen; value: Sen; first: boolean }
  | { state: "NOT_SET"; field: "firstInterimMinimum" | "subsequentInterimMinimum" };

export function minimumReading(i: { first: boolean; firstMinimum: Sen | null; subsequentMinimum: Sen | null; gross: Sen; carryForward: Sen }): MinimumReading {
  const minimum = i.first ? i.firstMinimum : i.subsequentMinimum;
  if (minimum == null) return { state: "NOT_SET", field: i.first ? "firstInterimMinimum" : "subsequentInterimMinimum" };
  const value = i.first ? i.gross : i.carryForward;
  return value >= minimum ? { state: "MET", minimum, value, first: i.first } : { state: "BELOW", minimum, value, first: i.first };
}

export function minimumFaults(r: MinimumReading): Finding[] {
  if (r.state === "NOT_SET") return [{ code: "MINIMUM_NOT_SET", level: "block", data: { field: r.field } }];
  if (r.state === "BELOW") return [{ code: "BELOW_MINIMUM", level: "block", data: { minimum: r.minimum.toString(), value: r.value.toString(), first: r.first ? "yes" : "no" } }];
  return [];
}

/// BD-613-29 (approved with condition): which measure the minimum is judged on, said with the certificate and on
/// Configuration › Post-award, as an assumed reading (the sources state no measure).
export const MINIMUM_MEASURE_WORDS = {
  first: { en: "the first interim certificate is judged on its gross value to date", ms: "perakuan interim pertama dinilai pada nilai kasar setakat ini" },
  subsequent: { en: "a later one on the amount it carries forward", ms: "perakuan berikutnya pada amaun yang dibawa ke hadapan" },
  assumed: { en: "an assumed reading: the sources state no measure", ms: "bacaan andaian: sumber tidak menyatakan ukuran" },
} as const;

/// The line the certificate carries: which minimum, on which measure, and that the measure is assumed.
export function minimumMeasureText(first: boolean, minimum: Sen | null, fmt: (v: Sen) => string): { en: string; ms: string } {
  const w = MINIMUM_MEASURE_WORDS;
  const amount = minimum == null ? "not set" : fmt(minimum);
  return first
    ? { en: `Minimum ${amount}: ${w.first.en} (${w.assumed.en}).`, ms: `Minimum ${amount}: ${w.first.ms} (${w.assumed.ms}).` }
    : { en: `Minimum ${amount}: ${w.subsequent.en.replace(/^a later one/, "a later interim certificate is judged")} (${w.assumed.en}).`, ms: `Minimum ${amount}: ${w.subsequent.ms} (${w.assumed.ms}).` };
}
