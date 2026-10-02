/**
 * What the award reads of an exercise's openings (C-7, C-8, X-9): the facts `openingGateFaults`
 * judges, and the parties carried to evaluation (whom an award may name). Read inside the caller's
 * transaction when there is one; the caller has locked the exercise. Reads only.
 */

import type { Tx } from "@/lib/audit/record";
import { loadLateMatters } from "@/lib/bids/repo";
import { db } from "@/lib/db";
import { isLive } from "@/lib/documents/evidence";

import type { OpeningGateFacts } from "./award-gate";

export async function loadOpeningGate(exerciseId: string, client: Tx = db): Promise<OpeningGateFacts & { carried: { id: string; name: string; registrationNo: string; address: string }[] }> {
  const ex = await client.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { packKindSnapshot: true, window: { select: { publishedAt: true } } } });
  const openings = await client.opening.findMany({
    where: { exerciseId },
    orderBy: { sequenceNo: "asc" },
    select: { kind: true, sequenceNo: true, finalisedAt: true, estimateCopyCheck: true, copyExplanation: { select: { id: true } }, admissionDecision: { select: { bidEnvelopeId: true } }, attachments: { where: { purpose: "SIGNED_SCHEDULE" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } }, bids: { where: { verdict: "PASS" }, orderBy: { listingNo: "asc" }, select: { party: { select: { id: true, name: true, registrationNo: true, address: true } } } } },
  });
  const late = await client.bidEnvelope.findMany({ where: { exerciseId, late: true, kind: { not: "COMPANY_ESTIMATE" } }, select: { id: true } });
  const matters = await loadLateMatters(exerciseId, client);
  const carried = openings.filter((o) => o.finalisedAt).flatMap((o) => o.bids.map((b) => b.party));
  return {
    applies: ex.window?.publishedAt != null && (ex.packKindSnapshot === "TENDER" || ex.packKindSnapshot === "QUOTATION"),
    openings: openings.map((o) => ({ kind: o.kind, sequenceNo: o.sequenceNo, finalised: o.finalisedAt != null, liveScans: o.attachments.filter(isLive).length, copyCheck: o.estimateCopyCheck, explained: o.copyExplanation != null, admittedEnvelopeId: o.admissionDecision?.bidEnvelopeId ?? null })),
    admittedEnvelopeIds: late.filter((e) => matters.some((m) => m.bidEnvelopeId === e.id && !m.withdrawn && m.outcome === "CARRIED")).map((e) => e.id),
    carriedPartyIds: new Set(carried.map((p) => p.id)),
    carried: carried.filter((p, i) => carried.findIndex((x) => x.id === p.id) === i),
  };
}

/**
 * C-9: whether the exercise's main opening is adjourned now (its latest sitting ended), read under the
 * caller's locks. False where there is none, or it sits.
 */
export async function mainOpeningAdjourned(exerciseId: string, client: Tx = db): Promise<boolean> {
  const main = await client.opening.findFirst({ where: { exerciseId, kind: "MAIN" }, select: { sittings: { orderBy: { sittingNo: "desc" }, take: 1, select: { adjournedAt: true } } } });
  return main?.sittings[0]?.adjournedAt != null;
}

/**
 * Review M-1: whether any opening of the exercise (the main one or a supplementary one) is started,
 * not finalised, and sitting (its latest sitting not adjourned), read under the caller's locks. The
 * exercise is not cancelled while one is.
 */
export async function openingInProgress(exerciseId: string, client: Tx = db): Promise<boolean> {
  const openings = await client.opening.findMany({ where: { exerciseId, finalisedAt: null }, select: { sittings: { orderBy: { sittingNo: "desc" }, take: 1, select: { adjournedAt: true } } } });
  return openings.some((o) => o.sittings[0]?.adjournedAt == null);
}
