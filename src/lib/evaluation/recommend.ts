/**
 * The recommendation (FR-EVL-004, 017, 018; OD-6 A). Formed once every stage is submitted, on a bidder
 * in the running after them all. The bidders are ranked by the composite where the model has one
 * (highest first, then the lower price), else by evaluated price (lowest first); a tie shares its rank.
 * Recommending another than the top-ranked needs its justification. Where the model assesses the
 * price against the estimate (aspect (b)), the recommended bidder's must be SATISFACTORY: the band is a
 * guide, the evaluators' verdict decides (OD-6 A). Pure.
 */

import type { Sen } from "@/lib/money";

import { recommendedCeilingFault, type CeilingSnapshot, type RecommendedCeilingFault } from "./ceiling";
import { evaluatedPrice, recommendedPriceOf, type BidderFacts, type EvaluationFacts } from "./facts";
import { compareFixed, type Fixed } from "./fixed";
import { finalRunning, isSubmitted, resultOf } from "./stages";
import type { Finding } from "./types";

export interface Ranked {
  bidder: BidderFacts;
  rank: number;
  /// The composite as shown, where the model has one.
  composite: Fixed | null;
  price: Sen;
}

/// The bidders in the running after every stage, ranked.
export function ranking(f: EvaluationFacts): Ranked[] {
  const comp = f.model.stages.find((s) => s.kind === "COMPOSITE") ?? null;
  const rows = finalRunning(f).map((b) => ({ bidder: b, composite: comp ? (resultOf(f, b.id, comp.code)?.shown ?? null) : null, price: evaluatedPrice(b) }));
  const cmp = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
    if (comp) {
      const c = compareFixed(b.composite ?? -1n, a.composite ?? -1n);
      if (c !== 0) return c;
    }
    return a.price < b.price ? -1 : a.price > b.price ? 1 : 0;
  };
  const sorted = [...rows].sort(cmp);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => cmp(x, r) === 0) + 1 }));
}

/// The stages not complete: a committee stage until every bidder's matter is decided, any other until submitted.
export function incompleteStages(f: EvaluationFacts): string[] {
  return f.model.stages
    .filter((s) => s.kind !== "RECOMMENDATION")
    .filter((s) => (s.kind === "COMMITTEE_DECISION" ? !f.bidders.every((b) => b.excludedReason || b.stageOne === "CARRIED" || b.stageOne === "NOT_CARRIED") : !isSubmitted(f, s.code)))
    .map((s) => s.labelEn);
}

export type RecommendFault = "STAGES_NOT_COMPLETE" | "NOT_IN_RUNNING" | "JUSTIFICATION_REQUIRED" | "PRICE_NOT_REASONABLE" | "PRICE_NOT_ASSESSED" | "ALREADY_FORMED" | "PERSON_REQUIRED" | "NEGOTIATION_OPEN" | "NEGOTIATION_PENDING" | RecommendedCeilingFault;

/**
 * `ceiling`: the exercise's frozen quotation ceiling (Q1), against which the price recommended at is
 * judged. Absent: not judged (fixtures from before Q1); every producer states it, held by a source scan.
 */
export function recommendationFaults(f: EvaluationFacts, i: { bidderId: string; justification: string; personActive: boolean; alreadyFormed: boolean; meetingsOpen: number; negotiationsPending: number; ceiling?: CeilingSnapshot }): { faults: Finding<RecommendFault>[]; topRanked: boolean } {
  const out: Finding<RecommendFault>[] = [];
  if (i.alreadyFormed) out.push({ code: "ALREADY_FORMED", level: "block" });
  for (const stage of incompleteStages(f)) out.push({ code: "STAGES_NOT_COMPLETE", level: "block", data: { stage } });
  if (i.meetingsOpen > 0) out.push({ code: "NEGOTIATION_OPEN", level: "block", data: { count: i.meetingsOpen } });
  // Formed while a negotiation is with approval, the negotiation could never be held once approved (BD-68-12).
  if (i.negotiationsPending > 0) out.push({ code: "NEGOTIATION_PENDING", level: "block", data: { count: i.negotiationsPending } });
  const ranked = ranking(f);
  const r = ranked.find((x) => x.bidder.id === i.bidderId) ?? null;
  const topRanked = r?.rank === 1;
  if (!r) out.push({ code: "NOT_IN_RUNNING", level: "block" });
  else if (!topRanked && !i.justification.trim()) out.push({ code: "JUSTIFICATION_REQUIRED", level: "block", data: { rank: r.rank } });
  // OD-6 A: where aspect (b) is assessed, the verdict decides; the band is a guide.
  const b = f.model.aspects.find((a) => a.kind === "PRICE_VS_ESTIMATE" && a.required);
  if (b && r) {
    const v = r.bidder.aspects.get(b.code);
    if (!v) out.push({ code: "PRICE_NOT_ASSESSED", level: "block", data: { aspect: b.labelEn } });
    else if (v.verdict !== "SATISFACTORY") out.push({ code: "PRICE_NOT_REASONABLE", level: "block", data: { aspect: b.labelEn } });
  }
  // Q1: the price recommended at — after negotiation where negotiated — within the quotation's ceiling.
  if (r && i.ceiling) {
    const c = recommendedCeilingFault(recommendedPriceOf(r.bidder), i.ceiling);
    if (c) out.push(c);
  }
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return { faults: out, topRanked };
}

/// What a recommendation records of its bidder: the price after negotiation where negotiated, the period as read.
export const recommendationOf = (b: BidderFacts) => ({ price: recommendedPriceOf(b), period: b.period });
