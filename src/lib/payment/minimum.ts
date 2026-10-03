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
