import type { NoticeDraft } from "@/lib/inbox/notices";

import type { Fault } from "./types";

/**
 * The named authoriser's confirmation of a back-dated signature (NFR-AUD-006, ruling item 9 of the Phase 2 rulings, Phase 5a). Pure.
 *
 * A signed act dated earlier than the day it is recorded is a recorded exception: the signer says why and names the person who authorised it. That naming is the signer's
 * claim until the person named confirms it, as a signed act of their own, in their own session, with their password. The act is not held while it waits (ruling, 2026-10-07): it
 * is recorded, and every screen and the audit export read it as "not confirmed" until the confirmation exists. Only the person named confirms, once; the database holds both
 * (trigger `BackdateConfirmation_guard`).
 */

export interface BackdatedAttribution {
  id: string;
  /// The person the signer named as authorising the earlier date, or null where the act was not back-dated.
  authorisedByPersonId: string | null;
  effectiveOn: string | null;
  alreadyConfirmed: boolean;
}

export function confirmationFaults(a: BackdatedAttribution | null, actorPersonId: string): Fault[] {
  if (!a || a.effectiveOn == null || a.authorisedByPersonId == null) {
    return [{ code: "NOT_BACKDATED", en: "That act was not back-dated, or names no one as authorising it, so there is nothing to confirm.", ms: "Tindakan itu tidak diberi tarikh lalu, atau tidak menamakan sesiapa sebagai pemberi kuasa, jadi tiada apa untuk disahkan." }];
  }
  if (a.authorisedByPersonId !== actorPersonId) {
    return [{ code: "NOT_THE_AUTHORISER", en: "Only the person the signer named as authorising it confirms a back-dating.", ms: "Hanya orang yang dinamakan oleh penandatangan sebagai pemberi kuasa mengesahkan pentarikhan lalu." }];
  }
  if (a.alreadyConfirmed) return [{ code: "ALREADY_CONFIRMED", en: "You have already confirmed this back-dating.", ms: "Anda telah mengesahkan pentarikhan lalu ini." }];
  return [];
}

/// The notice that asks the named person to confirm. It carries the signer, what was signed, the two days and the signer's reason, and never a figure.
export function backdateToConfirmNotice(i: {
  attributionId: string;
  authorisedByPersonId: string;
  signerName: string;
  /// What was signed, in the slot's own words ("Decided by", "Issued by").
  whatWords: string;
  effectiveOn: string;
  recordedOn: string;
  reason: string;
  by: string | null;
}): NoticeDraft[] {
  // The signer cannot name themselves as the one who authorised it (the writer refuses that), but a notice to oneself would be no notice.
  if (i.authorisedByPersonId === i.by) return [];
  return [
    {
      recipientPersonId: i.authorisedByPersonId,
      kind: "BACKDATE_TO_CONFIRM",
      subjectEntity: "ActAttribution",
      subjectId: i.attributionId,
      occurrence: "",
      exerciseId: null,
      title: `${i.signerName} names you as authorising a back-dated signature`,
      body: `${i.signerName} signed “${i.whatWords}” dated ${i.effectiveOn}, recorded on ${i.recordedOn}, and says you authorised the earlier date: “${i.reason}”. Confirm it with your password if you did. Until you do it reads as not confirmed.`,
      href: `/inbox/${i.attributionId}`,
    },
  ];
}
