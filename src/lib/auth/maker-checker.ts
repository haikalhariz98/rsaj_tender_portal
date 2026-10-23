import { withOnePersonReason } from "./two-person";
import type { Fault } from "./types";

/**
 * Maker-checker at issue (ADR 0034 D15, Phase 2a). Pure: whether a person may issue a draft of the approval matrix, given who has made it.
 *
 * The issuer is never one of the makers, compared by Person (an account is bound to one Person for good, so two accounts cannot be one maker).
 * A draft whose makers are not known (it existed when sign-in landed: `makersUnknownAtLanding`, or it simply has no maker on record) cannot be issued by
 * anyone until someone has adopted it: made an attributed edit, or taken the explicit adopt act, which makes them a maker. Then someone else issues it.
 * With only one eligible person nothing is faked: the fault says a second person is needed.
 *
 * While the organisation's two-person switch is off (`twoPersonChanges` false, ADR 0043 D3) a maker may issue their own draft, as the database's guard allows. A missing
 * value reads as on. A draft nobody is on record as having made still needs adopting: the switch does not change that.
 */

export function makerCheckerFault(i: {
  makerPersonIds: readonly string[];
  makersUnknownAtLanding: boolean;
  issuerPersonId: string;
  /// Everyone who could issue (`eligiblePersonIds`), where the caller knows: with the issuer a maker and nobody else able to, the fault says a second person is needed.
  eligiblePersonIds?: readonly string[];
  twoPersonChanges?: boolean;
}): Fault | null {
  const makers = new Set(i.makerPersonIds);
  if (makers.size === 0) {
    return i.makersUnknownAtLanding
      ? {
          code: "MAKERS_UNKNOWN",
          en: "Nobody is recorded as having made this draft, because it was made before sign-in. Someone must adopt it first, by editing it or taking it over, and then a different person issues it.",
        }
      : {
          code: "NO_MAKER_ON_RECORD",
          en: "Nobody is recorded as having made this draft, so there is no one to keep the issuer apart from. Someone must adopt it first, and then a different person issues it.",
        };
  }
  if (makers.has(i.issuerPersonId)) {
    if (i.twoPersonChanges === false) return null;
    if (i.eligiblePersonIds && !secondPersonAvailable(i.makerPersonIds, i.eligiblePersonIds)) {
      return {
        code: "SECOND_PERSON_NEEDED",
        en: "A second person is needed. You made this draft, so you cannot issue it, and nobody else holds the permission to issue. Someone who did not make it must hold that permission first.",
      };
    }
    return {
      code: "ISSUER_IS_MAKER",
      en: "You made this draft, so you cannot issue it. A second person who did not make it issues it.",
    };
  }
  return null;
}

/// Whether anyone but the makers exists to issue it: for the screen, which says a second person is needed rather than offering an issue that must be refused.
export function secondPersonAvailable(makerPersonIds: readonly string[], eligiblePersonIds: readonly string[]): boolean {
  const makers = new Set(makerPersonIds);
  return eligiblePersonIds.some((p) => !makers.has(p));
}

/**
 * Maker-checker at issue for the drafts that have no adopt act of their own (Phase 5a: an evaluation model's, a rate schedule's). The rule is the matrix's: the
 * issuer is never one of the makers, and with nobody on record there is no one to keep the issuer apart from. Where the matrix is adopted by an act, these are
 * adopted by editing: any save of the draft by a holder of the drafting permission puts the person on record, and a different person issues it.
 */
export function draftIssueFault(i: { makerPersonIds: readonly string[]; issuerPersonId: string; eligiblePersonIds?: readonly string[]; twoPersonChanges?: boolean }): Fault | null {
  if (new Set(i.makerPersonIds).size === 0) {
    return {
      code: "NO_MAKER_ON_RECORD",
      en: "Nobody is recorded as having made this draft, so there is no one to keep the issuer apart from. Someone must edit it first (a save puts them on record as its maker), and then a different person issues it.",
    };
  }
  return makerCheckerFault({ ...i, makersUnknownAtLanding: false });
}

/// The reason an issue's audit row carries: where the issuer is one of the makers (only possible with the switch off) it says nobody else put it in force.
export function issueReason(reason: string, i: { makerPersonIds: readonly string[]; issuerPersonId: string; twoPersonChanges: boolean }): string {
  if (i.twoPersonChanges || !i.makerPersonIds.includes(i.issuerPersonId)) return reason;
  return withOnePersonReason(reason);
}
