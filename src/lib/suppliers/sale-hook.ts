/**
 * The register at a document sale, for 6.5's `recordSale` (FR-ADV-010, OD-5; plan 6.15 §4.3). Called
 * inside the sale's transaction after the exercise side is locked (requisition → exercise → window →
 * sales): it locks the linked supplier row last, then reads its standing and its eligibility for the
 * exercise on the locked rows, so a suspension recorded meanwhile cannot slip past the sale. A party not
 * linked is judged by the policy alone. Returns the check and, for a linked party, what is frozen on the
 * sale (`DocumentSale.eligibilitySnapshot`); never backfilled onto earlier sales.
 */

import type { Tx } from "@/lib/audit/record";

import type { EligibilitySnapshot } from "./eligibility";
import { lockSupplierRow } from "./lock";
import { saleStandingCheck, saleSupplierFacts, type SaleCheck } from "./sale";
import { eligibilityOf, supplierPolicyOf } from "./standing-repo";

export interface RegisterAtSale {
  linked: boolean;
  check: SaleCheck;
  /// Frozen on the sale for a linked party: the eligibility as judged, with the checks.
  snapshot: (EligibilitySnapshot & { check: { registration: string; suspension: string } }) | null;
}

export async function registerAtSale(tx: Tx, org: { id: string; timeZone: string | null; today: string }, vendorId: string | null, exerciseId: string): Promise<RegisterAtSale> {
  const policy = await supplierPolicyOf(org.id, tx);
  if (!vendorId) return { linked: false, check: saleStandingCheck(null, { registerRequiredForSale: policy.registerRequiredForSale }), snapshot: null };
  await lockSupplierRow(tx, vendorId);
  const e = await eligibilityOf(vendorId, exerciseId, org, tx);
  const s = await tx.supplier.findUniqueOrThrow({ where: { id: vendorId }, select: { status: true } });
  return registerFrom(e, s.status, policy);
}

type Eligibility = Awaited<ReturnType<typeof eligibilityOf>>;

/// The register's reading as a sale judges it, from the supplier's eligibility and status: the one place both the sale (under the lock) and a supplier's own look at its standing (without) build it.
function registerFrom(e: Eligibility, status: string, policy: { registerRequiredForSale: boolean | null }): RegisterAtSale {
  const standingRow = e?.eligibility.rows.find((r) => r.kind === "STANDING");
  // Run 0 fix round (consider): the registration check reads the cancellation itself, also under a blacklisting.
  // Run 1a (Should 1, flagged 6.15a): the facts from the reading through saleSupplierFacts, so a suspension beneath a
  // cancellation fails the suspension check. A supplier with no reading is judged not registered.
  const facts = e ? saleSupplierFacts(status, e.reading, standingRow?.reason === "LAPSE_RULE_NOT_SET") : { status, standing: "NOT_REGISTERED" as const, lapseRuleNotSet: false, cancelled: false, barredOtherwise: false };
  const check = saleStandingCheck(facts, { registerRequiredForSale: policy.registerRequiredForSale });
  return { linked: true, check, snapshot: e ? { ...e.snapshot, check: { registration: check.registrationCheck, suspension: check.suspensionCheck } } : null };
}

/**
 * The same reading with no lock taken (Phase 4d): what a signed-in supplier is shown of its own standing before it asks for the documents (FR-VND-012, FR-ADV-010). It is a reading, not a sale:
 * the officer's `registerAtSale` judges it again, under the lock, when the sale is recorded. `sale-hook.test.ts` pins that the sale's own path still locks first.
 */
export async function readRegister(tx: Tx, org: { id: string; timeZone: string | null; today: string }, vendorId: string, exerciseId: string): Promise<RegisterAtSale> {
  const policy = await supplierPolicyOf(org.id, tx);
  const e = await eligibilityOf(vendorId, exerciseId, org, tx);
  const s = await tx.supplier.findUniqueOrThrow({ where: { id: vendorId, organisationId: org.id }, select: { status: true } });
  return registerFrom(e, s.status, policy);
}
