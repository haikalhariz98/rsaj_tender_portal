import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

import type { SealedAuditFacts } from "./audit-mask";

/**
 * What the audit mask is judged on (ADR 0036 D9, 20c; wave 3b step 12): for each online-bid record named by a set of audit rows, its exercise, whether that exercise's main opening is
 * unsealed and finalised, and who its named opening officers are (those not taken off). Reads only. It selects an id and an exercise from the online tables and no identity column
 * (the identity-column scan lists this file apart from the stores that do). A record that cannot be found has no facts, and the mask then withholds.
 */
export async function sealedAuditFactsFor(
  organisationId: string,
  rows: readonly { entity: string; entityId: string }[],
  client: Pick<Tx, "onlineBid" | "onlineBidFile" | "opening" | "exerciseOpeningOfficer"> = db,
): Promise<(row: { entity: string; entityId: string }) => SealedAuditFacts | null> {
  const ids = (entity: string) => [...new Set(rows.filter((r) => r.entity === entity).map((r) => r.entityId))];
  const bids = ids("OnlineBid").length ? await client.onlineBid.findMany({ where: { organisationId, id: { in: ids("OnlineBid") } }, select: { id: true, exerciseId: true } }) : [];
  const files = ids("OnlineBidFile").length ? await client.onlineBidFile.findMany({ where: { organisationId, id: { in: ids("OnlineBidFile") } }, select: { id: true, exerciseId: true } }) : [];
  // OnlineBidPart rows are keyed by the bid.
  const partBids = ids("OnlineBidPart").length ? await client.onlineBid.findMany({ where: { organisationId, id: { in: ids("OnlineBidPart") } }, select: { id: true, exerciseId: true } }) : [];
  const exerciseOf = new Map<string, string>([...bids.map((b) => [`OnlineBid:${b.id}`, b.exerciseId] as const), ...files.map((f) => [`OnlineBidFile:${f.id}`, f.exerciseId] as const), ...partBids.map((b) => [`OnlineBidPart:${b.id}`, b.exerciseId] as const)]);
  const exerciseIds = [...new Set(exerciseOf.values())];
  const [openings, officers] = exerciseIds.length
    ? await Promise.all([
        client.opening.findMany({ where: { exerciseId: { in: exerciseIds }, kind: "MAIN" }, select: { exerciseId: true, unsealedAt: true, finalisedAt: true } }),
        client.exerciseOpeningOfficer.findMany({ where: { organisationId, exerciseId: { in: exerciseIds }, endedAt: null }, select: { exerciseId: true, personId: true } }),
      ])
    : [[], []];
  return (row) => {
    const exerciseId = exerciseOf.get(`${row.entity}:${row.entityId}`);
    if (!exerciseId) return null;
    const o = openings.find((x) => x.exerciseId === exerciseId);
    return { unsealed: o?.unsealedAt != null, finalised: o?.finalisedAt != null, namedOfficerPersonIds: officers.filter((x) => x.exerciseId === exerciseId).map((x) => x.personId) };
  };
}
