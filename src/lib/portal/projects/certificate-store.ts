import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import type { SupplierActor } from "@/lib/auth/types";
import { withLockedCertificate } from "@/lib/certificate/repo";
import type { CertificateKind } from "@/lib/certificate/types";
import { recordSignature } from "@/lib/certificate/write";
import { actStatusFault, certificateAct } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf } from "@/lib/dates";

import { signBlockFaults } from "./certificates";
import { blocksOf } from "./list-store";
import { supplierAuditActor } from "./submission-store";
import { ProjectRefused, type ProjectFinding } from "./types";
import { supplierHoldsContract } from "./visibility";

/**
 * The contractor signs, or disputes, the contractor's block of a Variation Order Certificate or a Certificate of Adjustment of Contract Sum (spec section 5.3; FR-VAR-022), from the
 * supplier's own portal account, with the password asked again (Phase 4e). One transaction under the certificate's lock (the contract's chain, then the certificate: `withLockedCertificate`),
 * the certificate read as this supplier holds its contract, the contractor's rule (`signBlockFaults`) judged on the locked rows, then the certificate core's own `recordSignature`, which
 * judges the block again in printed order, pins and dates as the form says, writes the account that signed on the row and issues the certificate where the block is the last. The
 * attribution then names the certificate as the exact document signed, and the core's audit row carries the supplier's account as the actor. A dispute is the refusal the form
 * allows, with the reason, recorded on the block as the officers record one from paper.
 */

const refuse = (fs: readonly ProjectFinding[], status: 404 | 409 | 422 = 422): never => {
  throw new ProjectRefused(fs, status);
};

export async function signContractorBlock(actor: SupplierActor, i: { contractId: string; certificateId: string; action: "sign" | "dispute"; note: string; stepUpAt: Date | null }, now: Date = new Date()): Promise<{ certificateId: string; blockOrder: number }> {
  const result = await withLockedCertificate(actor.organisationId, i.certificateId, async (tx, l) => {
    if (l.contract.id !== i.contractId || !supplierHoldsContract({ awardVendorId: l.award.vendorId, awardStatus: l.award.status, supplierId: actor.supplierId })) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
    const cert = l.cert;
    // The act x status table, by the certificate's kind before its issue (BD-613-114).
    if (actStatusFault(certificateAct(cert.kind as CertificateKind, "PRE_ISSUE"), l.contract.status as ContractStatus)) return refuse([{ code: "CONTRACT_NOT_ACTIVE", level: "block" }]);
    const today = dayOf(now, l.org.timeZone);
    if (!today) return refuse([{ code: "DAY_NOT_KNOWN", level: "block" }]);
    const blocks = blocksOf(cert.templateRevision);
    const faults = signBlockFaults({ kind: cert.kind, status: cert.status, blocks, signedOrders: cert.signatures.map((s) => s.blockOrder), action: i.action, note: i.note });
    if (faults.length) return refuse(faults);
    const block = blocks!.find((b) => b.blockKind === "CONTRACTOR")!;
    const sig = await recordSignature({ tx, actor: supplierAuditActor(actor), l, now, today }, { blockOrder: block.blockOrder, personId: null, act: null, name: actor.displayName, icNumber: "", signedOn: today, refused: i.action === "dispute", refusalNote: i.note, decision: null, decisionCap: null, signedBySupplierAccountId: actor.accountId });
    await attributeSupplierAct(tx, { actor, entity: "CertificateSignature", entityId: sig.signatureId, slot: "signedBySupplierAccount", stepUpAt: i.stepUpAt, document: { entity: "Certificate", id: cert.id }, reason: i.action === "dispute" ? "The contractor refused to sign, with its reason, from its own portal account" : "Signed with the password entered when the block was signed" });
    return { certificateId: cert.id, blockOrder: block.blockOrder };
  });
  if (result === null) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
  return result;
}
