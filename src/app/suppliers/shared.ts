/**
 * What every supplier-register write shares (plan 6.15 §4): one transaction that locks the supplier row
 * first (`lockSupplierRow`), then the application, document or route it changes, and re-reads everything
 * the rules judge under that lock. The pure rule (`src/lib/suppliers`) is re-run on the locked rows; the
 * write and its audit rows share the transaction; a refusal saves nothing and names what blocks it and
 * where to set it. Who is signed in is asked first and named on every audit row; a Person the form picks is still only recorded on their behalf, "not signed" (Phase 2b changes that). The server's clock is read once, at the act's entry, to the second.
 */

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import type { Tx } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { db } from "@/lib/db";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { supplierFaultText } from "@/lib/suppliers/labels";
import { blocking, type Finding } from "@/lib/suppliers/types";
import { Refusal, withLockedSupplier, type LockedSupplier } from "@/lib/suppliers/write";
import type { OrgScope } from "@/lib/org-scope";

// The Next-free part lives in the lib, so a write's core can run outside a request; the acts keep importing it from here.
export { activePerson, audit, CHANGED, GONE, label, NO_ORG, Refusal, type LockedSupplier } from "@/lib/suppliers/write";

/// The organisation row, locked: recording a new supplier is serialised on it (the number, the series).
export const lockOrganisation = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;

/// The server's clock, read once at the act's entry, to the second (6.6 CR-3).
export const stampNow = () => toSecond(new Date());

/// The blocking findings, in words, after a lead. The warnings are not repeated.
export const refuse = (fs: readonly Finding[], lead = "Nothing was saved:"): FormState => ({ ok: false, message: `${lead} ${[...new Set(blocking(fs).map((f) => supplierFaultText(f)))].join(" ")}` });

/// The warnings and notes of a finding list, in words, for a saved act's message.
export const notes = (fs: readonly Finding[]) => [...new Set(fs.filter((f) => f.level !== "block").map((f) => supplierFaultText(f)))].join(" ");

/**
 * Run a supplier write: the supplier row locked, then `fn`. A Refusal thrown deep inside rolls
 * everything back and returns its words.
 */
export async function inSupplier(scope: OrgScope, supplierId: string, fn: (tx: Tx, l: LockedSupplier) => Promise<FormState>): Promise<FormState> {
  let result: FormState;
  try {
    result = await db.$transaction(
      (tx) => withLockedSupplier(tx, scope.organisationId, supplierId, fn),
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
