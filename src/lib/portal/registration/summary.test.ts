import { describe, expect, it } from "vitest";

import { sulitGranted, sulitWithheld } from "@/lib/auth/sulit-access";
import { bumiputeraReading } from "@/lib/suppliers/bumiputera";

import { forSupplier, registrationSummary, type SummaryCreditor, type SummaryRecord } from "./summary";

const fmt = { day: (iso: string) => `day:${iso}` };

const creditor: SummaryCreditor = {
  beneficiaryName: "Demonstration Contractors",
  beneficiaryAddress: "1 Demonstration Road",
  beneficiaryIdentityNo: "202001000001",
  beneficiaryContactPerson: "Aminah",
  beneficiaryTelephone: "0123456789",
  beneficiaryFax: "",
  beneficiaryTaxRegistrationNo: "",
  beneficiaryEmail: "accounts@example.invalid",
  bankCode: "bank-a",
  bankAccountNo: "1234567890",
  bankAccountTypeCode: "current",
  bankSwiftCode: "",
  bankAddress: "2 Demonstration Street",
  bankName: "Demonstration Bank",
  accountTypeName: "Current account",
  statementFiles: ["statement.pdf"],
  identityDiffersFromCompany: false,
  verification: null,
};

const record = (o: Partial<SummaryRecord> = {}): SummaryRecord => ({
  company: {
    registeredName: "Demonstration Contractors Sdn Bhd",
    registrationNo: "202001000001",
    formatChecked: true,
    entityTypeName: "Private limited company",
    countryName: "Demonstrationland",
    addressLines: ["1 Demonstration Road", "Demoville", "40000", "Demostate"],
    incorporatedOn: "2020-01-15",
    companyEmail: "info@example.invalid",
    bumiputera: bumiputeraReading("Bumiputera company", true, { reference: "STB-9912", verification: "NOT_CHECKED" }, "REGISTER"),
  },
  contacts: sulitGranted([{ name: "Aminah Binti Ali", designation: "Director", email: "aminah@example.invalid", phone: "+60123456789", primary: true }], "NAMED_ON_RECORD"),
  documents: [
    {
      id: "d1",
      typeName: "Works board certificate",
      hint: "Latest certificate",
      title: "",
      reference: "WB-1",
      issuingAuthority: "The board",
      expiresOn: "2027-06-30",
      notApplicable: false,
      ratePercent: null,
      files: [{ name: "wb.pdf", scanLabel: "Not scanned" }],
      verification: { state: "VERIFIED", by: "An Officer", on: "2026-10-09", note: "" },
      lodgedBy: "the supplier's own portal account",
      lodgedByOfficer: false,
      codes: ["G3 — Grade 3", "B — Buildings"],
    },
    { id: "d2", typeName: "Sales tax certificate", hint: null, title: "", reference: "", issuingAuthority: "", expiresOn: null, notApplicable: false, ratePercent: "8.00", files: [], verification: null, lodgedBy: null, lodgedByOfficer: false, codes: [] },
    { id: "d3", typeName: "Other", hint: null, title: "Safety", reference: "", issuingAuthority: "", expiresOn: null, notApplicable: true, ratePercent: null, files: [], verification: null, lodgedBy: null, lodgedByOfficer: false, codes: [] },
  ],
  creditor: sulitGranted<SummaryCreditor | null>(creditor, "OWN_RECORD"),
  declarations: [{ kind: "GIRO_AUTHORISATION", textVersion: 2, signatoryName: "Aminah Binti Ali", signatoryDesignation: "Director", signedAt: "9 Oct 2026, 10:00", by: "the supplier's portal account", signatoryIsNotContact: false }],
  ...o,
});

const section = (r: SummaryRecord, key: string) => registrationSummary(r, fmt).find((s) => s.key === key)!;
const text = (r: SummaryRecord) => JSON.stringify(registrationSummary(r, fmt));

describe("the registration summary", () => {
  it("has the six sections, in the order the applicant reads them and the reviewer sees them", () => {
    expect(registrationSummary(record(), fmt).map((s) => s.key)).toEqual(["company", "contacts", "documents", "codes", "creditor", "declarations"]);
  });

  it("the registration number says 'format checked', never 'validated', and says it is not checked against the registrar", () => {
    const item = section(record(), "company").items.find((i) => i.label === "Registration number")!;
    expect(item.note).toBe("Format checked. It is not checked against the registrar's records.");
    expect(text(record())).not.toMatch(/validated/i);
    const unset = section(record({ company: { ...record().company, formatChecked: null } }), "company").items.find((i) => i.label === "Registration number")!;
    expect(unset.note).toContain("Format not checked: the office has not set one");
    expect(unset.tone).toBe("warn");
    const wrong = section(record({ company: { ...record().company, formatChecked: false } }), "company").items.find((i) => i.label === "Registration number")!;
    expect(wrong.tone).toBe("err");
  });

  it("the company email is 'not verified', and ownership is not in the summary", () => {
    const company = section(record(), "company");
    expect(company.items.find((i) => i.label === "Company email")!.note).toContain("Not verified");
    expect(text(record())).not.toMatch(/ownership|100% local/i);
  });

  it("the Bumiputera status is declared, with the evidence document's reference and whether it is verified", () => {
    const item = section(record(), "company").items.find((i) => i.label === "Bumiputera status")!;
    expect(item.value).toBe("Declared: Bumiputera company · STB-9912 · not verified");
    const noDoc = section(record({ company: { ...record().company, bumiputera: bumiputeraReading("Bumiputera company", true, null, "REGISTER") } }), "company").items.find((i) => i.label === "Bumiputera status")!;
    expect(noDoc.tone).toBe("warn");
    expect(noDoc.note).toContain("no evidence document");
  });

  it("a document shows its expiry, 'Not scanned', who lodged it and whether an officer verified it, with the officer and day", () => {
    const d1 = section(record(), "documents").items[0]!;
    expect(d1.label).toBe("Works board certificate");
    expect(d1.value).toContain("Expires day:2027-06-30");
    expect(d1.value).toContain("Reference WB-1");
    expect(d1.note).toContain("wb.pdf (Not scanned)");
    expect(d1.note).toContain("Lodged by the supplier's own portal account");
    expect(d1.note).toContain("Checked and in order, by An Officer, day:2026-10-09");
    expect(d1.tone).toBe("ok");
  });

  it("a rate is shown, a missing expiry and file are said, and a title and 'does not apply' show", () => {
    const items = section(record(), "documents").items;
    expect(items[1]!.value).toContain("No expiry date given");
    expect(items[1]!.value).toContain("Rate 8.00%");
    expect(items[1]!.note).toContain("No file");
    expect(items[2]).toEqual({ label: "Other · Safety", value: "Does not apply" });
  });

  it("codes always read as 'code — name', grouped on the certificate they come from", () => {
    expect(section(record(), "codes").items).toEqual([{ label: "Works board certificate", value: "G3 — Grade 3; B — Buildings" }]);
    expect(section(record({ documents: [] }), "codes").empty).toBe("No code has been chosen.");
  });

  it("a creditor profile granted shows the names of the bank and the account type, the statement and 'not scanned'", () => {
    const items = section(record(), "creditor").items;
    expect(items.find((i) => i.label === "Bank")!.value).toBe("Demonstration Bank");
    expect(items.find((i) => i.label === "Account type")!.value).toBe("Current account");
    expect(items.find((i) => i.label === "Account number")!.value).toBe("1234567890");
    expect(items.find((i) => i.label === "Bank statement")!.note).toBe("Not scanned for malware.");
    expect(text(record())).not.toContain("bank-a");
    expect(text(record())).not.toContain('"current"');
  });

  it("a creditor profile withheld shows the reason in words and none of its values", () => {
    const withheld = sulitWithheld<SummaryCreditor | null>("NOT_NAMED_PERMISSION_UNDECIDED", "creditorProfile");
    const s = section(record({ creditor: withheld }), "creditor");
    expect(s.items).toEqual([]);
    expect(s.withheld?.en).toContain("You hold no step on this registration's approval route");
    const all = text(record({ creditor: withheld }));
    for (const secret of ["1234567890", "Demonstration Bank", "accounts@example.invalid", "2 Demonstration Street", "Demonstration Contractors\""]) expect(all).not.toContain(secret);
  });

  it("contacts withheld show the reason and no name", () => {
    const withheld = sulitWithheld<never>("NOT_NAMED_PERMISSION_UNDECIDED", "supplier");
    const s = section(record({ contacts: withheld }), "contacts");
    expect(s.items).toEqual([]);
    expect(s.withheld?.en.length).toBeGreaterThan(10);
    expect(text(record({ contacts: withheld }))).not.toContain("Aminah Binti Ali\",\"designation");
  });

  it("no bank details entered yet is said, not shown as a blank", () => {
    expect(section(record({ creditor: sulitGranted<SummaryCreditor | null>(null, "OWN_RECORD") }), "creditor").empty).toBe("No bank details have been entered.");
  });

  it("a checked profile shows the check with the officer and day", () => {
    const checked = { ...creditor, verification: { state: "VERIFIED" as const, by: "Finance Officer", on: "2026-10-10", note: "Matches the statement" } };
    const item = section(record({ creditor: sulitGranted<SummaryCreditor | null>(checked, "NAMED_ON_RECORD") }), "creditor").items.find((i) => i.label === "Bank details")!;
    expect(item.value).toBe("Checked and in order, by Finance Officer, day:2026-10-10. “Matches the statement”");
    expect(item.tone).toBe("ok");
  });

  it("the declarations show the wording's version, the signatory and the server's time", () => {
    const [d] = section(record(), "declarations").items;
    expect(d).toEqual({ label: "GIRO authorisation", value: "Aminah Binti Ali, Director", note: "Signed 9 Oct 2026, 10:00 by the supplier's portal account · wording version 2" });
    expect(section(record({ declarations: [] }), "declarations").empty).toContain("signed when the registration is sent");
  });
});

describe("what the reviewer is told is flagged, and shown only where the reader may read it", () => {
  it("a signatory who is not the contact on the account is a warning on the declaration, and not otherwise", () => {
    const base = record().declarations[0]!;
    const flagged = section(record({ declarations: [{ ...base, signatoryName: "Someone Else", signatoryIsNotContact: true }] }), "declarations").items[0]!;
    expect(flagged.tone).toBe("warn");
    expect(flagged.note).toContain("not the contact on the account that sent the registration");
    const plain = section(record(), "declarations").items[0]!;
    expect(plain.tone).toBeUndefined();
    expect(plain.note).not.toContain("not the contact");
  });

  it("a beneficiary number that is not the company's is a warning on that field of the bank details, and not otherwise", () => {
    const item = (c: SummaryCreditor) => section(record({ creditor: sulitGranted<SummaryCreditor | null>(c, "NAMED_ON_RECORD") }), "creditor").items.find((i) => i.label === "Identity card or company number")!;
    expect(item({ ...creditor, identityDiffersFromCompany: true })).toMatchObject({ tone: "warn", note: expect.stringContaining("not the company's registration number") });
    expect(item(creditor).tone).toBeUndefined();
  });

  it("a reader the bank details are withheld from is told nothing of the number: the flag is inside the section they cannot see", () => {
    const withheld = record({ creditor: sulitWithheld<SummaryCreditor | null>("NOT_NAMED_PERMISSION_UNDECIDED", "creditorProfile") });
    expect(section(withheld, "creditor").items).toEqual([]);
    expect(JSON.stringify(registrationSummary(withheld, fmt))).not.toMatch(/not the company's registration number/);
  });
});

describe("the supplier's own copy of a sent registration", () => {
  const sent = () =>
    record({
      documents: [{ ...record().documents[0]!, lodgedBy: "Officer Hamidah Binti Razak", lodgedByOfficer: true, verification: { state: "NOT_IN_ORDER", by: "Officer Zainal Abidin", on: "2026-10-09", note: "The seal looks altered, ask the board" } }],
      creditor: sulitGranted<SummaryCreditor | null>({ ...creditor, verification: { state: "VERIFIED", by: "Officer Zainal Abidin", on: "2026-10-10", note: "Account number did not match the first statement" } }, "OWN_RECORD"),
    });

  it("carries the state and the day of the office's checks and no officer's name or note", () => {
    const text = JSON.stringify(registrationSummary(forSupplier(sent()), fmt));
    for (const leaked of ["Hamidah", "Zainal", "seal looks altered", "did not match the first statement"]) expect(text, leaked).not.toContain(leaked);
    expect(text).toContain("Checked and found not in order, day:2026-10-09");
    expect(text).toContain("Checked and in order, day:2026-10-10");
    expect(text).toContain("Lodged by the procurement office");
  });

  it("is what the reviewer's own projection is not: the officer's name and note are there for the office", () => {
    const text = JSON.stringify(registrationSummary(sent(), fmt));
    expect(text).toContain("Officer Zainal Abidin");
    expect(text).toContain("The seal looks altered");
  });

  it("leaves a document the supplier lodged itself as it was, and a withheld section as it was", () => {
    expect(forSupplier(record()).documents[0]!.lodgedBy).toBe("the supplier's own portal account");
    const withheld = record({ creditor: sulitWithheld<SummaryCreditor | null>("NOT_NAMED_PERMISSION_UNDECIDED", "creditorProfile") });
    expect(forSupplier(withheld).creditor).toEqual(withheld.creditor);
  });
});
