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
  // SR-10 (ruling 16): how the documents are sold decides whether a place, hours and a payment counter are stated.
  saleMode: true,
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
 * The read behind the public Results page. An award is reduced to its status and the day it was issued
 * (`issuedAt`): no party, no vendor, no figure, no term of it (founder, 2026-10-20; ruling R3). The
 * database never returns what the public must not see, so a later edit to the page cannot leak it.
 * `resultSelect` takes no argument for that reason: nothing an organisation sets widens it.
 */
export function resultSelect() {
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
      select: { status: true, issuedAt: true },
    },
  } satisfies Prisma.SourcingExerciseSelect;
}

/**
 * The read behind the public schedule of tenders (go-live R4a): the attachment, and the facts of its version and document that decide whether the public may be given it
 * (`isPublicSchedule`, schedule.ts), and the bytes' fingerprint and type. Nothing of any award is read here.
 */
export const SCHEDULE_SELECT = {
  exerciseId: true,
  attachedAt: true,
  detachedAt: true,
  version: {
    select: {
      id: true,
      sha256: true,
      mediaType: true,
      originalFilename: true,
      scanState: true,
      withdrawnAt: true,
      document: { select: { classificationSnapshot: true } },
    },
  },
} satisfies Prisma.DocumentAttachmentSelect;
