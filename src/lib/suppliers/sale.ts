/**
 * The register's checks at a document sale (FR-ADV-010, SK002 7.5.1 (c)), for 6.5's `recordSale`. A
 * party linked to the register is checked from it: registered, not cancelled, not suspended (by hand or
 * on lapse), not blacklisted; anything barring refuses the sale, naming it. A party not linked keeps 6.5's
 * "not checked", unless the policy requires the register for a sale (OD-5 `registerRequiredForSale`): true
 * refuses, naming the link to make; not set says the rule is not set; false notes it. Pure.
 */

import type { Standing, StandingReading } from "./standing";
import { barred } from "./standing";
import type { Finding } from "./types";

export type CheckState = "NOT_CHECKED" | "CLEAR" | "FAILED";

export type SaleFault = "SALE_PARTY_LINKED_ELSEWHERE" | "SALE_NOT_REGISTERED" | "BARRED" | "NOT_LINKED_REGISTER_REQUIRED" | "REGISTER_RULE_NOT_SET" | "NOT_LINKED" | "LAPSE_RULE_NOT_SET";

export interface SaleCheck {
  registrationCheck: CheckState;
  suspensionCheck: CheckState;
  findings: Finding<SaleFault>[];
}

export interface SaleSupplierFacts {
  status: string;
  standing: Standing;
  lapseRuleNotSet: boolean;
  /// A registration cancelled in effect (the reading's cancellation), read from the fact itself, not from the standing's
  /// ranking, so it is seen also under a blacklisting that ranks above it (Run 0 fix round consider).
  cancelled: boolean;
  /// Run 1a (Should 1, flagged 6.15a): barred by something other than the cancellation (a blacklisting or a suspension in
  /// effect, or a suspension on lapse), read from the facts, so a suspension beneath a cancellation still fails the
  /// suspension check rather than being recorded as not checked.
  barredOtherwise: boolean;
}

/// The supplier's facts for the sale check, from its standing reading: the one place the hook builds them (tested).
export function saleSupplierFacts(status: string, reading: StandingReading, lapseRuleNotSet: boolean): SaleSupplierFacts {
  return {
    status,
    standing: reading.standing,
    lapseRuleNotSet,
    cancelled: reading.cancellation != null,
    barredOtherwise: reading.blacklist != null || reading.suspension != null || reading.standing === "SUSPENDED_ON_LAPSE",
  };
}

export function saleStandingCheck(
  supplier: SaleSupplierFacts | null,
  policy: { registerRequiredForSale: boolean | null },
): SaleCheck {
  if (!supplier) {
    if (policy.registerRequiredForSale === true) return { registrationCheck: "FAILED", suspensionCheck: "NOT_CHECKED", findings: [{ code: "NOT_LINKED_REGISTER_REQUIRED", level: "block" }] };
    return { registrationCheck: "NOT_CHECKED", suspensionCheck: "NOT_CHECKED", findings: [{ code: policy.registerRequiredForSale == null ? "REGISTER_RULE_NOT_SET" : "NOT_LINKED", level: "warn" }] };
  }
  const findings: Finding<SaleFault>[] = [];
  const registered = supplier.status === "REGISTERED";
  if (!registered) findings.push({ code: "SALE_NOT_REGISTERED", level: "block" });
  // A cancelled registration fails the registration check (from the cancellation itself, also under a blacklisting); a
  // suspension or blacklisting the suspension check, read from the facts (also beneath a cancellation, Should 1). A
  // cancellation alone leaves the suspension check not made.
  const cancelled = registered && supplier.cancelled;
  const isBarred = registered && barred(supplier.standing);
  const otherBar = registered && supplier.barredOtherwise;
  if (isBarred) findings.push({ code: "BARRED", level: "block", data: { standing: supplier.standing } });
  if (registered && !isBarred && supplier.lapseRuleNotSet) findings.push({ code: "LAPSE_RULE_NOT_SET", level: "warn" });
  return { registrationCheck: registered && !cancelled ? "CLEAR" : "FAILED", suspensionCheck: !registered ? "NOT_CHECKED" : otherBar ? "FAILED" : cancelled ? "NOT_CHECKED" : "CLEAR", findings };
}

/**
 * Which supplier the register reads at a sale (6.15a fix M-2, against accepted 6.5): with
 * `registerRequiredForSale` set, no party exists before a first sale, so the sale form may name the
 * register's supplier, and the new (or unlinked) party is linked to it inside the sale's transaction,
 * audited, as an explicit act (OD-9). A party already linked keeps its link: naming the same supplier
 * changes nothing, naming another is refused (a link is never moved).
 */
export type SaleSupplier =
  | { kind: "NONE"; vendorId: null }
  | { kind: "LINKED"; vendorId: string }
  | { kind: "LINK_AT_SALE"; vendorId: string }
  | { kind: "REFUSED"; vendorId: null; fault: Finding<SaleFault> };

export function saleSupplier(partyVendorId: string | null, chosenSupplierId: string | null): SaleSupplier {
  if (partyVendorId) {
    if (chosenSupplierId && chosenSupplierId !== partyVendorId) return { kind: "REFUSED", vendorId: null, fault: { code: "SALE_PARTY_LINKED_ELSEWHERE", level: "block" } };
    return { kind: "LINKED", vendorId: partyVendorId };
  }
  return chosenSupplierId ? { kind: "LINK_AT_SALE", vendorId: chosenSupplierId } : { kind: "NONE", vendorId: null };
}
