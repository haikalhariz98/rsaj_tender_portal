import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { exerciseOrg } from "@/lib/method/repo";
import { entryState } from "@/lib/supervision/diary";

import { contractorBlock } from "./certificates";
import { STANDING_AWARD, supplierHoldsContract } from "./visibility";

/**
 * What the My Projects list reads (Phase 4e): the contracts whose award names the signed-in supplier, with what waits for the contractor on each. Reads only, in the caller's client. Every
 * read names the SESSION's supplier and organisation, and a row is returned only for a contract `supplierHoldsContract` allows.
 */

export interface MyContractRow {
  id: string;
  number: string;
  title: string;
  reference: string;
  status: ContractStatus;
  /// What waits for the contractor: diary entries to attest, certificates to sign, submissions returned.
  toAttest: number;
  toSign: number;
  returned: number;
  waitingOnOffice: number;
}

export async function loadMyContracts(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">): Promise<MyContractRow[]> {
  const org = await exerciseOrg(actor.organisationId, client);
  if (!org) return [];
  const contracts = await client.contract.findMany({
    where: { organisationId: actor.organisationId, award: { vendorId: actor.supplierId, status: { in: [...STANDING_AWARD] } } },
    orderBy: [{ numberedOn: "desc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      status: true,
      award: { select: { status: true, vendorId: true, exercise: { select: { title: true, reference: true } } } },
      siteDiaryEntries: { select: { officerAttestedOn: true, agentAttestedOn: true, disagreement: true, day: true } },
      certificates: { where: { status: "SIGNING", kind: { in: ["VARIATION", "SUM_ADJUSTMENT"] } }, select: { kind: true, status: true, templateRevision: true, signatures: { select: { blockOrder: true } } } },
      contractorSubmissions: { select: { outcome: true } },
    },
  });
  const today = org.today;
  return contracts
    .filter((c) => supplierHoldsContract({ awardVendorId: c.award.vendorId, awardStatus: c.award.status, supplierId: actor.supplierId }))
    .map((c) => ({
      id: c.id,
      number: c.number,
      title: c.award.exercise.title,
      reference: c.award.exercise.reference,
      status: c.status as ContractStatus,
      // An entry the agent has not attested, whose day has come (today's included), and that is not in dispute.
      toAttest: c.siteDiaryEntries.filter((e) => entryState({ officerAttestedOn: e.officerAttestedOn ? storedDay(e.officerAttestedOn) : null, agentAttestedOn: e.agentAttestedOn ? storedDay(e.agentAttestedOn) : null, disagreement: e.disagreement }) !== "DISPUTED" && e.agentAttestedOn == null && (!today || storedDay(e.day) <= today)).length,
      toSign: c.certificates.filter((x) => contractorBlock({ kind: x.kind, status: x.status, blocks: blocksOf(x.templateRevision), signedOrders: x.signatures.map((s) => s.blockOrder) }).state === "READY").length,
      returned: c.contractorSubmissions.filter((s) => s.outcome === "RETURNED").length,
      waitingOnOffice: c.contractorSubmissions.filter((s) => s.outcome == null).length,
    }));
}

/// The pinned revision's blocks, as the contractor's rule reads them. Null where the form is not pinned.
export function blocksOf(templateRevision: unknown): { blockOrder: number; blockKind: string; labelEn: string; refusalAllowed: boolean }[] | null {
  const rev = templateRevision as { blocks?: { blockOrder: number; blockKind: string; labelEn: string; refusalAllowed: boolean }[] } | null;
  if (!rev || !Array.isArray(rev.blocks)) return null;
  return rev.blocks.map((b) => ({ blockOrder: b.blockOrder, blockKind: b.blockKind, labelEn: b.labelEn, refusalAllowed: b.refusalAllowed === true }));
}
