import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import { SUPPLIER_ENTITY, SUPPLIER_ENTITY_LABEL, SUPPLIER_FIELD_NAME } from "./audit-view";
import { buildSupplierExport, ExportFileNameError, exportAuditChanges, exportFileName, exportJson, exportSectionCounts, type ExportRow, type SourceRow, type SupplierExport, type SupplierExportSource } from "./data-export";
import { classificationFaults, EXPORT_COLUMNS, inColumns, OUT_MODELS, pickIn, schemaScalars, supplierLinkedModels, type Classified, type ExportModel } from "./data-export-fields";
import * as WORDS from "./data-export-words";

const SCHEMA = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const SENTINEL = "SENTINEL";

/// A row of `model` with a sentinel in every OUT column and the given IN values: whatever leaks, the test sees it.
function fixture(model: ExportModel, values: Record<string, unknown>): SourceRow {
  const r: Record<string, unknown> = {};
  for (const [column, c] of Object.entries(EXPORT_COLUMNS[model] as Record<string, unknown>)) r[column] = c === "IN" ? values[column] : `${SENTINEL}·${model}.${column}`;
  for (const column of Object.keys(values)) if (!(column in r)) throw new Error(`fixture: ${model}.${column} is not a column`);
  return r;
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const t = (s: string) => new Date(s);

/// Distinctive list codes, so a code that leaks is found by its text.
const CODES = { entity: "ET-SDNBHD", country: "CC-MY", state: "ST-SEL", bumi: "BC-BUMI", bank: "BK-MBB", accountType: "AT-CUR" };

function source(over: Partial<SupplierExportSource> = {}): SupplierExportSource {
  return {
    organisationName: "Demonstration Authority",
    accountId: "acc-aminah",
    supplier: fixture("Supplier", {
      reference: "SUP-0042",
      registeredName: "Syarikat Contoh Sdn Bhd",
      registrationNo: "201901000123",
      entityTypeCode: CODES.entity,
      countryCode: CODES.country,
      registeredAddress: "12 Jalan Contoh, 40000 Shah Alam",
      addressLine1: "12 Jalan Contoh",
      addressLine2: "",
      city: "Shah Alam",
      postcode: "40000",
      stateCode: CODES.state,
      bumiputeraClaimCode: CODES.bumi,
      incorporatedOn: d("2019-03-01"),
      companyEmail: "info@contoh.example",
      status: "REGISTERED",
      registeredOn: d("2026-05-04"),
    }),
    lists: {
      entityType: { [CODES.entity]: "Private limited company" },
      country: { [CODES.country]: "Malaysia" },
      state: { [CODES.state]: "Selangor" },
      bumiputeraClaim: { [CODES.bumi]: "Bumiputera" },
      bank: { [CODES.bank]: "Maybank" },
      bankAccountType: { [CODES.accountType]: "Current account" },
    },
    contacts: [
      {
        open: true,
        row: fixture("SupplierContact", { name: "Aminah binti Ali", designation: "Director", email: "aminah@contoh.example", phone: "03-5555 0101", isPrimary: true }),
        account: { ...fixture("SupplierAccount", { loginName: "aminah.ali", passwordChangedAt: t("2026-06-01T02:00:00Z"), status: "ACTIVE", lastSignInAt: t("2026-10-18T01:30:00Z"), disabledAt: null, createdAt: t("2026-05-05T03:00:00Z") }), id: "acc-aminah" },
      },
      {
        open: false,
        row: fixture("SupplierContact", { name: "CLOSED-contact-name", designation: "CLOSED-designation", email: "closed@contoh.example", phone: "CLOSED-phone", isPrimary: false }),
        account: { ...fixture("SupplierAccount", { loginName: "CLOSED-login-name", passwordChangedAt: t("2026-06-01T02:00:00Z"), status: "ACTIVE", lastSignInAt: null, disabledAt: null, createdAt: t("2026-05-05T03:00:00Z") }), id: "acc-closed" },
      },
    ],
    declarations: [
      fixture("RegistrationDeclaration", {
        kind: "FALSE_DECLARATION",
        textVersion: 3,
        frozenTextEn: "I declare that the information given is true.",
        frozenTextMs: "Saya mengaku bahawa maklumat yang diberi adalah benar.",
        signatoryName: "Aminah binti Ali",
        signatoryDesignation: "Director",
        signedOn: d("2026-04-20"),
        signedAt: t("2026-04-20T04:15:00Z"),
      }),
    ],
    bank: [
      { row: bankRow(1, "VERIFIED", "SUPERSEDED-v1-beneficiary", `${SENTINEL}-v1-note`), files: [] },
      { row: bankRow(2, "VERIFIED", "Syarikat Contoh Sdn Bhd", `${SENTINEL}-v2-verified-note`), files: [versionRow("ver-bank-2", "statement.pdf")] },
      { row: bankRow(3, "NOT_IN_ORDER", "Syarikat Contoh", "The account name does not match the statement."), files: [] },
    ],
    documents: [
      {
        row: docRow("SSM certificate", "VERIFIED", `${SENTINEL}-verified-doc-note`),
        values: [fixture("SupplierDocumentValue", { kind: "GRADE", codeSnapshot: "G7", labelSnapshot: "Grade 7: no limit" })],
        files: [versionRow("ver-doc-1", "ssm.pdf")],
      },
      { row: docRow("Bank statement", "NOT_IN_ORDER", "The copy is illegible."), values: [], files: [] },
      { row: docRow("Tax clearance", "NOT_CHECKED", `${SENTINEL}-unchecked-doc-note`), values: [], files: [] },
    ],
    standing: { title: "Active", tone: "ok", lines: [], meaning: "You may take part in an exercise." },
    standingChanges: [
      fixture("StandingEvent", { kind: "SUSPEND", reasonSnapshot: "Late renewal", effectiveOn: d("2026-07-01"), endsOn: null, offenceNo: null, periodMonths: null, bodyLabelSnapshot: "", externalReference: "", cancelsRegistrationOn: null, withdrawnAt: null }),
      fixture("StandingEvent", { kind: "REGISTRATION_CANCELLED", reasonSnapshot: `${SENTINEL}-cancellation-reason`, effectiveOn: d("2026-08-01"), endsOn: null, offenceNo: null, periodMonths: null, bodyLabelSnapshot: "The Registration Board", externalReference: "RB/2026/17", cancelsRegistrationOn: d("2026-08-01"), withdrawnAt: t("2026-08-10T05:00:00Z") }),
    ],
    applications: [
      {
        row: fixture("SupplierApplication", { kind: "NEW", receivedOn: d("2026-04-20"), channel: "PORTAL", declarationSignedOn: d("2026-04-20"), epaymentFormReceivedOn: null, status: "APPROVED", resubmitBy: null, submittedAt: t("2026-04-20T04:20:00Z") }),
        decisions: [
          { row: fixture("ApplicationDecision", { outcome: "RESUBMIT", remarks: "Send a clearer copy of the SSM certificate.", resubmitBy: d("2026-05-01"), decidedOn: d("2026-04-24") }), items: [fixture("ResubmissionItem", { labelSnapshot: "SSM certificate", remarks: "Illegible" })] },
          { row: fixture("ApplicationDecision", { outcome: "APPROVE", remarks: "", resubmitBy: null, decidedOn: d("2026-05-04") }), items: [] },
        ],
      },
    ],
    purchases: [
      {
        exerciseName: "Supply of office furniture",
        row: fixture("DocumentPurchase", { createdAt: t("2026-09-01T02:00:00Z"), amount: new Prisma.Decimal("50"), state: "PAID", paidAt: t("2026-09-01T02:05:00Z"), paidChannel: "SIMULATED", paidMethod: "FPX", paidReference: "PAY-0001" }),
        attempts: [fixture("PaymentAttempt", { attemptNo: 1, method: "FPX", outcome: "PAID", reference: "PAY-0001", failureText: "", attemptedAt: t("2026-09-01T02:05:00Z") })],
        downloads: [fixture("PurchaseDownload", { kind: "FILE", packVersion: 1, partLabel: "Part A", title: "Conditions of tender", downloadedAt: t("2026-09-01T02:10:00Z") })],
      },
    ],
    bidReceipts: [{ row: fixture("OnlineBid", { kind: "BID", status: "SUBMITTED", statusAt: null, receiptDigest: "ab12cd34" }), exerciseName: "Supply of office furniture", receivedAt: t("2026-09-20T01:00:00Z"), late: false, keyFingerprint: "KF-1234" }],
    ...over,
  };
}

function bankRow(version: number, verification: string, beneficiaryName: string, verificationNote: string): SourceRow {
  return fixture("CreditorProfile", {
    version,
    beneficiaryName,
    beneficiaryAddress: "12 Jalan Contoh",
    beneficiaryIdentityNo: "201901000123",
    beneficiaryContactPerson: "Aminah binti Ali",
    beneficiaryTelephone: "03-5555 0101",
    beneficiaryFax: "",
    beneficiaryTaxRegistrationNo: "C1234567890",
    beneficiaryEmail: "finance@contoh.example",
    bankCode: CODES.bank,
    bankAccountNo: `5123456789${version}`,
    bankAccountTypeCode: CODES.accountType,
    bankSwiftCode: "MBBEMYKL",
    bankAddress: "Shah Alam",
    submittedAt: t(`2026-0${version + 3}-01T02:00:00Z`),
    verification,
    verifiedOn: d(`2026-0${version + 3}-03`),
    verificationNote,
  });
}

function docRow(typeLabelSnapshot: string, verification: string, verificationNote: string): SourceRow {
  return fixture("SupplierDocument", {
    typeLabelSnapshot,
    reference: "REF-1",
    issuingAuthority: "Companies Commission",
    title: "",
    issuedOn: d("2026-01-02"),
    validFrom: d("2026-01-02"),
    expiresOn: d("2027-01-01"),
    notApplicable: false,
    ratePercent: null,
    lodgedOn: d("2026-04-20"),
    verification,
    verifiedOn: d("2026-04-24"),
    verificationNote,
  });
}

function versionRow(id: string, originalFilename: string): SourceRow {
  return fixture("DocumentVersion", { id, byteSize: BigInt(20480), mediaType: "application/pdf", originalFilename, storedAt: t("2026-04-20T04:00:00Z") });
}

const CTX = { generatedAt: t("2026-10-19T03:00:00Z"), timeZone: "Asia/Kuala_Lumpur", officeName: "Demonstration Procurement Office" };
const build = (over: Partial<SupplierExportSource> = {}) => buildSupplierExport(source(over), CTX);
const section = (e: SupplierExport, key: string) => e.sections.find((s) => s.key === key)!;
const label = (r: ExportRow) => r.label;
const find = (rows: readonly ExportRow[], en: string) => rows.find((r) => label(r) === en);
const en = (v: ExportRow["value"] | undefined) => v ?? null;

function walkRows(rows: readonly ExportRow[], visit: (r: ExportRow) => void) {
  for (const r of rows) {
    visit(r);
    walkRows(r.rows ?? [], visit);
  }
}

describe("the allow-list against the schema (pins a and b)", () => {
  it("reads a model's scalars from schema text: enums, lists and Unsupported count, relations and attributes do not", () => {
    const text = `model A {\n  id String @id\n  /// a comment\n  // another\n  b B @relation(fields: [bId], references: [id])\n  bId String\n  tags String[]\n  state Kind @default(X)\n  xact Unsupported("xid8")?\n  bs B[]\n\n  @@index([bId])\n}\nmodel B {\n  id String\n}\nenum Kind {\n  X\n}`;
    expect(schemaScalars(text).get("A")).toEqual(["id", "bId", "tags", "state", "xact"]);
  });

  it("finds the models with a field typed Supplier, SupplierAccount or SupplierContact, and not a list of them", () => {
    const text = `model Organisation {\n  suppliers Supplier[]\n}\nmodel A {\n  s Supplier? @relation(fields: [sId], references: [id])\n}\nmodel B {\n  by SupplierAccount @relation("X", fields: [byId], references: [id])\n}\nmodel C {\n  c SupplierContact\n}\nmodel D {\n  supplierName String\n}`;
    expect(supplierLinkedModels(text)).toEqual(["A", "B", "C"]);
  });

  it("(a) classifies every scalar of each exported model, and nothing the schema lacks; (b) lists every supplier-linked model", () => {
    expect(classificationFaults(SCHEMA)).toEqual([]);
  });

  it("(a) fails when a classified column's entry is removed", () => {
    const rest: Record<string, Classified> = { ...EXPORT_COLUMNS.Supplier };
    delete rest.reference;
    expect(classificationFaults(SCHEMA, { ...EXPORT_COLUMNS, Supplier: rest })).toContain("Supplier.reference: not classified");
  });

  it("(a) fails when the schema gains an unclassified Supplier scalar", () => {
    const scratch = SCHEMA.replace(/^model Supplier \{\n/m, "model Supplier {\n  newSecret String\n");
    expect(scratch).not.toBe(SCHEMA);
    expect(classificationFaults(scratch)).toContain("Supplier.newSecret: not classified");
  });

  it("(a) fails when a classified column is not in the schema", () => {
    expect(classificationFaults(SCHEMA, { ...EXPORT_COLUMNS, Supplier: { ...EXPORT_COLUMNS.Supplier, ghost: "IN" } })).toContain("Supplier.ghost: classified, not in the schema");
  });

  it("(b) fails on a new supplier-linked model in neither list, on a listed model the schema lacks, and on one in both lists", () => {
    const scratch = `${SCHEMA}\nmodel NewSupplierThing {\n  id String @id\n  supplier Supplier @relation(fields: [supplierId], references: [id])\n  supplierId String\n}\n`;
    expect(classificationFaults(scratch)).toContain("NewSupplierThing: names a supplier, in neither list");
    expect(classificationFaults(SCHEMA, EXPORT_COLUMNS, { ...OUT_MODELS, GhostModel: "SECRET" })).toContain("GhostModel: listed OUT, not a model in the schema");
    expect(classificationFaults(SCHEMA, EXPORT_COLUMNS, { ...OUT_MODELS, Supplier: "SECRET" })).toContain("Supplier: both classified and listed OUT");
  });

  it("names the OUT columns the plan requires as OUT", () => {
    const outs: [ExportModel, string[]][] = [
      ["Supplier", ["registrationNoKey", "erpVendorCode", "erpSyncedAt"]],
      ["SupplierAccount", ["passwordHash", "loginKey", "failedAttempts", "lockedUntil", "mustChangePassword", "resetNoticePending", "disabledReason"]],
      ["SupplierDocument", ["note", "verifiedByPersonId", "recordedByPersonId"]],
      ["StandingEvent", ["note", "checklist", "flaggedDocumentIds", "withdrawnReason", "recordedByPersonId", "withdrawnByPersonId"]],
      ["ApplicationDecision", ["policySnapshot", "decidedByPersonId"]],
      ["DocumentPurchase", ["checks", "receiptRecordedByPersonId"]],
      ["OnlineBid", ["sealedManifest", "manifestDek", "sealedDeclaration", "declarationDek", "manifestCipherSha256", "declarationCipherSha256", "keyId", "insertedXact", "statusXact"]],
    ];
    for (const [model, columns] of outs) for (const c of columns) expect((EXPORT_COLUMNS[model] as Record<string, unknown>)[c], `${model}.${c}`).not.toBe("IN");
  });

  it("selects the IN columns only, and a row is cut down to them", () => {
    expect(inColumns("SupplierAccount")).toEqual({ loginName: true, passwordChangedAt: true, status: true, lastSignInAt: true, disabledAt: true, createdAt: true });
    expect(pickIn("SupplierAccount", { loginName: "a", passwordHash: "x", loginKey: "y", stray: "z" })).toEqual({ loginName: "a" });
  });
});

describe("what never leaves", () => {
  it("no OUT column's sentinel is in the file or in the audit changes", () => {
    const e = build();
    const json = exportJson(e);
    expect(json).not.toContain(SENTINEL);
    expect(JSON.stringify(exportAuditChanges(e, "FILE", "f".repeat(64)))).not.toContain(SENTINEL);
    expect(JSON.stringify(exportAuditChanges(e, "PAGE", null))).not.toContain(SENTINEL);
  });

  it("the audit changes carry the form, the section counts and the digest, and no exported value", () => {
    const e = build();
    const changes = exportAuditChanges(e, "FILE", "a".repeat(64));
    expect(changes.map((c) => c.field)).toEqual(["exportForm", "exportSections", "exportDigest"]);
    expect(changes.every((c) => c.before === null)).toBe(true);
    const text = JSON.stringify(changes);
    for (const value of ["Syarikat Contoh", "SUP-0042", "aminah", "5123456789", "Late renewal", "Supply of office furniture", "ab12cd34"]) expect(text).not.toContain(value);
    expect(exportAuditChanges(e, "PAGE", null).map((c) => c.field)).toEqual(["exportForm", "exportSections"]);
    for (const f of ["exportForm", "exportSections", "exportDigest"]) expect(SUPPLIER_FIELD_NAME[f]).toBeTruthy();
  });

  it("is audited as its own entity on the supplier's History", () => {
    expect(SUPPLIER_ENTITY.dataExport).toBe("SupplierDataExport");
    expect(SUPPLIER_ENTITY_LABEL.SupplierDataExport.en).toBe("Data export");
  });
});

describe("the gated columns", () => {
  it("a verification note is shown only where the office found the item not in order", () => {
    const e = build();
    const docs = section(e, "documents").rows;
    expect(docs.map((r) => en(r.value))).toEqual(["SSM certificate", "Bank statement", "Tax clearance"]);
    expect(en(find(docs[1].rows!, "Why it was not in order")?.value)).toBe("The copy is illegible.");
    expect(find(docs[0].rows!, "Why it was not in order")).toBeUndefined();
    expect(find(docs[2].rows!, "Why it was not in order")).toBeUndefined();
    const bank = section(e, "bank").rows;
    expect(en(find(bank.find((r) => r.value === "3")!.rows!, "Why it was not in order")?.value)).toBe("The account name does not match the statement.");
    expect(find(bank.find((r) => r.value === "2")!.rows!, "Why it was not in order")).toBeUndefined();
  });

  it("a sign-in name is shown only for a contact open to the reader (ruling 1875(7)); a closed contact is withheld whole", () => {
    const e = build();
    const json = exportJson(e);
    expect(json).toContain("aminah.ali");
    for (const closed of ["CLOSED-login-name", "CLOSED-contact-name", "closed@contoh.example", "CLOSED-phone", "CLOSED-designation"]) expect(json).not.toContain(closed);
    const accounts = section(e, "accounts").rows;
    expect(accounts.map((r) => en(r.value))).toEqual(["Aminah binti Ali", WORDS.CONTACT_WITHHELD]);
    expect(accounts[1].rows).toBeUndefined();
    expect(en(section(e, "contacts").rows[1].value)).toBe(WORDS.CONTACT_WITHHELD);
  });

  it("a colleague's account is its name and status only: its sign-in name and times are the reader's own (N2 review, decisions log 2026-10-19)", () => {
    const src = source();
    const e = buildSupplierExport({ ...src, contacts: [src.contacts[0], { ...src.contacts[1], open: true }] }, CTX);
    const accounts = section(e, "accounts").rows;
    expect(accounts[0].rows!.map(label)).toEqual(expect.arrayContaining(["Sign-in name", "Password last changed", "Last signed in"]));
    expect(accounts[1].rows!.map(label)).toEqual(["Account status", "Opened"]);
    expect(exportJson(e)).not.toContain("CLOSED-login-name");
  });

  it("an account with its contact open but no account shows no account row", () => {
    const src = source();
    const e = buildSupplierExport({ ...src, contacts: [{ ...src.contacts[0], account: null }] }, CTX);
    expect(section(e, "accounts").rows).toEqual([]);
  });

  it("bank details are the bank tab's set only: in force, waiting, not in order; a superseded version is left out", () => {
    const e = build();
    expect(section(e, "bank").rows.map((r) => r.value)).toEqual(["2", "3"]);
    expect(exportJson(e)).not.toContain("SUPERSEDED-v1");
    const waiting = buildSupplierExport({ ...source(), bank: [{ row: bankRow(1, "VERIFIED", "A", ""), files: [] }, { row: bankRow(2, "NOT_CHECKED", "B", ""), files: [] }] }, CTX);
    expect(section(waiting, "bank").rows.map((r) => [r.value, en(find(r.rows!, "Where it stands")!.value)])).toEqual([
      ["1", "In force"],
      ["2", "Waiting for the office to check"],
    ]);
  });

  it("a cancellation's reason is blanked, as standingEventFacts reads it; its body and reference are shown", () => {
    const rows = section(build(), "standingChanges").rows;
    expect(find(rows[0].rows!, "Reason")?.value).toBe("Late renewal");
    expect(find(rows[1].rows!, "Reason")).toBeUndefined();
    expect(find(rows[1].rows!, "Cancelled by")?.value).toBe("The Registration Board");
  });
});

describe("files, codes and dates", () => {
  it("no file path carries a form token", () => {
    const e = build();
    const files: string[] = [];
    for (const s of e.sections) walkRows(s.rows, (r) => files.push(...(r.files ?? []).map((f) => f.path)));
    expect(files).toEqual(["/supplier/registration/file?id=ver-bank-2", "/supplier/registration/file?id=ver-doc-1"]);
    for (const p of files) expect(p).not.toMatch(/[?&]t=/);
    expect(exportJson(e)).not.toMatch(/[?&]t=/);
  });

  it("no configuration code and no enumerated value's code is a value: they are labels", () => {
    const e = build();
    const json = exportJson(e);
    for (const code of Object.values(CODES)) expect(json).not.toContain(code);
    const enumValues = new Set([...SCHEMA.matchAll(/^enum \w+ \{([^}]*)\}/gm)].flatMap((m) => m[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l))));
    expect(enumValues.has("NOT_IN_ORDER")).toBe(true);
    const values: string[] = [];
    for (const s of e.sections) walkRows(s.rows, (r) => (r.value == null ? undefined : values.push(r.value)));
    expect(values.filter((v) => enumValues.has(v))).toEqual([]);
    expect(find(section(e, "company").rows[0].rows!, "Entity type")?.value).toBe("Private limited company");
  });

  it("a code no longer on its list is said to be so, never shown", () => {
    const src = source();
    const e = buildSupplierExport({ ...src, supplier: { ...src.supplier, stateCode: "ST-GONE" } }, CTX);
    expect(find(section(e, "company").rows[0].rows!, "State")?.value).toEqual(WORDS.NOT_ON_LIST);
    expect(exportJson(e)).not.toContain("ST-GONE");
  });

  it("days are YYYY-MM-DD and moments ISO instants; money is the Decimal as written", () => {
    const e = build();
    expect(e.generatedAt).toBe("2026-10-19T03:00:00.000Z");
    const company = section(e, "company").rows[0].rows!;
    expect(find(company, "Date incorporated")?.value).toBe("2019-03-01");
    const decl = section(e, "declarations").rows[0].rows!;
    expect(find(decl, "Signed on")?.value).toBe("2026-04-20");
    expect(find(decl, "Signed at")?.value).toBe("2026-04-20T04:15:00.000Z");
    // ADR 0041 D4: only the terms row carries the Personal Data Notice agreed with it.
    expect(find(decl, "Personal Data Notice, as agreed")).toBeUndefined();
    const withTerms = build({ declarations: [...source().declarations, fixture("RegistrationDeclaration", { kind: "TERMS_AND_CONDITIONS", textVersion: 1, frozenTextEn: "These are the terms.", frozenTextMs: "", signatoryName: "Aminah binti Ali", signatoryDesignation: "Director", signedOn: d("2026-04-20"), signedAt: t("2026-04-20T04:15:00Z"), noticeFrozenEn: "We keep your details to check the registration." })] });
    const terms = section(withTerms, "declarations").rows.find((r) => r.value === "Terms and conditions")!.rows!;
    expect(find(terms, "Personal Data Notice, as agreed")?.value).toBe("We keep your details to check the registration.");
    // ADR 0041 D3, D4: an agreement made on the public form, with the online application and no account, reads as agreed by the name as typed, never as signed; the keys are read, never written.
    const online = { ...fixture("RegistrationDeclaration", { kind: "FALSE_DECLARATION", textVersion: 2, frozenTextEn: "What we tell you is true.", frozenTextMs: "", signatoryName: "Siti Rehearsal", signatoryDesignation: "Director", signedOn: d("2026-10-21"), signedAt: t("2026-10-21T03:00:00Z") }), portalApplicationId: "pa_1", signedBySupplierAccountId: null };
    const agreed = section(build({ declarations: [online] }), "declarations").rows[0]!.rows!;
    expect(find(agreed, "Agreed by (as typed, not signed in)")?.value).toBe("Siti Rehearsal");
    expect(find(agreed, "Position, as typed")?.value).toBe("Director");
    expect(find(agreed, "Agreed on")?.value).toBe("2026-10-21");
    expect(find(agreed, "Agreed at")?.value).toBe("2026-10-21T03:00:00.000Z");
    expect(agreed.map((r) => r.label).join(" ")).not.toMatch(/Sign/);
    expect(JSON.stringify(agreed)).not.toContain("pa_1");
    const purchase = section(e, "purchases").rows[0].rows!;
    expect(find(purchase, "Amount (RM)")?.value).toBe("50.00");
    const values: string[] = [];
    for (const s of e.sections) walkRows(s.rows, (r) => typeof r.value === "string" && values.push(r.value));
    for (const v of values.filter((x) => /^\d{4}-\d{2}-\d{2}/.test(x))) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/);
    expect(exportJson(e)).not.toMatch(/GMT|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /);
  });
});

describe("the file", () => {
  it("is LF with a trailing newline, keys stable, and parses back to the export", () => {
    const e = build();
    const json = exportJson(e);
    expect(json.endsWith("}\n")).toBe(true);
    expect(json).not.toContain("\r");
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(e)));
    expect(Object.keys(JSON.parse(json))).toEqual(["format", "version", "generatedAt", "organisation", "supplier", "sections", "leftOut"]);
    expect(exportJson(build())).toBe(json);
  });

  it("is named for the supplier and the day, and refuses a day that is not one", () => {
    const e = build();
    expect(exportFileName(e, "2026-10-19")).toBe("supplier-data-SUP-0042-2026-10-19.json");
    expect(exportFileName({ ...e, supplier: { ...e.supplier, reference: "SUP/0042 x" } }, "2026-10-19")).toBe("supplier-data-SUP-0042-x-2026-10-19.json");
    expect(() => exportFileName(e, "19/10/2026")).toThrow(ExportFileNameError);
  });

  it("says what it leaves out and how to ask the office, by the office's configured name or the portal's own wording, never an address", () => {
    const e = build();
    expect(e.leftOut).toEqual(["Office internal notes are not included. Ask Demonstration Procurement Office, quoting SUP-0042."]);
    const blank = buildSupplierExport(source(), { ...CTX, officeName: "  " });
    expect(blank.leftOut).toEqual(["Office internal notes are not included. Ask the procurement office, quoting SUP-0042."]);
    for (const l of [...e.leftOut, ...blank.leftOut]) expect(l.includes("@") || l.includes("http")).toBe(false);
  });
});

describe("the words", () => {
  it("the export is English only (founder, 2026-10-19): every label, title and value is a plain non-empty string", () => {
    const e = build();
    const seen: string[] = [];
    for (const s of e.sections) {
      expect(typeof s.title).toBe("string");
      walkRows(s.rows, (r) => {
        expect(typeof r.label).toBe("string");
        expect(r.value === null || typeof r.value === "string").toBe(true);
        seen.push(r.label);
      });
    }
    expect(seen.length).toBeGreaterThan(50);
    expect(seen.filter((x) => !x.trim())).toEqual([]);
    expect(exportJson(e)).not.toMatch(/"(?:en|ms)":/);
    expect(e.version).toBe(2);
  });
});

describe("a worked example a finance person can check by hand", () => {
  it("SUP-0042's export: what each section holds", () => {
    // Syarikat Contoh: one company record; two contacts (one not open to this account, withheld); two accounts likewise; one
    // declaration; bank details version 2 in force and version 3 not in order (version 1 superseded, left out); three documents;
    // its current standing; two changes to it; one application; one exercise bought from at RM 50.00; one online bid.
    const e = build();
    expect(exportSectionCounts(e)).toEqual({ company: 1, contacts: 2, accounts: 2, declarations: 1, bank: 2, documents: 3, standing: 1, standingChanges: 2, applications: 1, purchases: 1, bidReceipts: 1 });
    expect(exportAuditChanges(e, "PAGE", null)[1].after).toBe(
      "Company: 1 · Contacts: 2 · Portal accounts: 2 · Declarations and agreements: 1 · Bank details: 2 · Documents: 3 · Current standing: 1 · Changes to your standing: 2 · Applications and outcomes: 1 · Tender document purchases: 1 · Online bid receipts: 1",
    );
    const app = section(e, "applications").rows[0];
    expect(app.value).toBe("First registration");
    expect(app.rows!.filter((r) => label(r) === "Outcome").map((r) => en(r.value))).toEqual(["Resubmission requested", "Approved"]);
  });
});
