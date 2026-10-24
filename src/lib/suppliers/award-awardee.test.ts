import { describe, expect, it } from "vitest";

import { awardeeFromRegister } from "./award-awardee";

const s = { id: "sup1", registeredName: "Acme Sdn Bhd", registrationNo: "123-A", registeredAddress: "1 Jalan Satu", status: "REGISTERED" };

describe("awardeeFromRegister", () => {
  it("copies the register's name, number and address and links the supplier", () => {
    expect(awardeeFromRegister({ awardeePartyId: null, vendorId: null }, s)).toEqual({ ok: true, vendorId: "sup1", awardeeName: "Acme Sdn Bhd", awardeeRegistrationNo: "123-A", awardeeAddress: "1 Jalan Satu" });
  });
  it("allows choosing the supplier it is already linked to", () => {
    expect(awardeeFromRegister({ awardeePartyId: null, vendorId: "sup1" }, s).ok).toBe(true);
  });
  it("never moves an own link to another supplier", () => {
    const r = awardeeFromRegister({ awardeePartyId: null, vendorId: "other" }, s);
    expect(r).toMatchObject({ ok: false, fault: { code: "LINKED_ELSEWHERE" } });
  });
  it("an award with a party follows the party, not a chosen supplier", () => {
    expect(awardeeFromRegister({ awardeePartyId: "p1", vendorId: null }, s)).toMatchObject({ ok: false, fault: { code: "AWARD_HAS_PARTY" } });
  });
  it("a supplier that is not on the register is refused", () => {
    expect(awardeeFromRegister({ awardeePartyId: null, vendorId: null }, null)).toMatchObject({ ok: false, fault: { code: "SUPPLIER_REQUIRED" } });
  });
});
