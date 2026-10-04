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
import { saleStandingCheck, type SaleCheck } from "./sale";
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
  const standingRow = e?.eligibility.rows.find((r) => r.kind === "STANDING");
  // Run 0 fix round (consider): the registration check reads the cancellation itself, also under a blacklisting.
  const check = saleStandingCheck({ status: s.status, standing: (e?.snapshot.standing ?? "NOT_REGISTERED") as never, lapseRuleNotSet: standingRow?.reason === "LAPSE_RULE_NOT_SET", cancelled: e?.reading.cancellation != null }, { registerRequiredForSale: policy.registerRequiredForSale });
  return { linked: true, check, snapshot: e ? { ...e.snapshot, check: { registration: check.registrationCheck, suspension: check.suspensionCheck } } : null };
}
