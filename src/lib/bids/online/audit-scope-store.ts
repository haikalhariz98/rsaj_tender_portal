import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

import { openingFactsFor, type SealedAuditFacts } from "./audit-mask";

/**
 * What the audit mask is judged on (ADR 0036 D9, 20c; wave 3b step 12): for each online-bid record named by a set of audit rows, its exercise, whether that exercise's main opening is
 * unsealed and finalised, and who its named opening officers are (those not taken off). Reads only. It selects an id and an exercise from the online tables and no identity column
 * (the identity-column scan lists this file apart from the stores that do). A record that cannot be found has no facts, and the mask then withholds.
 */
export async function sealedAuditFactsFor(
  organisationId: string,
  rows: readonly { entity: string; entityId: string }[],
  client: Pick<Tx, "onlineBid" | "onlineBidFile" | "opening" | "exerciseOpeningOfficer" | "openedBid" | "bidEnvelope" | "sourcingExercise"> = db,
): Promise<(row: { entity: string; entityId: string }) => SealedAuditFacts | null> {
  const ids = (entity: string) => [...new Set(rows.filter((r) => r.entity === entity).map((r) => r.entityId))];
  const bids = ids("OnlineBid").length ? await client.onlineBid.findMany({ where: { organisationId, id: { in: ids("OnlineBid") } }, select: { id: true, exerciseId: true, envelopeId: true } }) : [];
  const files = ids("OnlineBidFile").length ? await client.onlineBidFile.findMany({ where: { organisationId, id: { in: ids("OnlineBidFile") } }, select: { id: true, exerciseId: true, part: { select: { onlineBid: { select: { envelopeId: true } } } } } }) : [];
  // OnlineBidPart rows are keyed by the bid.
  const partBids = ids("OnlineBidPart").length ? await client.onlineBid.findMany({ where: { organisationId, id: { in: ids("OnlineBidPart") } }, select: { id: true, exerciseId: true, envelopeId: true } }) : [];
  // 20c: the opened offers and envelopes of an online exercise name a bidder from the unseal.
  const openedBids = ids("OpenedBid").length ? await client.openedBid.findMany({ where: { organisationId, id: { in: ids("OpenedBid") } }, select: { id: true, exerciseId: true, envelopeId: true } }) : [];
  const envelopes = ids("BidEnvelope").length ? await client.bidEnvelope.findMany({ where: { organisationId, id: { in: ids("BidEnvelope") } }, select: { id: true, exerciseId: true } }) : [];
  // The envelope each row is about, to judge a late bid by its own opening (20ax).
  const envelopeOf = new Map<string, string>([
    ...openedBids.map((b) => [`OpenedBid:${b.id}`, b.envelopeId] as const),
    ...envelopes.map((e) => [`BidEnvelope:${e.id}`, e.id] as const),
    ...bids.map((b) => [`OnlineBid:${b.id}`, b.envelopeId] as const),
    ...partBids.map((b) => [`OnlineBidPart:${b.id}`, b.envelopeId] as const),
    ...files.flatMap((f) => (f.part ? [[`OnlineBidFile:${f.id}`, f.part.onlineBid.envelopeId] as const] : [])),
  ]);
  const lateEnvelopes = envelopeOf.size ? await client.bidEnvelope.findMany({ where: { organisationId, id: { in: [...new Set(envelopeOf.values())] }, late: true }, select: { id: true } }) : [];
  const lateIds = new Set(lateEnvelopes.map((e) => e.id));
  const exerciseOf = new Map<string, string>([...openedBids.map((b) => [`OpenedBid:${b.id}`, b.exerciseId] as const), ...envelopes.map((e) => [`BidEnvelope:${e.id}`, e.exerciseId] as const), ...bids.map((b) => [`OnlineBid:${b.id}`, b.exerciseId] as const), ...files.map((f) => [`OnlineBidFile:${f.id}`, f.exerciseId] as const), ...partBids.map((b) => [`OnlineBidPart:${b.id}`, b.exerciseId] as const)]);
  const exerciseIds = [...new Set(exerciseOf.values())];
  const [openings, officers, exercises, supplementary] = exerciseIds.length
    ? await Promise.all([
        client.opening.findMany({ where: { exerciseId: { in: exerciseIds }, kind: "MAIN" }, select: { exerciseId: true, unsealedAt: true, finalisedAt: true } }),
        client.exerciseOpeningOfficer.findMany({ where: { organisationId, exerciseId: { in: exerciseIds }, endedAt: null }, select: { exerciseId: true, personId: true } }),
        client.sourcingExercise.findMany({ where: { organisationId, id: { in: exerciseIds } }, select: { id: true, submissionChannel: true } }),
        // 20ax: the supplementary openings, each with the envelope its admission names, so a late bid is judged by the opening that opens it.
        client.opening.findMany({ where: { exerciseId: { in: exerciseIds }, kind: "SUPPLEMENTARY" }, select: { exerciseId: true, unsealedAt: true, finalisedAt: true, admissionDecision: { select: { bidEnvelopeId: true } } } }),
      ])
    : [[], [], [], []];
  return (row) => {
    const exerciseId = exerciseOf.get(`${row.entity}:${row.entityId}`);
    if (!exerciseId) return null;
    const o = openings.find((x) => x.exerciseId === exerciseId);
    const envelopeId = envelopeOf.get(`${row.entity}:${row.entityId}`) ?? null;
    const own = envelopeId ? supplementary.find((x) => x.exerciseId === exerciseId && x.admissionDecision?.bidEnvelopeId === envelopeId) : undefined;
    const judged = openingFactsFor({ main: o ? { unsealed: o.unsealedAt != null, finalised: o.finalisedAt != null } : null, late: envelopeId != null && lateIds.has(envelopeId), supplementary: own ? { unsealed: own.unsealedAt != null, finalised: own.finalisedAt != null } : null });
    return { started: o != null, online: exercises.find((x) => x.id === exerciseId)?.submissionChannel === "ONLINE", unsealed: judged.unsealed, finalised: judged.finalised, namedOfficerPersonIds: officers.filter((x) => x.exerciseId === exerciseId).map((x) => x.personId) };
  };
}
