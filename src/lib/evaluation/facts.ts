/**
 * What the evaluation's rules read of one version, mapped from its rows (`repo.ts`) so every rule
 * beside this file is pure and the screens and the acts judge the same facts. Figures are sen or
 * fixed point; nothing is a float.
 */

import type { Sen } from "@/lib/money";

import type { Fixed } from "./fixed";
import type { ModelSnapshot } from "./model";
import type { EstimateRead } from "./saving";
import type { AspectVerdict, EvaluationRoute, EvaluationState, PeriodUnit, Side } from "./types";

/// A current score on one criterion (the latest of its append-only rows).
export interface ScoreFacts {
  marks: Fixed | null;
  passed: boolean | null;
  note: string;
  scoredByPersonId: string;
  scoredBy: string;
  recordedAt: Date;
  /// Carried from the version before (E-7), labelled so.
  carried: boolean;
}

/// The committee's decision on a two-stage tender's first stage, for one bidder (FR-EVL-005).
export type StageOneOutcome = "CARRIED" | "NOT_CARRIED" | "PENDING" | "DEFERRED" | "NOT_TABLED";

export interface BidderFacts {
  id: string;
  openedBidId: string;
  partyId: string;
  listingNo: number;
  bidderName: string;
  registrationNo: string;
  priceAsRead: Sen;
  correctedPrice: Sen | null;
  period: { value: number; unit: PeriodUnit } | null;
  /// Excluded above the exercise's own ceiling (FR-EVL-019), with the reason.
  excludedReason: string;
  shortlisted: boolean | null;
  factorOptionCode: string | null;
  balances: [Sen | null, Sen | null, Sen | null];
  cprPercent: Fixed | null;
  /// Live CPR reports attached to it (or to the bidder it was carried from).
  cprReports: number;
  /// Current score per `${stageCode}/${criterionCode}`.
  scores: ReadonlyMap<string, ScoreFacts>;
  /// Current aspect verdict per aspect code.
  aspects: ReadonlyMap<string, { verdict: AspectVerdict; narrative: string }>;
  /// The checklist items 6.7 found missing on this bid, and whether its verdict reported them (aspect (a)).
  missingAtOpening: readonly string[];
  stageOne: StageOneOutcome | null;
  /// The price after the latest closed negotiation round, where one was held.
  negotiatedPrice: Sen | null;
  carried: boolean;
}

/**
 * The price after a bidder's latest closed negotiation round, by round number (6.8 fix R-10): never by
 * when a round was recorded, which a round entered late would reorder. Null where none was closed with
 * a price.
 */
export function latestNegotiatedPrice<M extends { bidderId: string; kind: string; round: number; closedAt: Date | null; priceAfter: { toString(): string } | null }>(meetings: readonly M[], bidderId: string): M["priceAfter"] | null {
  const closed = meetings.filter((m) => m.bidderId === bidderId && m.kind === "NEGOTIATION" && m.closedAt && m.priceAfter != null);
  return closed.reduce<M | null>((a, m) => (a == null || m.round > a.round ? m : a), null)?.priceAfter ?? null;
}

/// The price a bidder is evaluated at: corrected where corrected, else as read.
export const evaluatedPrice = (b: Pick<BidderFacts, "priceAsRead" | "correctedPrice">): Sen => b.correctedPrice ?? b.priceAsRead;
/// The price recommended at: after negotiation where negotiated, else evaluated.
export const recommendedPriceOf = (b: Pick<BidderFacts, "priceAsRead" | "correctedPrice" | "negotiatedPrice">): Sen => b.negotiatedPrice ?? evaluatedPrice(b);

export const scoreKey = (stageCode: string, criterionCode: string) => `${stageCode}/${criterionCode}`;

export interface SubmissionFacts {
  stageCode: string;
  side: Side;
  personId: string;
  person: string;
  at: Date;
}

export interface ResultFacts {
  bidderId: string;
  stageCode: string;
  percent: Fixed | null;
  shown: Fixed | null;
  passed: boolean | null;
  bandLabel: string | null;
  outOfRunning: boolean;
}

export interface TeamFacts {
  personId: string;
  name: string;
  side: Side;
  unitCode: string | null;
}

export interface EvaluationFacts {
  state: EvaluationState;
  exerciseStatus: string;
  route: EvaluationRoute;
  model: ModelSnapshot;
  /// The places scores are shown and judged at, frozen at the start (E-5); null: not set when it started.
  decimals: number | null;
  /// FR-EVL-020 (Phase 3b): the version anonymises its technical scoring stage (frozen at the start). Absent or null: names are shown.
  anonymised?: boolean | null;
  bidders: readonly BidderFacts[];
  submissions: readonly SubmissionFacts[];
  results: readonly ResultFacts[];
  team: readonly TeamFacts[];
  estimate: EstimateRead;
}
