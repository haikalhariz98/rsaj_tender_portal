import { describe, expect, it } from "vitest";

import { codesChangedFields, companyChangedFields, documentsChangedFields, epaymentChangedFields, withoutFaultsAt } from "./changed-fields";
import { EMPTY_CREDITOR } from "./types";

/** Which findings a change answers, for both registration wizards (the public form's reducer and the signed-in steps). */

const row = (id: string, typeId: string, o: Partial<{ title: string; reference: string; expiresOn: string; notApplicable: boolean }> = {}) => ({ id, typeId, title: "", reference: "", issuingAuthority: "", expiresOn: "", ratePercent: "", notApplicable: false, ...o });

describe("changed fields", () => {
  it("names a company's own field, an address part and a contact part by the field their findings carry", () => {
    const was = { registeredName: "", registrationNo: "", entityTypeCode: "", countryCode: "", incorporatedOn: "", bumiputeraClaimCode: null, companyEmail: "", address: { addressLine1: "", addressLine2: "", city: "", postcode: "", stateCode: null }, contact: { name: "", designation: "", email: "", phone: "" } };
    expect(companyChangedFields(was, { ...was, registeredName: "A" })).toEqual(["registeredName"]);
    expect(companyChangedFields(was, { ...was, address: { ...was.address, stateCode: "S" } })).toEqual(["stateCode"]);
    expect(companyChangedFields(was, { ...was, contact: { ...was.contact, name: "N" } })).toEqual(["contactName"]);
    expect(companyChangedFields(was, { ...was, contact: { ...was.contact, phone: "1" } }).sort()).toEqual(["contactEmail", "contactPhone"]);
    expect(companyChangedFields(was, { ...was })).toEqual([]);
  });

  it("names a row's changed field, the row, and its kind; and a row added, taken away or moved to another kind", () => {
    const was = [row("a", "t1"), row("b", "t2")];
    expect(documentsChangedFields(was, [row("a", "t1", { reference: "R" }), row("b", "t2")]).sort()).toEqual(["documents.a", "documents.a.reference", "type.t1"]);
    expect(documentsChangedFields(was, [row("a", "t1")]).sort()).toEqual(["documents.b", "type.t2"]);
    expect(documentsChangedFields(was, [...was, row("c", "t3")]).sort()).toEqual(["documents.c", "type.t3"]);
    expect(documentsChangedFields(was, [row("a", "t1", { notApplicable: true }), row("b", "t2")]).sort()).toEqual(["documents.a", "documents.a.file", "documents.a.notApplicable", "type.t1"]);
    expect(documentsChangedFields(was, [row("a", "t9"), row("b", "t2")]).sort()).toEqual(["documents.a", "type.t1", "type.t9"]);
    expect(documentsChangedFields(was, was.map((r) => ({ ...r })))).toEqual([]);
  });

  it("names a row whose codes changed, whatever the order they were chosen in", () => {
    expect(codesChangedFields({ a: { GRADE: ["g1"], CATEGORY: ["c1"] } }, { a: { CATEGORY: ["c1"], GRADE: ["g1"] } })).toEqual([]);
    expect(codesChangedFields({ a: { GRADE: ["g1"] } }, { a: { GRADE: ["g2"] }, b: {} })).toEqual(["documents.a.values"]);
  });

  it("names the creditor's part, the signatory and the tick", () => {
    const was = { creditor: EMPTY_CREDITOR, signatoryName: "", signatoryDesignation: "", giroConfirmed: false };
    expect(epaymentChangedFields(was, { ...was, creditor: { ...EMPTY_CREDITOR, bankCode: "B" }, giroConfirmed: true })).toEqual(["creditor.bankCode", "giro.confirmed"]);
  });

  it("keeps a finding with no field, and gives back the same list when nothing goes", () => {
    const faults = [{ field: null, n: 1 }, { field: "x", n: 2 }, { field: "y", n: 3 }];
    expect(withoutFaultsAt(faults, ["x"])).toEqual([faults[0], faults[2]]);
    expect(withoutFaultsAt(faults, ["z"])).toBe(faults);
    expect(withoutFaultsAt(faults, [])).toBe(faults);
  });
});
