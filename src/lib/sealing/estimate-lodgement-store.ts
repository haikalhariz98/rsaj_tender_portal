/**
 * What stands sealed for an exercise's company estimate (ADR 0036 D10, D11; wave 3b step 16): the one unsuperseded lodgement and who lodged the version last. Reads ids and numbers
 * only, never a column of the sealed copy and never the figure, so the screens, the start and the lodge act all judge the same facts.
 */

import type { Tx } from "@/lib/audit/record";

import type { StandingLodgement } from "./estimate-lodgement";

/// The exercise's unsuperseded sealed copy, the latest if more than one were ever left standing.
export async function standingLodgement(client: Pick<Tx, "sealedEstimateLodgement">, organisationId: string, exerciseId: string): Promise<(StandingLodgement & { id: string }) | null> {
  const row = await client.sealedEstimateLodgement.findFirst({
    where: { organisationId, exerciseId, supersededAt: null },
    orderBy: { lodgedAt: "desc" },
    select: { id: true, keyId: true, lodgedByPersonId: true, estimateVersion: { select: { versionNo: true } } },
  });
  return row ? { id: row.id, keyId: row.keyId, lodgedByPersonId: row.lodgedByPersonId, versionNo: row.estimateVersion.versionNo } : null;
}

/// Whoever last lodged the given version of the estimate, by the custody event (recorded on paper and online alike). Null where none was recorded.
export async function lodgingOfficerOf(client: Pick<Tx, "estimateEvent">, organisationId: string, estimateId: string, versionNo: number): Promise<string | null> {
  const ev = await client.estimateEvent.findFirst({ where: { organisationId, estimateId, kind: "LODGED", versionNo }, orderBy: { at: "desc" }, select: { personId: true } });
  return ev?.personId ?? null;
}
