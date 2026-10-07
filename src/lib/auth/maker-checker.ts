import type { Fault } from "./types";

/**
 * Maker-checker at issue (ADR 0034 D15, Phase 2a). Pure: whether a person may issue a draft of the approval matrix, given who has made it.
 *
 * The issuer is never one of the makers, compared by Person (an account is bound to one Person for good, so two accounts cannot be one maker).
 * A draft whose makers are not known (it existed when sign-in landed: `makersUnknownAtLanding`, or it simply has no maker on record) cannot be issued by
 * anyone until someone has adopted it: made an attributed edit, or taken the explicit adopt act, which makes them a maker. Then someone else issues it.
 * With only one eligible person nothing is faked: the fault says a second person is needed.
 */

export function makerCheckerFault(i: {
  makerPersonIds: readonly string[];
  makersUnknownAtLanding: boolean;
  issuerPersonId: string;
  /// Everyone who could issue (`eligiblePersonIds`), where the caller knows: with the issuer a maker and nobody else able to, the fault says a second person is needed.
  eligiblePersonIds?: readonly string[];
}): Fault | null {
  const makers = new Set(i.makerPersonIds);
  if (makers.size === 0) {
    return i.makersUnknownAtLanding
      ? {
          code: "MAKERS_UNKNOWN",
          en: "Nobody is recorded as having made this draft, because it was made before sign-in. Someone must adopt it first, by editing it or taking it over, and then a different person issues it.",
          ms: "Tiada sesiapa direkodkan sebagai pembuat draf ini, kerana ia dibuat sebelum log masuk. Seseorang mesti mengambil alihnya dahulu, dengan menyuntingnya, kemudian orang lain mengeluarkannya.",
        }
      : {
          code: "NO_MAKER_ON_RECORD",
          en: "Nobody is recorded as having made this draft, so there is no one to keep the issuer apart from. Someone must adopt it first, and then a different person issues it.",
          ms: "Tiada sesiapa direkodkan sebagai pembuat draf ini, jadi tiada sesiapa untuk diasingkan daripada pengeluar. Seseorang mesti mengambil alihnya dahulu, kemudian orang lain mengeluarkannya.",
        };
  }
  if (makers.has(i.issuerPersonId)) {
    if (i.eligiblePersonIds && !secondPersonAvailable(i.makerPersonIds, i.eligiblePersonIds)) {
      return {
        code: "SECOND_PERSON_NEEDED",
        en: "A second person is needed. You made this draft, so you cannot issue it, and nobody else holds the permission to issue. Someone who did not make it must hold that permission first.",
        ms: "Orang kedua diperlukan. Anda membuat draf ini, jadi anda tidak boleh mengeluarkannya, dan tiada orang lain memegang kebenaran mengeluarkan. Seseorang yang tidak membuatnya mesti memegang kebenaran itu dahulu.",
      };
    }
    return {
      code: "ISSUER_IS_MAKER",
      en: "You made this draft, so you cannot issue it. A second person who did not make it issues it.",
      ms: "Anda membuat draf ini, jadi anda tidak boleh mengeluarkannya. Orang kedua yang tidak membuatnya mengeluarkannya.",
    };
  }
  return null;
}

/// Whether anyone but the makers exists to issue it: for the screen, which says a second person is needed rather than offering an issue that must be refused.
export function secondPersonAvailable(makerPersonIds: readonly string[], eligiblePersonIds: readonly string[]): boolean {
  const makers = new Set(makerPersonIds);
  return eligiblePersonIds.some((p) => !makers.has(p));
}
