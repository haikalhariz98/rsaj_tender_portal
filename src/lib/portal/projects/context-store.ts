import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import type { ContractStatus } from "@/lib/contract/types";
import { exerciseOrg } from "@/lib/method/repo";

import { supplierHoldsContract } from "./visibility";

/**
 * The contract as the signed-in contractor is allowed to see it (Phase 4e), read once per request and handed to the loader of the tab being shown. Every read names the SESSION's
 * supplier and organisation (`actor`): nothing here takes a supplier from a request. The contract is returned only where `supplierHoldsContract` says so (its award names this supplier
 * and stands), and the answer is the same for one that does not exist, one of another organisation and one of another contractor: null.
 */

export interface ProjectContext {
  org: { id: string; timeZone: string | null; today: string | null; name: string };
  contract: {
    id: string;
    number: string;
    status: ContractStatus;
    /// The contract sum as numbered (the contractor's own tendered price, as the award states it).
    contractSum: { toString(): string };
    awardReference: string;
    awardeeName: string;
    exerciseId: string;
    title: string;
    reference: string;
  };
  now: Date;
}

export async function loadProjectContext(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">, contractId: string, now: Date = new Date()): Promise<ProjectContext | null> {
  const org = await exerciseOrg(actor.organisationId, client);
  if (!org) return null;
  const c = await client.contract.findFirst({
    where: { id: contractId, organisationId: actor.organisationId },
    select: { id: true, number: true, status: true, contractSum: true, award: { select: { status: true, vendorId: true, reference: true, awardeeName: true, exercise: { select: { id: true, title: true, reference: true } } } } },
  });
  if (!c || !supplierHoldsContract({ awardVendorId: c.award.vendorId, awardStatus: c.award.status, supplierId: actor.supplierId })) return null;
  return {
    org: { id: org.id, timeZone: org.timeZone, today: org.today, name: org.name },
    contract: { id: c.id, number: c.number, status: c.status as ContractStatus, contractSum: c.contractSum, awardReference: c.award.reference, awardeeName: c.award.awardeeName, exerciseId: c.award.exercise.id, title: c.award.exercise.title, reference: c.award.exercise.reference },
    now,
  };
}
