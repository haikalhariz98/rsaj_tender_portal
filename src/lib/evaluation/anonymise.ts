/**
 * Anonymised technical scoring (FR-EVL-020, Phase 3b). Where the organisation has decided to anonymise evaluation (a switch it sets, frozen onto a version when it starts),
 * the technical scoring stage shows each bid as "Bidder n" and names it only for a criterion that needs the named contractor (the contractor performance report, a key
 * person, work experience, current work), the reveal logged. Pure.
 *
 * Unset is not off by default in words: the organisation has not decided, scoring shows names as it always has, and the configuration says the switch is not set.
 *
 * What is anonymised is the bidder's identity on the technical scoring stage. A technical stage is a `SCORED` stage that is not the financial one (the model's financial scored
 * stage names a capital base or computes the minimum capital ratio from the tender amount); a financial test, a composite, a commercial stage and the rest are judged with names,
 * as those stages are about the price. The overview's bid list, which carries the evaluated price, is not a scoring stage and is not anonymised.
 */

import type { StageKind } from "./types";

/// The sentence a bid is called while its identity is withheld. Listing numbers are the opening's; the name is the bidder's.
export const anonymousBidder = (listingNo: number): string => `Bidder ${listingNo}`;

/// Whether a criterion needs the named contractor to be judged: the model says so (`needsNamedContractor`), and the contractor performance percentage always does, because it
/// is read from the named contractor's own report (the spec's own example of a criterion that cannot be scored blind).
export const criterionNeedsName = (c: { needsNamedContractor: boolean; computedInput: string }): boolean => c.needsNamedContractor || c.computedInput === "CPR_PERCENT";

export interface AnonymisedStage {
  /// The stage's rows call each bid "Bidder n".
  anonymous: boolean;
  /// The criteria (by code) whose scoring names the bidder: empty when the stage is not anonymous.
  namedFor: ReadonlySet<string>;
}

/// How a stage is shown. Only a technical scoring stage (`SCORED`) of a version that froze the switch on is anonymous.
export function stageAnonymity(stage: { kind: StageKind; capitalBase?: string | null; criteria: readonly { code: string; needsNamedContractor: boolean; computedInput: string }[] }, switchedOn: boolean | null | undefined): AnonymisedStage {
  const financial = stage.capitalBase != null || stage.criteria.some((c) => c.computedInput === "MIN_CAPITAL_RATIO");
  if (switchedOn !== true || stage.kind !== "SCORED" || financial) return { anonymous: false, namedFor: new Set() };
  return { anonymous: true, namedFor: new Set(stage.criteria.filter(criterionNeedsName).map((c) => c.code)) };
}

/// Whether a stage's reveal needs asking at all: it is anonymous and some criterion names the bidder.
export const stageReveals = (a: AnonymisedStage): boolean => a.anonymous && a.namedFor.size > 0;

/// What the configuration says of the switch, in words.
export function anonymisedScoringWords(on: boolean | null | undefined): { state: "ON" | "OFF" | "NOT_SET"; en: string } {
  if (on === true) return { state: "ON", en: "On: the technical scoring stage shows each bid as Bidder n, and names it only for a criterion that needs the named contractor. Each reveal is logged." };
  if (on === false) return { state: "OFF", en: "Off: scoring shows the bidders' names." };
  return { state: "NOT_SET", en: "Not set: scoring shows the bidders' names until the organisation decides whether to anonymise the technical scoring stage." };
}
