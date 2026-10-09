/**
 * Where a supplier's own bid stands (FR-VND-013: "view the status of its own bids only", Phase 4d). Pure.
 *
 * A bid is a sealed paper envelope, and the portal does not take bids: electronic submission waits on decision D6 and an outside review (6.15c). An envelope names no bidder until the opening (6.6 OD-2: a
 * register names no bidder before it), so the portal can say nothing about a bid before that. After the opening it can say how far the exercise has got, and whether the award went to this supplier. It says nothing
 * else: no price as read, no score, no rank, and no verdict of the opening or the evaluation. Telling a bidder it was eliminated is in effect the notice of non-award, which the organisation's policy D7 governs and
 * which is shown as that notice, not here. A bid is linked to a supplier only when an officer has linked the bidder's party to the supplier's register entry, so a bid that is not linked cannot be shown, and the screen says so.
 */

import type { ExerciseStatus } from "@/lib/method/types";

export type BidStage =
  /// The closing has not passed: bids are handed in on paper, and nothing is shown before the opening.
  | "NOT_CLOSED"
  /// The closing has passed and nothing of this supplier's is recorded as opened (yet, or at all).
  | "NOT_NAMED"
  | "OPENED"
  | "UNDER_EVALUATION"
  | "EVALUATED"
  | "AWARDED_TO_YOU"
  | "AWARDED_ELSEWHERE"
  | "CANCELLED";

export interface BidStandingInput {
  status: ExerciseStatus;
  /// The closing instant has passed.
  closed: boolean;
  /// A bid of this supplier's was opened: one of its linked parties is named on an opened bid (an alternative counts).
  opened: boolean;
  /// The award, once issued (an award not yet issued is not shown).
  award: { issued: boolean; awardeeIsYou: boolean } | null;
}

export interface BidStanding {
  stage: BidStage;
  headline: string;
  detail: string;
  tone: "neutral" | "info" | "ok" | "warn" | "brand";
}

export function bidStanding(i: BidStandingInput): BidStanding {
  if (i.status === "CANCELLED") return { stage: "CANCELLED", headline: "The exercise was cancelled", detail: "No award will be made under it.", tone: "warn" };
  if (i.opened) {
    if (i.award?.issued) {
      return i.award.awardeeIsYou
        ? { stage: "AWARDED_TO_YOU", headline: "Awarded to your company", detail: "The award of this exercise has been issued to your company.", tone: "ok" }
        : { stage: "AWARDED_ELSEWHERE", headline: "Awarded to another company", detail: "The award of this exercise has been issued to another company. The award is published under Results.", tone: "neutral" };
    }
    if (i.status === "EVALUATED") return { stage: "EVALUATED", headline: "The evaluation is finished, the award not yet issued", detail: "Your bid was opened. Nothing about how any bid fared is shown here, and the award has not been issued yet.", tone: "info" };
    if (i.status === "UNDER_EVALUATION") return { stage: "UNDER_EVALUATION", headline: "The exercise is under evaluation", detail: "Your bid was opened. Evaluation is confidential: nothing about how any bid fares is shown here.", tone: "info" };
    return { stage: "OPENED", headline: "Your bid was opened", detail: "Your bid was opened at the opening. Nothing of what was read, nor how it compares, is shown here.", tone: "info" };
  }
  if (!i.closed) return { stage: "NOT_CLOSED", headline: "Bids are handed in on paper", detail: "The portal does not take bids. Hand yours in, sealed, at the place the notice names, before the closing. Nothing about a bid is shown here before the opening.", tone: "neutral" };
  return {
    stage: "NOT_NAMED",
    headline: "No bid of yours is recorded as opened",
    detail: "A bid is shown here once it has been opened and the procurement office has linked the purchase of the documents to your registration. If you handed one in, ask the procurement office whether that link has been made.",
    tone: "warn",
  };
}
