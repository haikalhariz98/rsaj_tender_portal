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
import { storedDay } from "@/lib/dates";
import { senFromDecimal } from "@/lib/money";
import { evaluationSet } from "@/lib/opening/carry";

import type { EvaluationGateFacts } from "./award-gate";
import type { BundleFacts } from "./bundle";
import { consentCheck } from "./consent";
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
  // M-1: the applied extensions' consents, against the recommended tenderer (FR-BID-010).
  const extensions = rec ? await client.validityExtension.findMany({ where: { exerciseId }, orderBy: { recordedAt: "asc" }, select: { id: true, consentPartyId: true, appliedAt: true, toExpiry: true, consentParty: { select: { name: true } } } }) : [];
  const consent = rec ? consentCheck(extensions.map((x) => ({ id: x.id, consentPartyId: x.consentPartyId, consentPartyName: x.consentParty.name, applied: x.appliedAt != null, toExpiry: storedDay(x.toExpiry) })), rec.bidder.openedBid.party.id) : null;
  const gate: EvaluationGateFacts = {
    applies: throughWindow,
    pinned,
    exerciseStatus: ex.status,
    issued: rec ? { stale, recommendedPartyId: rec.bidder.openedBid.party.id, price: senFromDecimal(rec.price), period: rec.completionPeriod != null && rec.completionUnit ? { value: rec.completionPeriod, unit: rec.completionUnit } : null, consentNotFromRecommended: (consent?.faults ?? []).map((f) => ({ party: String(f.data?.party ?? ""), day: String(f.data?.day ?? "") })) } : null,
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

/**
 * The party recommended in the evaluation version in force (open or issued), or null where none is
 * formed (6.8 fix M-1): a validity extension is recorded and applied only on that party's consent
 * once it exists (FR-BID-010, 6.6 OD-7). Read inside the caller's transaction, which holds the
 * exercise's window row, as every evaluation act does, so the two are serialised.
 */
export async function recommendedPartyInForce(exerciseId: string, client: Tx = db): Promise<string | null> {
  const e = await client.evaluation.findFirst({ where: { exerciseId, state: { in: ["OPEN", "ISSUED"] } }, select: { recommendation: { select: { bidder: { select: { openedBid: { select: { partyId: true } } } } } } } });
  return e?.recommendation?.bidder.openedBid.partyId ?? null;
}
