/**
 * The award after the evaluation (E-9, OD-8 A; X-9 in sequence: it tightens 6.7's gate). For an
 * exercise published through 6.5 with a tender or quotation pack, an award is opened, sent and issued
 * only once the exercise is Evaluated: its report issued and still standing (its bidders are 6.7's
 * carried offers now), and the awardee is the recommended tenderer, compared as parties, never by text
 * (another tenderer is a committee's NOT_CARRIED and a new version, never an award that differs). The
 * awarded value and period are pre-filled from the recommendation and may differ, each with its
 * reason, shown "differs from the recommendation" (the Board may approve a negotiated sum). An
 * exercise published before evaluation models existed can never be evaluated (E-1): its award is
 * refused, naming cancel and replace. Every applied validity extension stands on the recommended
 * tenderer's consent (FR-BID-010; 6.8 fix M-1), else the award is held. Exercises with no window
 * (Phase 1) are untouched. Pure.
 */

import { formatMoney, type Sen } from "@/lib/money";

import { ceilingExclusion, type CeilingSnapshot } from "./ceiling";
import type { Finding, PeriodUnit } from "./types";

export interface EvaluationGateFacts {
  /// Published through 6.5 with a tender or quotation pack (the openings' `applies`).
  applies: boolean;
  /// The exercise carries a pinned model (E-1).
  pinned: boolean;
  exerciseStatus: string;
  /// The version in force, issued, or null where none is issued.
  issued: {
    stale: boolean;
    recommendedPartyId: string;
    price: Sen;
    period: { value: number; unit: PeriodUnit } | null;
    /// 6.8 fix M-1 (FR-BID-010, 6.6 OD-7): each applied validity extension whose consent is not the
    /// recommended tenderer's, by the consenting party's name and the day it extends to. Absent: not read.
    consentNotFromRecommended?: readonly { party: string; day: string }[];
    /// Phase 2 close-out 68-C3 (6.8 Q1's rule): the exercise's quotation ceiling as frozen on it
    /// (`ceilingOf`). An awarded value that differs from the recommendation is judged against it.
    /// Absent: not read (the one producer, `loadEvaluationGate`, always states it).
    ceiling?: CeilingSnapshot;
  } | null;
}

export type EvaluationGateFault = "NEVER_EVALUATED" | "NOT_EVALUATED" | "REPORT_STALE" | "AWARDEE_NOT_RECOMMENDED" | "CONSENT_NOT_FROM_RECOMMENDED";

/// `awardeePartyId` undefined: the award is not yet named (opening one asks the rest).
export function evaluationGateFaults(g: EvaluationGateFacts, awardeePartyId?: string | null): Finding<EvaluationGateFault>[] {
  if (!g.applies) return [];
  if (!g.pinned) return [{ code: "NEVER_EVALUATED", level: "block" }];
  if (g.exerciseStatus !== "EVALUATED" || !g.issued) return [{ code: "NOT_EVALUATED", level: "block" }];
  const out: Finding<EvaluationGateFault>[] = [];
  if (g.issued.stale) out.push({ code: "REPORT_STALE", level: "block" });
  if (awardeePartyId !== undefined && awardeePartyId !== g.issued.recommendedPartyId) out.push({ code: "AWARDEE_NOT_RECOMMENDED", level: "block" });
  // M-1: no award stands on a validity the recommended tenderer did not consent to.
  for (const c of g.issued.consentNotFromRecommended ?? []) out.push({ code: "CONSENT_NOT_FROM_RECOMMENDED", level: "block", data: { party: c.party, day: c.day } });
  return out;
}

export type DifferenceField = "value" | "period";
export type DifferenceFault = "VALUE_DIFFERS_REASON_REQUIRED" | "PERIOD_DIFFERS_REASON_REQUIRED";

/// Which of the award's value and period differ from the recommendation (a period not stated there never matches).
export function recommendationDifferences(award: { value: Sen; period: { value: number; unit: PeriodUnit } }, rec: { price: Sen; period: { value: number; unit: PeriodUnit } | null }): DifferenceField[] {
  const out: DifferenceField[] = [];
  if (award.value !== rec.price) out.push("value");
  if (!rec.period || rec.period.value !== award.period.value || rec.period.unit !== award.period.unit) out.push("period");
  return out;
}

/// Each difference carries its reason (OD-8 A).
export function differenceFaults(diffs: readonly DifferenceField[], reasons: { value: string | null; period: string | null }): Finding<DifferenceFault>[] {
  const out: Finding<DifferenceFault>[] = [];
  if (diffs.includes("value") && !(reasons.value ?? "").trim()) out.push({ code: "VALUE_DIFFERS_REASON_REQUIRED", level: "block" });
  if (diffs.includes("period") && !(reasons.period ?? "").trim()) out.push({ code: "PERIOD_DIFFERS_REASON_REQUIRED", level: "block" });
  return out;
}

export type AwardCeilingFault = "VALUE_ABOVE_CEILING" | "BOUNDARY_NOT_RECORDED";

/**
 * Phase 2 close-out 68-C3 (6.8 Q1 carried to the award, FR-EVL-019, E-9): an awarded value that differs
 * from the recommendation is judged against the exercise's frozen quotation ceiling with the same rule
 * as the recommendation (`ceilingExclusion`): above it (GT: a value exactly on the boundary is still a
 * quotation; GTE: it is a tender) the award is refused on that value, naming the boundary and which
 * side an exact value falls; a quotation whose boundary was never recorded cannot be judged and
 * blocks. A value equal to the recommendation was judged when the recommendation was formed and the
 * report issued (Q1), so it is not asked again. A tender has no ceiling here. Not read: nothing asked.
 */
export function awardCeilingFault(award: { value: Sen }, issued: { price: Sen; ceiling?: CeilingSnapshot }): Finding<AwardCeilingFault> | null {
  if (!issued.ceiling || award.value === issued.price) return null;
  const j = ceilingExclusion(award.value, issued.ceiling);
  if ("fault" in j) return { code: "BOUNDARY_NOT_RECORDED", level: "block" };
  return j.excluded ? { code: "VALUE_ABOVE_CEILING", level: "block", data: { boundary: formatMoney(j.boundary), operator: j.operator } } : null;
}
