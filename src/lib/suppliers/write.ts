/**
 * What every supplier-register write shares that does not need Next: the refusals, the audit writer, the
 * row label, the person read under the lock, and the supplier row locked inside a transaction. Moved out of
 * `src/app/suppliers/shared.ts` (which re-exports them and keeps the revalidation) so a write's core can
 * live in the lib and run outside a request, as a one-off data act through the same code the screen uses.
 */

import type { FormState } from "@/components/record-editor";
import type { FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";

import { lockSupplierRow } from "./lock";
import { supplierOrg, type SupplierOrg } from "./repo";

export const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before recording suppliers." };
export const GONE: FormState = { ok: false, message: "That supplier no longer exists." };
export const CHANGED: FormState = { ok: false, message: "The record changed while this was being saved. Reload and try again." };

/// A refusal thrown from inside a transaction: everything written so far rolls back.
export class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

export async function audit(tx: Tx, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Every supplier row's audit label starts with the supplier's reference, so its History finds it.
export const label = (s: { reference: string }, what: string) => `${s.reference} · ${what}`;

export type LockedSupplier = { org: SupplierOrg; supplier: { id: string; reference: string; registeredName: string; status: string; organisationId: string } };

/// A Person on record and active in the organisation, read under the lock; null if not.
export async function activePerson(tx: Tx, organisationId: string, personId: string | null) {
  if (!personId) return null;
  return tx.person.findFirst({ where: { id: personId, organisationId, isActive: true }, select: { id: true, name: true } });
}

/// Inside a transaction: the organisation, the supplier row locked, the supplier read under the lock, then `fn`.
export async function withLockedSupplier(tx: Tx, supplierId: string, fn: (tx: Tx, l: LockedSupplier) => Promise<FormState>): Promise<FormState> {
  const org = await supplierOrg(tx);
  if (!org) return NO_ORG;
  if (!(await lockSupplierRow(tx, supplierId))) return GONE;
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, organisationId: org.id }, select: { id: true, reference: true, registeredName: true, status: true, organisationId: true } });
  if (!supplier) return GONE;
  return fn(tx, { org, supplier });
}
