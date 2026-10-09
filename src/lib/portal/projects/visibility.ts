/**
 * Which contracts a signed-in supplier may open in My Projects (Phase 4e). Pure.
 *
 * A contract is the supplier's to see in one way only: its award names the supplier on the register (`Award.vendorId`, the link an officer makes with an audited act, the same
 * one a payment certificate needs, BD-613-44) and the award stands (issued or accepted). A draft or a pending award names nobody yet outside the office; a cancelled award's
 * contract is not the contractor's any more. The exercise's confidentiality does not enter into it: the awardee is a party to its own contract. Anything else reads as not
 * found, and the answer is the same for a contract that does not exist, one of another organisation and one of another contractor (a supplier learns nothing from the difference).
 */

export interface HoldingFacts {
  /// The supplier the award names on the register, or null where the office has linked none.
  awardVendorId: string | null;
  awardStatus: string;
  supplierId: string;
}

export const STANDING_AWARD = ["ISSUED", "ACCEPTED"] as const;

export const supplierHoldsContract = (f: HoldingFacts): boolean => f.awardVendorId != null && f.awardVendorId === f.supplierId && (STANDING_AWARD as readonly string[]).includes(f.awardStatus);
