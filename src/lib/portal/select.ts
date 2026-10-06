/**
 * The whole of what a public opportunity page can learn from the database.
 *
 * Deliberately narrow: it names no estimate, scope amount, bid, opening, evaluation, invitee,
 * purchaser, recipient, officer or dossier, and it never selects a whole relation. It lives apart
 * from the query so `public.test.ts` can scan it without a database. Do not widen it without
 * reading that test.
 */

import type { Prisma } from "@/generated/prisma/client";

export const OPPORTUNITY_SELECT = {
  id: true,
  reference: true,
  title: true,
  status: true,
  restricted: true,
  restrictedTender: true,
  closingAt: true,
  sourcingMethodCode: true,
  // Only whether an award was issued, to move an awarded exercise from the board to Results.
  awards: { select: { status: true } },
  registrationRequirements: { select: { bodyLabelSnapshot: true, qualifiers: true, alternativeGroup: true, sortOrder: true } },
  window: {
    select: {
      path: true,
      publishedAt: true,
      policySnapshot: true,
      purchaseFromDay: true,
      purchaseCloseDay: true,
      purchasePlace: true,
      inspectionPlace: true,
      inspectionHours: true,
      feeAmount: true,
      feePaymentMethods: true,
      submissionPlace: true,
      noticeText: true,
      events: { select: { kind: true, startsAt: true, place: true, mandatory: true, cancelledAt: true } },
      addenda: {
        where: { status: "ISSUED" },
        select: { number: true, title: true, whatChanged: true, issuedOn: true, closingChange: { select: { toClosingAt: true, appliedAt: true } } },
      },
      cancellations: { select: { appliedAt: true } },
    },
  },
} satisfies Prisma.SourcingExerciseSelect;

/// The awards that count as a result: issued, or issued and accepted. Shared with the rule in results.ts.
export const ISSUED_AWARD_STATUSES = ["ISSUED", "ACCEPTED"] as const;

/**
 * The read behind the public Results page. An exercise's award is reduced to when it was issued and
 * who won it. The awarded value is selected only when the organisation has chosen to publish it
 * (`AwardPolicy.publishAwardedValue` is Yes): otherwise it never leaves the database. It names no
 * registration number, address, IC number, vendor, signatory, party or term of the award.
 */
export function resultSelect(showValue: boolean) {
  return {
    id: true,
    reference: true,
    title: true,
    status: true,
    restricted: true,
    closingAt: true,
    sourcingMethodCode: true,
    window: { select: { path: true, publishedAt: true } },
    awards: {
      where: { status: { in: [...ISSUED_AWARD_STATUSES] } },
      select: showValue
        ? { status: true, issuedAt: true, awardeeName: true, awardedValue: true }
        : { status: true, issuedAt: true, awardeeName: true },
    },
  } satisfies Prisma.SourcingExerciseSelect;
}
