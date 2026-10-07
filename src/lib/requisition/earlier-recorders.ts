import type { Tx } from "@/lib/audit/record";
import { loadRecorders, recordersOf } from "@/lib/auth/attribution-recorders";

import type { EarlierRecorders } from "./holders";

/**
 * Who keyed the earlier acts of a matter for someone else (Phase 2b review), read for `deciderFaults` in the decision's own transaction. Each caller names what it
 * has: the requisition (whose requesting officer may have been recorded for, and whose endorsements are read with it), and the other steps of the route that are decided. A matter with
 * none of the first two (a supplier's application, a certificate: their submitter is the signed-in officer's own) names only its steps.
 */
export async function earlierRecordersOf(
  client: Pick<Tx, "actAttribution" | "requisitionEndorsement">,
  organisationId: string,
  of: { requisitionId?: string | null; otherStepIds: readonly string[] },
): Promise<EarlierRecorders> {
  // The requisition's endorsements are read here, whichever shape the caller loaded the requisition in.
  const endorsementIds = of.requisitionId ? (await client.requisitionEndorsement.findMany({ where: { requisitionId: of.requisitionId, requisition: { organisationId } }, select: { id: true } })).map((e) => e.id) : [];
  const recorders = await loadRecorders(client, organisationId, [
    { entity: "Requisition", slot: "requestingPerson", ids: of.requisitionId ? [of.requisitionId] : [] },
    { entity: "RequisitionEndorsement", slot: "person", ids: endorsementIds },
    { entity: "ApprovalStep", slot: "decidedBy", ids: of.otherStepIds },
  ]);
  return {
    requesterRecorderIds: recordersOf(recorders, "Requisition", "requestingPerson", of.requisitionId ? [of.requisitionId] : []),
    endorsementRecorderIds: recordersOf(recorders, "RequisitionEndorsement", "person", endorsementIds),
    otherDeciderRecorderIds: recordersOf(recorders, "ApprovalStep", "decidedBy", of.otherStepIds),
  };
}
