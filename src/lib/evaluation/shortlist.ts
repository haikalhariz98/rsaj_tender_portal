/**
 * The shortlist (FR-EVL-009): which bidders in the running go on, under the stage's rule. COUNT_RANGE:
 * the officer chooses between the configured minimum and maximum (the fixture: three to four), with
 * every eligible bidder taken where fewer than the minimum are eligible (flagged, never padded);
 * DECIDED_BY_OFFICE: the holder of the configured office on the day decides, within the range where one
 * is set; NONE: every eligible bidder goes on. The bidders are ranked by evaluated price, lowest first,
 * a tie sharing its rank; leaving out one of two tied bidders at the cut is said, not refused. Pure.
 */

import type { Sen } from "@/lib/money";

import type { Finding, ShortlistRule } from "./types";

export type ShortlistFault = "TOO_FEW" | "TOO_MANY" | "NOT_ELIGIBLE" | "FEWER_THAN_MINIMUM" | "NOT_OFFICE_HOLDER" | "OFFICE_NOT_SET" | "RULE_NOT_SET" | "RANGE_NOT_SET" | "TIE_SPLIT" | "NONE_TAKES_ALL";

/// Rank by price, lowest first; a tie shares its rank (1, 2, 2, 4).
export function rankByPrice<T extends { id: string; price: Sen }>(xs: readonly T[]): (T & { rank: number })[] {
  const sorted = [...xs].sort((a, b) => (a.price < b.price ? -1 : a.price > b.price ? 1 : 0));
  return sorted.map((x) => ({ ...x, rank: sorted.findIndex((y) => y.price === x.price) + 1 }));
}

export function shortlistFaults(i: {
  rule: ShortlistRule | null;
  min: number | null;
  max: number | null;
  officeCode: string | null;
  eligible: readonly { id: string; price: Sen }[];
  chosen: readonly string[];
  /// DECIDED_BY_OFFICE: whether the person recording it holds the office on the day.
  deciderHoldsOffice?: boolean;
}): Finding<ShortlistFault>[] {
  const out: Finding<ShortlistFault>[] = [];
  const f = (code: ShortlistFault, data?: Finding["data"], level: "block" | "warn" = "block") => out.push({ code, level, ...(data ? { data } : {}) });
  if (i.rule == null) return [{ code: "RULE_NOT_SET", level: "block" }];
  const eligible = new Set(i.eligible.map((e) => e.id));
  const chosen = new Set(i.chosen);
  for (const c of chosen) if (!eligible.has(c)) f("NOT_ELIGIBLE");
  if (i.rule === "NONE") {
    if (chosen.size !== eligible.size || [...eligible].some((e) => !chosen.has(e))) f("NONE_TAKES_ALL");
    return out;
  }
  if (i.rule === "DECIDED_BY_OFFICE") {
    if (!i.officeCode) f("OFFICE_NOT_SET");
    else if (!i.deciderHoldsOffice) f("NOT_OFFICE_HOLDER");
  }
  if (i.rule === "COUNT_RANGE" && (i.min == null || i.max == null)) f("RANGE_NOT_SET");
  const n = [...chosen].filter((c) => eligible.has(c)).length;
  if (i.min != null && eligible.size < i.min) {
    // Fewer eligible than the minimum: all of them, flagged.
    f("FEWER_THAN_MINIMUM", { eligible: eligible.size, min: i.min }, "warn");
    if (n !== eligible.size) f("TOO_FEW", { min: eligible.size });
  } else {
    if (i.min != null && n < i.min) f("TOO_FEW", { min: i.min });
    if (i.max != null && n > i.max) f("TOO_MANY", { max: i.max });
  }
  // A tie split at the cut is said, not refused.
  const ranked = rankByPrice(i.eligible);
  for (const x of ranked) if (chosen.has(x.id) && ranked.some((y) => y.rank === x.rank && !chosen.has(y.id))) {
    f("TIE_SPLIT", { rank: x.rank }, "warn");
    break;
  }
  return out;
}
