import type { Tx } from "@/lib/audit/record";

import { lockSupplierRow } from "./lock";
import { documentFacts } from "./repo";
import { readRestrictionForClosing, readRestrictionForPurchase, type ClosingFault, type EvidenceDocument, type PurchaseRestriction, type RestrictionReading } from "./restriction-register";
import { supplierPolicyOf } from "./standing-repo";

/**
 * Reads, for ruling 17a, the supplier register's evidence document for a restricted tender sold online. Reads only (the opening's reading takes the supplier row lock, as
 * `eligibilityAtOpening` does). The document is the organisation's configured evidence type and no other; the declared claim is never read.
 */

async function evidenceDocuments(tx: Tx, organisationId: string, supplierId: string, typeId: string | null): Promise<EvidenceDocument[]> {
  if (!typeId) return [];
  const rows = await tx.supplierDocument.findMany({ where: { organisationId, supplierId, typeId } });
  return rows.map((d) => ({ ...documentFacts(d), reference: d.reference }));
}

/// At the purchase: what the register says of the supplier's evidence document today, and against the closing day.
export async function restrictionForPurchase(tx: Tx, org: { id: string }, supplierId: string, day: { today: string; closingDay: string | null }): Promise<PurchaseRestriction> {
  const policy = await supplierPolicyOf(org.id, tx);
  const docs = await evidenceDocuments(tx, org.id, supplierId, policy.restrictionEvidenceTypeId);
  return readRestrictionForPurchase({ evidenceTypeSet: policy.restrictionEvidenceTypeId != null, docs, today: day.today, closingDay: day.closingDay, expiryOnClosingDayCounts: policy.expiryOnClosingDayCounts });
}

/// At the opening: the register's reading for the closing day, the supplier row locked. A configuration gap comes back as a fault, never a reading.
export async function restrictionAtOpening(tx: Tx, org: { id: string }, supplierId: string, day: { closingDay: string; readOn: string }): Promise<{ reading: RestrictionReading } | { fault: ClosingFault }> {
  await lockSupplierRow(tx, supplierId);
  const policy = await supplierPolicyOf(org.id, tx);
  const docs = await evidenceDocuments(tx, org.id, supplierId, policy.restrictionEvidenceTypeId);
  return readRestrictionForClosing({ evidenceTypeSet: policy.restrictionEvidenceTypeId != null, docs, closingDay: day.closingDay, readOn: day.readOn, expiryOnClosingDayCounts: policy.expiryOnClosingDayCounts });
}
