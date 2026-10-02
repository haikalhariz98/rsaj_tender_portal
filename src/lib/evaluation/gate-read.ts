/**
 * What the committee's tabling (6.10, E-8) and the award (6.11, E-9) read of an exercise's evaluation:
 * the facts `bundleFaults` and `evaluationGateFaults` judge, and the recommendation an award is
 * pre-filled from. Read inside the caller's transaction when there is one (the caller holds the
 * sitting's lock, or the exercise's); reads only, and no score or price beyond the recommended one,
 * which the award records anyway. Staleness is judged by the bids, never a clock: the report stands
 * while the bids it evaluated are 6.7's carried offers now (`reportStale`).
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { senFromDecimal } from "@/lib/money";
import { evaluationSet } from "@/lib/opening/carry";

import type { EvaluationGateFacts } from "./award-gate";
import type { BundleFacts } from "./bundle";
import { reportStale } from "./report";

export async function loadEvaluationGate(exerciseId: string, client: Tx = db) {
  const ex = await client.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { status: true, packKindSnapshot: true, evaluationModelSnapshot: true, window: { select: { publishedAt: true } } } });
  const openings = await client.opening.findMany({ where: { exerciseId }, select: { kind: true, finalisedAt: true, bids: { select: { id: true, verdict: true } } } });
  const current = await client.evaluation.findFirst({
    where: { exerciseId, state: { in: ["OPEN", "ISSUED"] } },
    select: {
      id: true,
      version: true,
      state: true,
      bidders: { select: { openedBidId: true } },
      recommendation: { select: { price: true, completionPeriod: true, completionUnit: true, bidder: { select: { id: true, openedBid: { select: { listingNo: true, party: { select: { id: true, name: true, registrationNo: true, address: true } } } } } } } },
      proposalPaper: { select: { checkedByPersonId: true, recommendedByPersonId: true } },
    },
  });
  const carried = evaluationSet(openings.map((o) => ({ kind: o.kind, finalised: o.finalisedAt != null, bids: o.bids }))).map((b) => b.id);
  const stale = current ? reportStale(current.bidders.map((b) => b.openedBidId), carried) : false;
  const throughWindow = ex.window?.publishedAt != null && (ex.packKindSnapshot === "TENDER" || ex.packKindSnapshot === "QUOTATION");
  const pinned = ex.evaluationModelSnapshot != null;
  const rec = current?.state === "ISSUED" ? current.recommendation : null;
  const gate: EvaluationGateFacts = {
    applies: throughWindow,
    pinned,
    exerciseStatus: ex.status,
    issued: rec ? { stale, recommendedPartyId: rec.bidder.openedBid.party.id, price: senFromDecimal(rec.price), period: rec.completionPeriod != null && rec.completionUnit ? { value: rec.completionPeriod, unit: rec.completionUnit } : null } : null,
  };
  const bundle: BundleFacts = {
    applies: throughWindow && pinned,
    evaluation: current ? { state: current.state as "OPEN" | "ISSUED", stale } : null,
    proposal: current?.proposalPaper ? { checked: current.proposalPaper.checkedByPersonId != null, recommended: current.proposalPaper.recommendedByPersonId != null } : null,
  };
  return {
    gate,
    bundle,
    version: current?.version ?? null,
    /// The recommended tenderer of the issued report: whom an award names, and what it is pre-filled with.
    recommended: rec ? { party: rec.bidder.openedBid.party, listingNo: rec.bidder.openedBid.listingNo, price: senFromDecimal(rec.price), period: gate.issued!.period } : null,
  };
}
export type EvaluationGate = Awaited<ReturnType<typeof loadEvaluationGate>>;
