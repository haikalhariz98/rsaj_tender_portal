import { describe, expect, it } from "vitest";

import { ctx } from "@/lib/portal/registration/fixture";
import { registrationSummary } from "@/lib/portal/registration/summary";

import { body } from "./fixture";
import { summaryRecordOfHeld, summaryRecordOfPortal, type SummaryLists } from "./summary-record";

const lists: SummaryLists = {
  entityTypes: [{ code: "demo_private", nameEn: "Private company" }],
  countries: [{ code: "demo_home", nameEn: "Demonstration Country" }],
  states: [{ code: "demo_state", nameEn: "Demonstration State" }],
  bumiputeraStatuses: [],
  banks: [{ code: "bank-a", nameEn: "Demonstration Bank" }],
  accountTypes: [{ code: "current", nameEn: "Current account" }],
  formatPattern: null,
  bumiputeraEvidenceSet: false,
};
const fmt = { day: (d: string) => d };

describe("the applicant's review of what it holds (plan 2.2)", () => {
  const record = summaryRecordOfHeld(
    { body: body(), files: new Map([["new:reg", ["registry.pdf"]], ["new:works", ["board.pdf"]]]), statementFiles: ["statement.pdf"], chosen: new Map([["v-g1", { code: "G1", name: "Grade 1" }], ["v-b", { code: "B", name: "Buildings" }]]) },
    { ...lists, types: ctx().types },
  );

  it("names every code by its list, every file as not scanned, and nothing as verified or lodged by anyone", () => {
    expect(record.company).toMatchObject({ entityTypeName: "Private company", countryName: "Demonstration Country", addressLines: ["1 Demonstration Road", "10000 Demonstration City", "Demonstration State"], formatChecked: null });
    expect(record.documents.map((d) => [d.typeName, d.files, d.verification, d.lodgedBy, d.codes])).toEqual([
      ["Companies registry certificate", [{ name: "registry.pdf", scanLabel: "Not scanned" }], null, null, []],
      ["Works board certificate", [{ name: "board.pdf", scanLabel: "Not scanned" }], null, null, ["G1 — Grade 1", "B — Buildings"]],
    ]);
    expect(record.creditor).toMatchObject({ state: "GRANTED", value: { bankName: "Demonstration Bank", accountTypeName: "Current account", statementFiles: ["statement.pdf"], identityDiffersFromCompany: false, verification: null } });
    expect(record.declarations).toEqual([]);
  });

  it("renders through the one registration summary, with no code shown alone", () => {
    const text = JSON.stringify(registrationSummary(record, fmt));
    expect(text).toContain("G1 — Grade 1");
    expect(text).not.toMatch(/demo_private|demo_home|bank-a"/);
  });
});

describe("the officer's page reads the same projection (plan 2.2)", () => {
  it("names the applicant, not signed in, as the one who lodged and agreed, and holds the SULIT parts to the reader's answer", () => {
    const b = body();
    const record = summaryRecordOfPortal(
      {
        company: { ...b.company, ...b.company.address },
        contact: b.company.contact,
        documents: [{ id: "pd1", typeLabelSnapshot: "Companies registry certificate", hint: null, title: "", reference: "R-1", issuingAuthority: "An authority", expiresOn: "2027-06-30", notApplicable: false, ratePercent: null, files: [{ name: "registry.pdf", scanLabel: "Not scanned" }], verification: { state: "NOT_CHECKED", by: null, on: null, note: "" }, codes: [{ code: "G1", label: "Grade 1" }] }],
        creditor: { values: b.creditor, statementFiles: ["statement.pdf"], verification: { state: "NOT_CHECKED", by: null, on: null, note: "" } },
        agreements: [{ kind: "TERMS_AND_CONDITIONS", textVersion: 1, signatoryName: "Aminah Binti Ali", signatoryDesignation: "Director", signedAt: "9 Oct 2026, 10:00" }],
      },
      lists,
      { contacts: (value) => ({ state: "GRANTED", value, basis: "ORGANISATION_PERMISSION" }), creditor: () => ({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_NOT_HELD", scope: "creditorProfile", words: { en: "Withheld." } }) },
    );
    expect(record.documents[0]).toMatchObject({ lodgedBy: "Applicant, not signed in", lodgedByOfficer: false, codes: ["G1 — Grade 1"] });
    expect(record.declarations[0]).toMatchObject({ by: "Applicant, not signed in", signatoryIsNotContact: false, agreedNotSignedIn: true });
    // Plan 6.3.2: an applicant's agreement is never called a signature. "Agreed", the name as typed, the wording's version, and the chip.
    const agreements = registrationSummary(record, fmt).find((x) => x.key === "declarations")!;
    expect(agreements.items).toEqual([{ label: "Terms and conditions", value: "Aminah Binti Ali, Director", note: "Agreed 9 Oct 2026, 10:00 · Aminah Binti Ali · wording version 1", chip: "Unverified; not signed in" }]);
    expect(JSON.stringify(agreements)).not.toMatch(/[Ss]igned (?!in)/);
    expect(record.creditor.state).toBe("WITHHELD");
    expect(JSON.stringify(record.creditor)).not.toContain(b.creditor.bankAccountNo);
  });
});
