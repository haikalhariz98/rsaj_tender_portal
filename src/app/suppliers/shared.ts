/**
 * What every supplier-register write shares (plan 6.15 §4): one transaction that locks the supplier row
 * first (`lockSupplierRow`), then the application, document or route it changes, and re-reads everything
 * the rules judge under that lock. The pure rule (`src/lib/suppliers`) is re-run on the locked rows; the
 * write and its audit rows share the transaction; a refusal saves nothing and names what blocks it and
 * where to set it. Nobody is signed in: every person named is "recorded on behalf of, not signed", and the
 * audit is unattributed. The server's clock is read once, at the act's entry, to the second.
 */

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import type { FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { db } from "@/lib/db";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { supplierFaultText } from "@/lib/suppliers/labels";
import { lockSupplierRow } from "@/lib/suppliers/lock";
import { supplierOrg, type SupplierOrg } from "@/lib/suppliers/repo";
import { blocking, type Finding } from "@/lib/suppliers/types";

export const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before recording suppliers." };
export const GONE: FormState = { ok: false, message: "That supplier no longer exists." };
export const CHANGED: FormState = { ok: false, message: "The record changed while this was being saved. Reload and try again." };

/// A refusal thrown from inside a transaction: everything written so far rolls back.
export class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

/// The server's clock, read once at the act's entry, to the second (6.6 CR-3).
export const stampNow = () => toSecond(new Date());

/// The blocking findings, in words, after a lead. The warnings are not repeated.
export const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${[...new Set(blocking(fs).map((f) => supplierFaultText(f)))].join(" ")}` });

/// The warnings and notes of a finding list, in words, for a saved act's message.
export const notes = (fs: readonly Finding[]) => [...new Set(fs.filter((f) => f.level !== "block").map((f) => supplierFaultText(f)))].join(" ");

export async function audit(tx: Tx, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Every supplier row's audit label starts with the supplier's reference, so its History finds it.
export const label = (s: { reference: string }, what: string) => `${s.reference} · ${what}`;

export type LockedSupplier = { org: SupplierOrg; supplier: { id: string; reference: string; registeredName: string; status: string; organisationId: string } };

/**
 * Run a supplier write: the supplier row locked, then `fn`. A Refusal thrown deep inside rolls
 * everything back and returns its words.
 */
export async function inSupplier(supplierId: string, fn: (tx: Tx, l: LockedSupplier) => Promise<FormState>): Promise<FormState> {
  let result: FormState;
  try {
    result = await db.$transaction(
      async (tx) => {
        const org = await supplierOrg(tx);
        if (!org) return NO_ORG;
        if (!(await lockSupplierRow(tx, supplierId))) return GONE;
        const supplier = await tx.supplier.findFirst({ where: { id: supplierId, organisationId: org.id }, select: { id: true, reference: true, registeredName: true, status: true, organisationId: true } });
        if (!supplier) return GONE;
        return fn(tx, { org, supplier });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    if (transactionTimedOut(e)) return { ok: false, message: "This took too long and nothing was saved. Try again." };
    throw e;
  }
  if (result.ok) {
    revalidatePath(`/suppliers/${supplierId}`);
    revalidatePath("/suppliers");
    revalidatePath("/approvals");
  }
  return result;
}

/// A Person on record and active in the organisation, read under the lock; null if not.
export async function activePerson(tx: Tx, organisationId: string, personId: string | null) {
  if (!personId) return null;
  return tx.person.findFirst({ where: { id: personId, organisationId, isActive: true }, select: { id: true, name: true } });
}
