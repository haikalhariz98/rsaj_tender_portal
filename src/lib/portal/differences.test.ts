import { describe, expect, it } from "vitest";

import { companyDifferences, contactDifferences, type CompanyWords, type DifferenceNames } from "./differences";

const same: CompanyWords = {
  registeredName: "Sampel Works Sdn Bhd",
  registrationNo: "202001000123",
  entityTypeCode: "sdn_bhd",
  countryCode: "my",
  addressLine1: "1 Jalan Contoh",
  addressLine2: "",
  city: "Kota Kinabalu",
  postcode: "88000",
  stateCode: "sbh",
  bumiputeraClaimCode: "declared_yes",
  incorporatedOn: "2015-03-02",
  companyEmail: "office@sampel.example",
};
const NAMES: Record<string, string> = { sdn_bhd: "Private limited company", sdn: "Partnership", my: "Malaysia", sbh: "Sabah", sgr: "Selangor", declared_yes: "Bumiputera company" };
const names: DifferenceNames = { nameOf: (_k, code) => NAMES[code] ?? null, day: (d) => `D(${d})` };

describe("what the officer changed between the applicant's words and the register's entry", () => {
  it("lists nothing when the officer corrected nothing", () => {
    expect(companyDifferences(same, { ...same }, names)).toEqual([]);
  });

  it("ignores spaces at the ends and between words, and the case of a number or an email", () => {
    expect(companyDifferences(same, { ...same, registeredName: "  Sampel   Works Sdn Bhd ", registrationNo: "202001000123 ", companyEmail: "OFFICE@sampel.example" }, names)).toEqual([]);
    expect(companyDifferences({ ...same, registrationNo: "ab 123" }, { ...same, registrationNo: "AB  123" }, names)).toEqual([]);
  });

  it("lists each field changed, once, with both values as the screen shows them", () => {
    const d = companyDifferences(same, { ...same, registeredName: "Sampel Works Berhad", city: "Sandakan", stateCode: "sgr", incorporatedOn: "2015-03-03", entityTypeCode: "sdn" }, names);
    expect(d).toEqual([
      { label: "Registered name", applicant: "Sampel Works Sdn Bhd", register: "Sampel Works Berhad" },
      { label: "Type of company", applicant: "Private limited company", register: "Partnership" },
      { label: "City", applicant: "Kota Kinabalu", register: "Sandakan" },
      { label: "State", applicant: "Sabah", register: "Selangor" },
      { label: "Date incorporated", applicant: "D(2015-03-02)", register: "D(2015-03-03)" },
    ]);
  });

  it("shows a name for a coded field, never the code, and says so when a value is no longer listed or was not given", () => {
    const d = companyDifferences({ ...same, countryCode: "zz", bumiputeraClaimCode: "" }, { ...same, countryCode: "my", bumiputeraClaimCode: "declared_yes", incorporatedOn: null }, names);
    expect(d).toEqual([
      { label: "Country", applicant: "A value no longer listed", register: "Malaysia" },
      { label: "Date incorporated", applicant: "D(2015-03-02)", register: "Not given" },
      { label: "Bumiputera status (declared)", applicant: "Not given", register: "Bumiputera company" },
    ]);
    for (const x of d) expect(`${x.applicant} ${x.register}`).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
  });

  it("lists the contact's differences separately, for a reader the contact is open to", () => {
    const a = { name: "Aini", designation: "", email: "aini@sampel.example", phone: "+60 12 345 6789" };
    expect(contactDifferences(a, { ...a })).toEqual([]);
    expect(contactDifferences(a, { ...a, designation: "Director", phone: "+60 12 345 6780", email: "AINI@sampel.example" })).toEqual([
      { label: "Contact's position", applicant: "Not given", register: "Director" },
      { label: "Contact's telephone", applicant: "+60 12 345 6789", register: "+60 12 345 6780" },
    ]);
  });
});
