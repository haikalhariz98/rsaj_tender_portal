/**
 * Anonymised technical scoring (FR-EVL-020, Phase 3b). Where the organisation has decided to anonymise evaluation (a switch it sets, frozen onto a version when it starts),
 * the technical scoring stage shows each bid as "Bidder n" and names it only for a criterion that needs the named contractor (the contractor performance report, a key
 * person, work experience, current work), the reveal logged. Pure.
 *
 * Unset is not off by default in words: the organisation has not decided, scoring shows names as it always has, and the configuration says the switch is not set.
 *
 * What is anonymised is the bidder's identity on the technical scoring stage. A technical stage is a `SCORED` stage that is not the financial one (the model's financial scored
 * stage names a capital base or computes the minimum capital ratio from the tender amount); a financial test, a composite, a commercial stage and the rest are judged with names,
 * as those stages are about the price. The overview's bid list, which carries the evaluated price, is not a scoring stage: it is anonymised for a member of the evaluation team by the
 * blind reading (`blind.ts`, product owner 2026-10-08, ruling on log line 1751), and other readers see it named as before.
 */

import type { StageKind } from "./types";

/// The sentence a bid is called while its identity is withheld. `n` is the bid's pseudonym number (`pseudonymNumbers`), never its listing number: the opening publishes the listing
/// numbers beside the names, so a pseudonym made from one would be the name read through a table (review of Phase 3b).
export const anonymousBidder = (n: number): string => `Bidder ${n}`;

/// A bid's reference as a sentence names it: "No. 3" is "bid No. 3", and "Bidder 3" stands as it is.
export const bidInSentence = (ref: string): string => ref.replace(/^No\./, "bid No.");

/// A string's 53-bit hash (cyrb53): spreads similar strings, not a secret. Pure, so the same version always numbers its bids the same way.
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Each bid's pseudonym number, 1 to n: the bids put in the order of a hash of the evaluation version and the bid's own id, so the number says nothing of the opening's listing order
 * and is the same every time the version is read. A bid of another version gets another number. Pure.
 */
export function pseudonymNumbers(evaluationId: string, bidderIds: readonly string[]): Map<string, number> {
  const ordered = [...bidderIds].sort((a, b) => hash53(`${evaluationId}:${a}`) - hash53(`${evaluationId}:${b}`) || (a < b ? -1 : a > b ? 1 : 0));
  return new Map(ordered.map((id, i) => [id, i + 1]));
}

/**
 * How a stage's row identifies its bid. On an anonymous stage the row carries the pseudonym number and "Bidder n" and nothing of the opening: not the listing number and not the name.
 * Otherwise the listing number and the name, as the stage always showed them. Pure.
 */
export function bidIdentityAtStage(anonymous: boolean, bid: { listingNo: number; bidderName: string }, pseudonym: number): { listingNo: number; ref: string; anonymous: boolean; bidder: string } {
  return anonymous
    ? { listingNo: pseudonym, ref: anonymousBidder(pseudonym), anonymous: true, bidder: anonymousBidder(pseudonym) }
    : { listingNo: bid.listingNo, ref: `No. ${bid.listingNo}`, anonymous: false, bidder: bid.bidderName };
}

/// A finding names its bid by the listing number it carries: on an anonymous stage that is replaced by the pseudonym, and the sentence says "Bidder n".
export function faultsForBid<F extends { data?: Record<string, unknown> }>(anonymous: boolean, faults: readonly F[], pseudonym: number): F[] {
  return faults.map((x) => (anonymous && x.data?.listingNo != null ? { ...x, data: { ...x.data, listingNo: pseudonym, bidRef: anonymousBidder(pseudonym) } } : x));
}

/**
 * Whether the version still holds its bidders' identities back: it froze the switch on and some anonymous technical scoring stage is not yet submitted. While it does, the screens
 * of the evaluation that sit beside the scoring (the clarification and negotiation records and their pickers) call a bid by its pseudonym, so the scoring is not undone one tab over.
 */
export function identityHeld(switchedOn: boolean | null | undefined, stages: readonly { kind: StageKind; capitalBase?: string | null; criteria: readonly { code: string; needsNamedContractor: boolean; computedInput: string }[]; submitted: boolean }[]): boolean {
  return switchedOn === true && stages.some((s) => stageAnonymity(s, true).anonymous && !s.submitted);
}

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
  if (on === true) return { state: "ON", en: "On: until the technical scoring stage is submitted, a member of the evaluation team is sent no bidder name, no price and no bid identifier. The scoring stage, the bids list, the aspects and the recommendation show each bid as Bidder n, a number that is not the opening's listing number, with its price held back, and a bid is named only for a criterion that needs the named contractor. Each reveal is logged. The opening's own pages are not changed: a team member who sat on the opening panel has seen the names there." };
  if (on === false) return { state: "OFF", en: "Off: scoring shows the bidders' names." };
  return { state: "NOT_SET", en: "Not set: scoring shows the bidders' names until the organisation decides whether to anonymise the technical scoring stage." };
}
