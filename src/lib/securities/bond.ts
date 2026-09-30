/**
 * The performance bond (FR-AWD-012, §8.10, decision D4).
 *
 * What the bond is a percentage of is decided per contract and never defaulted: the
 * contract price (SK004 §7.3.3(a)), a one-year value of the contract (the observed
 * award pack), or an amount stated outright. The one-year value is an entered figure
 * with its provenance (6.11 ruling): the pack's RM26,937.70 reproduces only from a
 * stated RM538,754.00, and halving the contract sum gives RM26,937.72.
 */

import type { Sen } from "@/lib/money";

import { pctOfSen, ratioOfSen } from "./money";
import { addMonths, type Day } from "./period";

export type BondBasis = "CONTRACT_PRICE" | "ANNUAL_VALUE" | "STATED_AMOUNT";

export type RequiredBond =
  | { state: "SET"; amount: Sen; basis: BondBasis }
  | { state: "NOT_SET"; missing: ("BASIS" | "PERCENT" | "BASIS_AMOUNT")[] };

export function requiredBond(b: { basis: BondBasis | null; percent: string | null; basisAmount: Sen | null; contractPrice: Sen }): RequiredBond {
  if (!b.basis) return { state: "NOT_SET", missing: ["BASIS"] };
  if (b.basis === "STATED_AMOUNT") return b.basisAmount == null ? { state: "NOT_SET", missing: ["BASIS_AMOUNT"] } : { state: "SET", amount: b.basisAmount, basis: b.basis };
  const missing: ("PERCENT" | "BASIS_AMOUNT")[] = [];
  if (b.percent == null) missing.push("PERCENT");
  if (b.basis === "ANNUAL_VALUE" && b.basisAmount == null) missing.push("BASIS_AMOUNT");
  if (missing.length || b.percent == null) return { state: "NOT_SET", missing };
  const base = b.basis === "CONTRACT_PRICE" ? b.contractPrice : b.basisAmount!;
  return { state: "SET", amount: pctOfSen(base, b.percent), basis: b.basis };
}

/// A one-year value derived from the contract sum and period — shown beside an
/// entered one, never used in its place. Null where the period is not in months.
export function derivedAnnualValue(contractPrice: Sen, periodMonths: number | null): Sen | null {
  if (!periodMonths || periodMonths <= 0) return null;
  return ratioOfSen(contractPrice, 12n, BigInt(periodMonths));
}

export type BondFault = "ISSUER_NOT_APPROVED" | "EXPIRY_REQUIRED" | "BASIS_NOT_SET" | "BELOW_REQUIRED" | "VALIDITY_NOT_SET" | "EXPIRES_TOO_EARLY";

export interface Issuer {
  id: string;
  retiredOn: Date | null;
}

/// Whether an issuer is on the approved list on a day.
export function issuerApproved(issuerId: string | null, issuers: readonly Issuer[], on: Day): boolean {
  if (!issuerId) return false;
  const i = issuers.find((x) => x.id === issuerId);
  return !!i && (i.retiredOn == null || i.retiredOn.toISOString().slice(0, 10) > on);
}

/**
 * Why a lodged bond cannot be verified. The issuer must be on the approved list on the
 * lodgement day, the expiry recorded, the basis decided, the value at least what is
 * required, and the expiry no earlier than completion plus the validity months.
 */
export function bondFaults(
  bond: { issuerId: string | null; lodgedOn: Day; expiresOn: Day | null; value: Sen },
  required: RequiredBond,
  issuers: readonly Issuer[],
  completion: Day | null,
  extraMonths: number | null,
): BondFault[] {
  const out: BondFault[] = [];
  if (!issuerApproved(bond.issuerId, issuers, bond.lodgedOn)) out.push("ISSUER_NOT_APPROVED");
  if (!bond.expiresOn) out.push("EXPIRY_REQUIRED");
  if (required.state === "NOT_SET") out.push("BASIS_NOT_SET");
  else if (bond.value < required.amount) out.push("BELOW_REQUIRED");
  if (completion == null || extraMonths == null) out.push("VALIDITY_NOT_SET");
  else if (bond.expiresOn && bond.expiresOn < addMonths(completion, extraMonths)) out.push("EXPIRES_TOO_EARLY");
  return out;
}

/// The day a bond must run to: completion plus the validity months. Null: not set.
export function bondRequiredUntil(completion: Day | null, extraMonths: number | null): Day | null {
  return completion && extraMonths != null ? addMonths(completion, extraMonths) : null;
}
