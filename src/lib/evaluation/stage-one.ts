/**
 * A two-stage tender's first stage (FR-EVL-005): one matter per bidder, of kind EVALUATION_STAGE
 * (typed `evaluationBidderId`), on the domain `evaluation_stage_one`, tabled from the Evaluation tab at
 * a sitting of the committee the pinned model's stage names. The committee's decision at the sitting
 * is the act: CARRIED opens the bidder's second stage, NOT_CARRIED takes it out of the running. A
 * matter pending, or decided either way, is not tabled again; a deferred one may be, at any open
 * sitting of the committee (the rule does not ask a later one). Pure.
 */

import type { StageOneOutcome } from "./facts";
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

/// A first-stage matter as the outcome is read from it.
export interface StageMatterFacts {
  id: string;
  outcome: "PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED";
  withdrawn: boolean;
  /// The day it was tabled (stored as a day), and its sitting's day, then its place on that sitting's agenda.
  tabledAt: Date | null;
  sittingDay: Date | null;
  sequence: number;
}

const DECIDED = new Set(["CARRIED", "NOT_CARRIED"]);
const t = (d: Date | null) => (d ? d.getTime() : -Infinity);

/// Oldest first: tabled day, the sitting's day, the place on the agenda, then the id (never the clock of the read).
export function byTabling(a: StageMatterFacts, b: StageMatterFacts): number {
  return t(a.tabledAt) - t(b.tabledAt) || t(a.sittingDay) - t(b.sittingDay) || a.sequence - b.sequence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The committee's decision on a bidder's first stage (FR-EVL-005; 6.8 fixes R-1, R-2). `matters` are
 * the bidder's matters across its rows in every version: a bidder carried into a new version keeps the
 * matters tabled on the row it was carried from (the caller follows `carriedFromId`), so a new version
 * never resets a first stage the committee decided. Withdrawn matters are ignored. A decided outcome
 * (carried or not) stands over any later undecided one; otherwise the latest tabled reads, ordered by
 * the tabling day, the sitting's day and the place on the agenda — two matters tabled the same day are
 * never left to the order rows were read in.
 */
export function stageOneOutcome(matters: readonly StageMatterFacts[]): StageOneOutcome {
  const live = matters.filter((m) => !m.withdrawn).sort(byTabling);
  if (live.length === 0) return "NOT_TABLED";
  const decided = live.filter((m) => DECIDED.has(m.outcome)).at(-1);
  return (decided ?? live.at(-1)!).outcome;
}
