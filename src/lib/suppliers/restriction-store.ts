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
  return rows.map((d) => ({ ...documentFacts(d), reference: d.reference, lodgedAt: d.recordedAt }));
}

/// At the purchase: what the register says of the supplier's evidence document today, and against the closing day.
export async function restrictionForPurchase(tx: Tx, org: { id: string }, supplierId: string, day: { today: string; closingDay: string | null }): Promise<PurchaseRestriction> {
  const policy = await supplierPolicyOf(org.id, tx);
  const docs = await evidenceDocuments(tx, org.id, supplierId, policy.restrictionEvidenceTypeId);
  return readRestrictionForPurchase({ evidenceTypeSet: policy.restrictionEvidenceTypeId != null, docs, today: day.today, closingDay: day.closingDay, expiryOnClosingDayCounts: policy.expiryOnClosingDayCounts });
}

/// What a retake holds to: the document type and the closing-day rule an opening froze with its first reading (null: not frozen, read the live setting).
export interface FrozenRule {
  evidenceTypeId: string | null;
  closingDayCounts: boolean | null;
}

/**
 * At the opening: the register's reading for the closing day, the supplier row locked. A configuration gap comes back as a fault, never a reading. A reading carries the supplier, the document type
 * and the closing time it was taken under, so it can be taken again on the same footing. `frozen` holds a retake, or a later bidder of the same opening, to the type and rule the opening started with
 * (one opening judges every bidder under one rule); a part of it that was not set then is read from the live setting, so a rule set since is not refused for ever.
 */
export async function restrictionAtOpening(tx: Tx, org: { id: string }, supplierId: string, day: { closingDay: string; closingAt: Date | null; readOn: string }, frozen: FrozenRule | null = null): Promise<{ reading: RestrictionReading } | { fault: ClosingFault }> {
  await lockSupplierRow(tx, supplierId);
  const policy = await supplierPolicyOf(org.id, tx);
  const typeId = frozen?.evidenceTypeId ?? policy.restrictionEvidenceTypeId;
  const docs = await evidenceDocuments(tx, org.id, supplierId, typeId);
  const r = readRestrictionForClosing({ evidenceTypeSet: typeId != null, docs, closingDay: day.closingDay, closingAt: day.closingAt, readOn: day.readOn, expiryOnClosingDayCounts: frozen?.closingDayCounts ?? policy.expiryOnClosingDayCounts });
  return "fault" in r ? r : { reading: { ...r.reading, supplierId, ...(typeId ? { evidenceTypeId: typeId } : {}) } };
}
