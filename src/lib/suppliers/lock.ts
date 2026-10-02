/**
 * How a supplier-register write locks (plan §4; LESSONS: re-validate on locked rows). A supplier-only
 * act locks the supplier row, then the application, document or event it changes; nothing that holds a
 * supplier row asks for an exercise's. An act touching both sides (a2: linking a party, the sale and
 * opening hooks) locks the exercise side first (requisition → exercise → window → party/sale) and the
 * supplier row last. The document store's two supplier owners take the supplier-only path.
 */

import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

/// Lock the supplier row. Every supplier-only write takes it first.
export async function lockSupplierRow(tx: Tx, supplierId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Supplier" WHERE id = ${supplierId} FOR UPDATE`;
  return rows.length === 1;
}

/// A document's supplier, read without a lock, to know what to lock.
export async function supplierOfDocument(documentId: string): Promise<string | null> {
  return (await db.supplierDocument.findUnique({ where: { id: documentId }, select: { supplierId: true } }))?.supplierId ?? null;
}

/// An application's supplier, read without a lock, to know what to lock.
export async function supplierOfApplication(applicationId: string): Promise<string | null> {
  return (await db.supplierApplication.findUnique({ where: { id: applicationId }, select: { supplierId: true } }))?.supplierId ?? null;
}

/// What a supplier document's owner facts and label are read from.
export const SUPPLIER_DOCUMENT_FACTS_SELECT = {
  supplierId: true,
  typeLabelSnapshot: true,
  reference: true,
  verification: true,
  renewedBy: { select: { id: true } },
  supplier: { select: { reference: true } },
} as const;

/// What a supplier application's owner facts and label are read from.
export const SUPPLIER_APPLICATION_FACTS_SELECT = {
  supplierId: true,
  status: true,
  lapsedRecordedAt: true,
  receivedOn: true,
  routes: { select: { status: true } },
  supplier: { select: { reference: true } },
} as const;

/// A document as the trail and the screens name it: the supplier's reference, then the document.
export const supplierDocumentLabel = (d: { typeLabelSnapshot: string; reference: string; supplier: { reference: string } }) => `${d.supplier.reference} · ${d.typeLabelSnapshot}${d.reference ? ` ${d.reference}` : ""}`;

/// An application as the trail and the screens name it: the supplier's reference, then the day it arrived.
export const supplierApplicationLabel = (a: { receivedOn: Date; supplier: { reference: string } }) => `${a.supplier.reference} · Application received ${formatDate(a.receivedOn)}`;
