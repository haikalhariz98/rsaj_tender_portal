/**
 * Linking an exercise's party, or an award, to the register's supplier (OD-9): an explicit audited act,
 * never inferred by matching numbers (C-7: an empty number never matches anything). A party's number that
 * differs from the register's needs a reason, and the difference stays shown. A party already linked to
 * another supplier is refused. An award with an awardee party follows the party's link (written in the
 * same transaction); only an award with no party is linked on its own. Pure.
 */

import { normaliseRegistrationNo } from "./identity";
import type { Finding } from "./types";

export type LinkFault = "ALREADY_LINKED" | "LINKED_ELSEWHERE" | "NUMBER_DIFFERS_REASON_REQUIRED" | "NUMBER_DIFFERS" | "SUPPLIER_NOT_REGISTERED" | "AWARD_HAS_PARTY" | "SUPPLIER_REQUIRED";

/// Whether two registration numbers are the same number, as the register compares them. Empty is never the same.
export const sameNumber = (a: string, b: string) => !!a.trim() && !!b.trim() && normaliseRegistrationNo(a) === normaliseRegistrationNo(b);

function common(current: string | null, registrationNo: string, supplier: { id: string; registrationNo: string; status: string } | null, reason: string): Finding<LinkFault>[] {
  if (!supplier) return [{ code: "SUPPLIER_REQUIRED", level: "block" }];
  const out: Finding<LinkFault>[] = [];
  if (current === supplier.id) out.push({ code: "ALREADY_LINKED", level: "block" });
  else if (current) out.push({ code: "LINKED_ELSEWHERE", level: "block" });
  if (!sameNumber(registrationNo, supplier.registrationNo)) out.push(reason.trim() ? { code: "NUMBER_DIFFERS", level: "warn", data: { recorded: registrationNo || "none", register: supplier.registrationNo } } : { code: "NUMBER_DIFFERS_REASON_REQUIRED", level: "block", data: { recorded: registrationNo || "none", register: supplier.registrationNo } });
  if (supplier.status !== "REGISTERED") out.push({ code: "SUPPLIER_NOT_REGISTERED", level: "warn" });
  return out;
}

export function linkPartyFaults(party: { registrationNo: string; vendorId: string | null }, supplier: { id: string; registrationNo: string; status: string } | null, reason: string): Finding<LinkFault>[] {
  return common(party.vendorId, party.registrationNo, supplier, reason);
}

export function linkAwardFaults(award: { awardeePartyId: string | null; awardeeRegistrationNo: string; vendorId: string | null }, supplier: { id: string; registrationNo: string; status: string } | null, reason: string): Finding<LinkFault>[] {
  if (award.awardeePartyId) return [{ code: "AWARD_HAS_PARTY", level: "block" }];
  return common(award.vendorId, award.awardeeRegistrationNo, supplier, reason);
}

/// An award with a party must name the party's supplier (the party's link is authoritative). Null: they agree.
export function awardLinkDisagrees(award: { awardeePartyId: string | null; vendorId: string | null }, partyVendorId: string | null): boolean {
  return award.awardeePartyId != null && award.vendorId !== partyVendorId;
}
