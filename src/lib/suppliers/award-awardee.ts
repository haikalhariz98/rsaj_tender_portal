import type { Finding } from "./types";
import { linkAwardFaults, type LinkFault } from "./link";

/**
 * An award with no awardee party names its awardee by choosing a supplier on the register (dropdown sweep 2): the name, registration number and address are then the register's own, copied
 * at that moment and kept as written afterwards, and the award is linked to the supplier. The link rules are `linkAwardFaults`'s: an award with a party follows the party instead, and an
 * award already linked on its own to another supplier is refused rather than moved (OD-9). Choosing the supplier it is already linked to is allowed (the figures are copied again). Pure.
 */
export function awardeeFromRegister(
  award: { awardeePartyId: string | null; vendorId: string | null },
  supplier: { id: string; registeredName: string; registrationNo: string; registeredAddress: string; status: string } | null,
): { ok: true; vendorId: string; awardeeName: string; awardeeRegistrationNo: string; awardeeAddress: string } | { ok: false; fault: Finding<LinkFault> } {
  const blocks = linkAwardFaults({ awardeePartyId: award.awardeePartyId, awardeeRegistrationNo: supplier?.registrationNo ?? "", vendorId: award.vendorId }, supplier, "").filter((f) => f.level === "block" && f.code !== "ALREADY_LINKED");
  if (blocks.length || !supplier) return { ok: false, fault: blocks[0] ?? { code: "SUPPLIER_REQUIRED", level: "block" } };
  return { ok: true, vendorId: supplier.id, awardeeName: supplier.registeredName.slice(0, 240), awardeeRegistrationNo: supplier.registrationNo.slice(0, 120), awardeeAddress: supplier.registeredAddress.slice(0, 1000) };
}
