/**
 * A two-stage tender's first stage (FR-EVL-005): one matter per bidder, of kind EVALUATION_STAGE
 * (typed `evaluationBidderId`), on the domain `evaluation_stage_one`, tabled from the Evaluation tab at
 * a sitting of the committee the pinned model's stage names. The committee's decision at the sitting
 * is the act: CARRIED opens the bidder's second stage, NOT_CARRIED takes it out of the running. A
 * matter pending, or decided either way, is not tabled again; a deferred one may be, at a later
 * sitting. Pure.
 */

import type { Finding } from "./types";

export type StageOneFault = "NOT_TWO_STAGE" | "COMMITTEE_NOT_SET" | "OTHER_COMMITTEE" | "SITTING_CLOSED" | "EXCLUDED_ABOVE_CEILING" | "STAGE_ONE_TABLED" | "STAGE_ONE_DECIDED";

export function stageOneTablingFaults(i: {
  twoStage: boolean;
  /// The first stage's committee code, as pinned.
  committeeCode: string | null;
  sitting: { committeeCode: string; frozen: boolean };
  excluded: boolean;
  /// The bidder's matters already tabled and not withdrawn, by outcome.
  matters: readonly ("PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED")[];
}): Finding<StageOneFault>[] {
  if (!i.twoStage) return [{ code: "NOT_TWO_STAGE", level: "block" }];
  const out: Finding<StageOneFault>[] = [];
  const f = (code: StageOneFault) => out.push({ code, level: "block" });
  if (!i.committeeCode) f("COMMITTEE_NOT_SET");
  else if (i.sitting.committeeCode !== i.committeeCode) f("OTHER_COMMITTEE");
  if (i.sitting.frozen) f("SITTING_CLOSED");
  if (i.excluded) f("EXCLUDED_ABOVE_CEILING");
  if (i.matters.includes("PENDING")) f("STAGE_ONE_TABLED");
  if (i.matters.includes("CARRIED") || i.matters.includes("NOT_CARRIED")) f("STAGE_ONE_DECIDED");
  return out;
}

/// The matter's subject: the exercise and the bid, never a price.
export const stageOneSubject = (title: string, listingNo: number) => `First stage of ${title}: bid No. ${listingNo}`;
