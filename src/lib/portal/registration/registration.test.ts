import { describe, expect, it } from "vitest";

import { codeFaults, codeSections } from "./codes";
import { creditorFaults } from "./creditor";
import { currentDeclarationText, declarationFaults, fillText, frozenWording, giroFaults, reviewFaults, type StoredDeclarationText } from "./declaration";
import { documentFaults, parseRate } from "./documents";
import { blockingFaults, draftShapeFaults, firstBlockedStep, registrationFaults, stepFaults } from "./faults";
import { creditor, ctx, doc, draft, type as docType, value } from "./fixture";
import type { DeclarationInput } from "./types";
import { hasRegistrationFaultText, registrationFaultText, uploadFaultText } from "./words";
import { uploadFault } from "./upload";

const blocks = (fs: { code: string; level: string }[]) => fs.filter((f) => f.level === "block").map((f) => f.code);

describe("a rate is a percentage with at most two places, never a float", () => {
  it("accepts a whole number, one place and two places, from nothing to a hundred", () => {
    expect(parseRate("8")).toBe("8.00");
    expect(parseRate("6.5")).toBe("6.50");
    expect(parseRate("0.05")).toBe("0.05");
    expect(parseRate("100")).toBe("100.00");
    expect(parseRate(" 12.34 ")).toBe("12.34");
  });
  it("refuses more than a hundred, three places, a sign, a comma, text and nothing", () => {
    for (const bad of ["100.01", "101", "1.234", "-1", "1,5", "six", "", "  ", "8%", ".5", "1000"]) expect(parseRate(bad), bad).toBeNull();
    expect(parseRate(null)).toBeNull();
  });
});

describe("step 2: the documents (FR-VND-002)", () => {
  it("a complete set has nothing in its way", () => {
    expect(blocks(documentFaults(draft().documents, ctx()))).toEqual([]);
  });

  it("every mandatory type must stand: a file on it, or not applicable where that is allowed", () => {
    const fs = documentFaults([doc({ id: "d-works", typeId: "t-works" })], ctx());
    expect(fs).toContainEqual(expect.objectContaining({ code: "DOCUMENT_REQUIRED", data: { type: "Companies registry certificate" } }));
    const na = documentFaults([doc({ id: "d1", typeId: "t-reg", notApplicable: true, fileCount: 0 }), doc({ id: "d-works", typeId: "t-works" })], ctx({ types: [docType({ id: "t-reg", nameEn: "Companies registry certificate", notApplicableAllowed: true }), docType({ id: "t-works", nameEn: "Works board certificate" })] }));
    expect(blocks(na)).toEqual([]);
    const notAllowed = documentFaults([doc({ id: "d1", typeId: "t-reg", notApplicable: true, fileCount: 0 }), doc({ id: "d-works", typeId: "t-works" })], ctx());
    expect(blocks(notAllowed)).toEqual(expect.arrayContaining(["NOT_APPLICABLE_NOT_ALLOWED", "DOCUMENT_REQUIRED"]));
  });

  it("a mandatory switch that is not set is said, and does not block", () => {
    const c = ctx({ types: [docType({ id: "t-reg", nameEn: "Companies registry certificate", mandatoryAtRegistration: null })] });
    const fs = documentFaults([], c);
    expect(fs).toEqual([{ step: "documents", code: "MANDATORY_NOT_SAID", level: "info", field: "type.t-reg", data: { type: "Companies registry certificate" } }]);
    expect(blocks(fs)).toEqual([]);
  });

  it("a row with no file is held, unless it does not apply", () => {
    expect(blocks(documentFaults([doc({ id: "d-reg", typeId: "t-reg", fileCount: 0 }), doc({ id: "d-works", typeId: "t-works" })], ctx()))).toContain("FILE_REQUIRED");
  });

  it("expiry: required when the type expires, already expired blocks, today counts as expired, and a type whose switch is not set only asks", () => {
    const required = documentFaults([doc({ id: "d-reg", typeId: "t-reg", expiresOn: null }), doc({ id: "d-works", typeId: "t-works" })], ctx());
    expect(blocks(required)).toEqual(["EXPIRY_REQUIRED"]);
    const today = documentFaults([doc({ id: "d-reg", typeId: "t-reg", expiresOn: "2026-10-09" }), doc({ id: "d-works", typeId: "t-works" })], ctx());
    expect(blocks(today)).toEqual(["ALREADY_EXPIRED"]);
    const tomorrow = documentFaults([doc({ id: "d-reg", typeId: "t-reg", expiresOn: "2026-10-10" }), doc({ id: "d-works", typeId: "t-works" })], ctx());
    expect(blocks(tomorrow)).toEqual([]);
    const notDay = documentFaults([doc({ id: "d-reg", typeId: "t-reg", expiresOn: "31/12/2027" }), doc({ id: "d-works", typeId: "t-works" })], ctx());
    expect(blocks(notDay)).toEqual(["EXPIRY_NOT_A_DAY"]);
    const unsetSwitch = ctx({ types: [docType({ id: "t-reg", nameEn: "Companies registry certificate", expires: null })] });
    const asked = documentFaults([doc({ id: "d-reg", typeId: "t-reg", expiresOn: null })], unsetSwitch);
    expect(asked).toEqual([{ step: "documents", code: "EXPIRES_NOT_SET", level: "warn", field: "documents.d-reg.expiresOn", data: { type: "Companies registry certificate" } }]);
    const unsetButExpired = documentFaults([doc({ id: "d-reg", typeId: "t-reg", expiresOn: "2020-01-01" })], unsetSwitch);
    expect(blocks(unsetButExpired)).toEqual(["ALREADY_EXPIRED"]);
  });

  it("a type that does not expire asks nothing of the date", () => {
    const c = ctx({ types: [docType({ id: "t-reg", nameEn: "Companies registry certificate", expires: false })] });
    expect(documentFaults([doc({ id: "d-reg", typeId: "t-reg", expiresOn: null })], c)).toEqual([]);
  });

  it("a type that records a rate needs a valid one", () => {
    const c = ctx({ types: [docType({ id: "t-sst", nameEn: "Sales tax certificate", recordsRate: true })] });
    expect(blocks(documentFaults([doc({ id: "d1", typeId: "t-sst", ratePercent: null })], c))).toEqual(["RATE_INVALID"]);
    expect(blocks(documentFaults([doc({ id: "d1", typeId: "t-sst", ratePercent: "101" })], c))).toEqual(["RATE_INVALID"]);
    expect(blocks(documentFaults([doc({ id: "d1", typeId: "t-sst", ratePercent: "6.5" })], c))).toEqual([]);
  });

  it("a type that does not record a rate asks none", () => {
    expect(blocks(documentFaults([doc({ id: "d-reg", typeId: "t-reg", ratePercent: "banana" }), doc({ id: "d-works", typeId: "t-works" })], ctx()))).toEqual([]);
  });

  it("a repeatable type needs a title on each, and the titles differ within the type", () => {
    const c = ctx({ types: [docType({ id: "t-other", nameEn: "Other", mandatoryAtRegistration: false, repeatable: true })] });
    expect(blocks(documentFaults([doc({ id: "a", typeId: "t-other", title: "" })], c))).toEqual(["TITLE_REQUIRED"]);
    const dup = documentFaults([doc({ id: "a", typeId: "t-other", title: "Safety" }), doc({ id: "b", typeId: "t-other", title: " safety " })], c);
    expect(dup).toContainEqual(expect.objectContaining({ code: "TITLE_DUPLICATE", field: "documents.b.title" }));
    expect(blocks(documentFaults([doc({ id: "a", typeId: "t-other", title: "Safety" }), doc({ id: "b", typeId: "t-other", title: "Quality" })], c))).toEqual([]);
  });

  it("a type that is not repeatable keeps one document", () => {
    const fs = documentFaults([doc({ id: "a", typeId: "t-reg" }), doc({ id: "b", typeId: "t-reg" }), doc({ id: "d-works", typeId: "t-works" })], ctx());
    expect(fs).toContainEqual(expect.objectContaining({ code: "DOCUMENT_DUPLICATE", field: "documents.b" }));
    const unset = ctx({ types: [docType({ id: "t-reg", nameEn: "X", repeatable: null })] });
    expect(blocks(documentFaults([doc({ id: "a", typeId: "t-reg" }), doc({ id: "b", typeId: "t-reg" })], unset))).toEqual(["DOCUMENT_DUPLICATE"]);
  });

  it("no document types configured closes the step, naming it", () => {
    expect(documentFaults([], ctx({ types: [] }))).toEqual([{ step: "documents", code: "DOCUMENT_TYPES_NOT_SET", level: "block" }]);
    expect(blocks(documentFaults([], ctx({ types: [docType({ id: "t", nameEn: "X", retired: true })] })))).toEqual(["DOCUMENT_TYPES_NOT_SET"]);
  });

  it("an unset time zone is said, not guessed", () => {
    expect(blocks(documentFaults(draft().documents, ctx({ today: null })))).toContain("TIME_ZONE_UNSET");
  });

  it("a document of a type that is retired or unknown is refused", () => {
    expect(blocks(documentFaults([doc({ id: "a", typeId: "t-gone" }), ...draft().documents], ctx()))).toEqual(["DOCUMENT_TYPE_UNKNOWN"]);
  });

  it("LHDN clearance and the non-blacklisting declaration are ordinary configured types: nothing in the rules names them", () => {
    const c = ctx({
      types: [
        docType({ id: "t-lhdn", nameEn: "Tax clearance", expires: true, mandatoryAtRegistration: false }),
        docType({ id: "t-akuan", nameEn: "Non-blacklisting declaration", expires: true, mandatoryAtRegistration: false }),
      ],
    });
    expect(documentFaults([doc({ id: "a", typeId: "t-lhdn", expiresOn: "2027-01-01" }), doc({ id: "b", typeId: "t-akuan", expiresOn: null })], c).filter((f) => f.level === "block").map((f) => f.field)).toEqual(["documents.b.expiresOn"]);
  });
});

describe("step 3: the work codes (FR-VND-003)", () => {
  const withValues = (ids: string[]) => [doc({ id: "d-reg", typeId: "t-reg" }), doc({ id: "d-works", typeId: "t-works", valueIds: ids })];

  it("a code on its body's certificate, of a kind it records, passes", () => {
    expect(blocks(codeFaults(withValues(["v-g1", "v-b"]), ctx()))).toEqual([]);
  });

  it("one grade only on a certificate, but several of the other kinds", () => {
    expect(blocks(codeFaults(withValues(["v-g1", "v-g2"]), ctx()))).toEqual(["ONE_GRADE_ONLY"]);
    const c = ctx({ values: [value({ id: "a", code: "A", nameEn: "A" , kind: "CATEGORY"}), value({ id: "b", code: "B", nameEn: "B", kind: "CATEGORY" })] });
    expect(blocks(codeFaults(withValues(["a", "b"]), c))).toEqual([]);
  });

  it("a retired code, an unknown one and one of another body or kind are refused", () => {
    const c = ctx({ values: [...ctx().values, value({ id: "v-old", code: "X", nameEn: "Old", retired: true }), value({ id: "v-other", code: "Z", nameEn: "Elsewhere", bodyId: "body-2" }), value({ id: "v-class", code: "C", nameEn: "A class", kind: "CLASS" })] });
    expect(blocks(codeFaults(withValues(["v-old"]), c))).toEqual(["VALUE_RETIRED"]);
    expect(blocks(codeFaults(withValues(["v-nobody"]), c))).toEqual(["VALUE_UNKNOWN"]);
    expect(blocks(codeFaults(withValues(["v-other"]), c))).toEqual(["VALUE_NOT_FOR_DOCUMENT"]);
    expect(blocks(codeFaults(withValues(["v-class"]), c))).toEqual(["VALUE_NOT_FOR_DOCUMENT"]);
  });

  it("a code on a certificate whose type records none is refused", () => {
    expect(blocks(codeFaults([doc({ id: "d-reg", typeId: "t-reg", valueIds: ["v-g1"] })], ctx()))).toEqual(["VALUE_NOT_FOR_DOCUMENT"]);
  });

  it("a body whose certificate is not in step 2 says to add it first, and blocks nothing", () => {
    const fs = codeFaults([doc({ id: "d-reg", typeId: "t-reg" })], ctx());
    expect(fs).toEqual([{ step: "codes", code: "DOCUMENT_FIRST", level: "info", field: "body.body-1", data: { body: "Works board", type: "Works board certificate" } }]);
    expect(registrationFaultText(fs[0]!).en).toBe("Add the Works board certificate in step 2 first. The codes of Works board are recorded on it.");
  });

  it("a certificate marked as not applicable does not open a body", () => {
    expect(codeFaults([doc({ id: "d-works", typeId: "t-works", notApplicable: true, fileCount: 0 })], ctx()).map((f) => f.code)).toEqual(["DOCUMENT_FIRST"]);
  });

  it("an empty list says it is not configured, and blocks nothing", () => {
    const fs = codeFaults(draft().documents, ctx({ values: [] }));
    expect(fs).toEqual([{ step: "codes", code: "LIST_NOT_CONFIGURED", level: "info", field: "body.body-1", data: { body: "Works board" } }]);
  });

  it("the sections list the bodies that have a certificate recording values, and what each can do", () => {
    const sections = codeSections(draft().documents, ctx());
    expect(sections.map((s) => [s.body.nameEn, s.state, s.kinds])).toEqual([["Works board", "OPEN", ["GRADE", "CATEGORY"]]]);
    expect(codeSections([], ctx())[0]!.missingTypeNames).toEqual(["Works board certificate"]);
  });

  it("a body is open when it has a live value of a kind its certificate records, and only retired values do not open it", () => {
    const retiredOnly = ctx({ values: [value({ id: "v-old", code: "X", nameEn: "Old", retired: true, kind: "GRADE" })] });
    expect(codeSections(draft().documents, retiredOnly)[0]!.state).toBe("LIST_NOT_CONFIGURED");
    const wrongKind = ctx({ values: [value({ id: "v-c", code: "C", nameEn: "A class", kind: "CLASS" })] });
    expect(codeSections(draft().documents, wrongKind)[0]!.state).toBe("LIST_NOT_CONFIGURED");
  });
});

describe("step 4: the bank details (FR-VND-005)", () => {
  const fs = (o = {}, statement = 1, c = ctx()) => creditorFaults(creditor(o), statement, c);

  it("a complete profile with a statement passes", () => {
    expect(blocks(fs())).toEqual([]);
  });

  it("each required field is asked, by its label", () => {
    const fields = ["beneficiaryName", "beneficiaryAddress", "beneficiaryIdentityNo", "beneficiaryContactPerson", "beneficiaryTelephone", "beneficiaryEmail", "bankCode", "bankAccountNo", "bankAccountTypeCode", "bankAddress"] as const;
    for (const f of fields) {
      const got = fs({ [f]: "  " });
      expect(got.some((x) => x.field === `creditor.${f}` && x.level === "block"), f).toBe(true);
    }
    expect(fs({ beneficiaryName: "" })[0]).toMatchObject({ code: "FIELD_REQUIRED", data: { field: "Beneficiary name" } });
  });

  it("the fax, the tax number and the SWIFT code are optional", () => {
    expect(blocks(fs({ beneficiaryFax: "", beneficiaryTaxRegistrationNo: "", bankSwiftCode: "" }))).toEqual([]);
  });

  it("the bank and the account type must be on the customer's lists, and an empty list closes the step", () => {
    expect(blocks(fs({ bankCode: "bank-z" }))).toEqual(["BANK_NOT_LISTED"]);
    expect(blocks(fs({ bankAccountTypeCode: "savings" }))).toEqual(["ACCOUNT_TYPE_NOT_LISTED"]);
    expect(blocks(fs({}, 1, ctx({ banks: [] })))).toContain("BANKS_NOT_SET");
    expect(blocks(fs({}, 1, ctx({ accountTypes: [] })))).toContain("ACCOUNT_TYPES_NOT_SET");
  });

  it("the account number and the SWIFT code are checked against the configured form, and with none set are only told 'not checked'", () => {
    const none = fs({ bankSwiftCode: "ABCDMYKL" });
    expect(none.filter((f) => f.code === "FORMAT_NOT_CHECKED").map((f) => f.field)).toEqual(["creditor.bankAccountNo", "creditor.bankSwiftCode"]);
    expect(blocks(none)).toEqual([]);
    const set = ctx({ accountNoPattern: "\\d{10}", swiftPattern: "[A-Z]{8}" });
    expect(fs({ bankAccountNo: "12345", bankSwiftCode: "abc" }, 1, set).filter((f) => f.code === "FORMAT_MISMATCH").map((f) => f.field)).toEqual(["creditor.bankAccountNo", "creditor.bankSwiftCode"]);
    expect(blocks(fs({ bankSwiftCode: "ABCDMYKL" }, 1, set))).toEqual([]);
    expect(fs({ bankSwiftCode: "ABCDMYKL" }, 1, set).some((f) => f.code === "FORMAT_NOT_CHECKED")).toBe(false);
  });

  it("an identity number that is not the company's registration number warns the reviewer and does not refuse", () => {
    const got = fs({ beneficiaryIdentityNo: "900101-01-1234" });
    expect(got).toContainEqual(expect.objectContaining({ code: "IDENTITY_DIFFERS", level: "warn" }));
    expect(blocks(got)).toEqual([]);
    expect(fs({ beneficiaryIdentityNo: " 202001000001 " }).some((f) => f.code === "IDENTITY_DIFFERS")).toBe(false);
  });

  it("the email must be shaped like one", () => {
    expect(blocks(fs({ beneficiaryEmail: "nobody" }))).toEqual(["EMAIL_NOT_VALID"]);
  });

  it("the bank statement is required", () => {
    expect(blocks(fs({}, 0))).toEqual(["STATEMENT_REQUIRED"]);
  });
});

describe("the declarations (FR-VND-005, FR-VND-006)", () => {
  it("the organisation's name is filled into the wording, every time it appears, and the frozen wording is hashed", () => {
    expect(fillText("{organisation} pays; {organisation} owes.", "Demo Water")).toBe("Demo Water pays; Demo Water owes.");
    const a = frozenWording({ bodyEn: "Pay {organisation}", bodyMs: "Bayar {organisation}" }, "Demo Water");
    expect(a.en).toBe("Pay Demo Water");
    expect(a.ms).toBe("Bayar Demo Water");
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(frozenWording({ bodyEn: "Pay {organisation}", bodyMs: "Bayar {organisation}" }, "Demo Water").sha256).toBe(a.sha256);
    expect(frozenWording({ bodyEn: "Pay {organisation}", bodyMs: "Bayar {organisation}" }, "Other Water").sha256).not.toBe(a.sha256);
    expect(frozenWording({ bodyEn: "x", bodyMs: null }, "Demo Water").ms).toBe("");
  });

  it("the GIRO text not set closes step 4, naming the text", () => {
    const fs = giroFaults(draft(), ctx({ texts: { GIRO_AUTHORISATION: null, FALSE_DECLARATION: ctx().texts.FALSE_DECLARATION } }));
    expect(fs).toEqual([{ step: "epayment", code: "TEXT_NOT_SET", level: "block", field: "giro", data: { kind: "GIRO_AUTHORISATION" } }]);
    expect(registrationFaultText(fs[0]!).en).toContain("GIRO authorisation text is not set");
  });

  it("step 4 asks for the signatory, the position and the tick, and flags a signatory who is not the contact", () => {
    expect(blocks(giroFaults(draft({ signatoryName: "", signatoryDesignation: "", giroConfirmed: false }), ctx()))).toEqual(["SIGNATORY_NAME_REQUIRED", "SIGNATORY_DESIGNATION_REQUIRED", "NOT_CONFIRMED"]);
    expect(giroFaults(draft({ signatoryName: "Someone Else" }), ctx())).toEqual([{ step: "epayment", code: "SIGNATORY_DIFFERS", level: "warn", field: "giro.signatoryName" }]);
    expect(giroFaults(draft({ signatoryName: "  aminah   binti ali " }), ctx())).toEqual([]);
  });

  it("step 5 needs the notice and the false-declaration text, each naming what is missing", () => {
    expect(reviewFaults(ctx())).toEqual([]);
    const fs = reviewFaults(ctx({ noticeEn: "  ", texts: { GIRO_AUTHORISATION: null, FALSE_DECLARATION: null } }));
    expect(fs.map((f) => f.code)).toEqual(["NOTICE_NOT_SET", "TEXT_NOT_SET"]);
    expect(registrationFaultText(fs[0]!).en).toContain("notice");
    expect(registrationFaultText(fs[1]!).en).toContain("false-declaration text");
  });

  const good: DeclarationInput[] = [
    { kind: "GIRO_AUTHORISATION", textVersionId: "text-giro-1", signatoryName: "Aminah", signatoryDesignation: "Director", confirmed: true },
    { kind: "FALSE_DECLARATION", textVersionId: "text-false-1", signatoryName: "Aminah", signatoryDesignation: "Director", confirmed: true },
  ];
  it("a request that names the current texts, a signatory and the ticks has nothing in its way", () => {
    expect(declarationFaults(good, ctx())).toEqual([]);
  });
  it("a stale or forged text id is refused", () => {
    expect(declarationFaults([{ ...good[0]!, textVersionId: "text-giro-0" }, good[1]!], ctx()).map((f) => f.code)).toEqual(["TEXT_STALE"]);
    expect(declarationFaults([good[0]!, { ...good[1]!, textVersionId: "someone-elses-text" }], ctx()).map((f) => f.code)).toEqual(["TEXT_STALE"]);
  });
  it("an unticked, unnamed or missing declaration is refused", () => {
    expect(declarationFaults([good[0]!, { ...good[1]!, confirmed: false, signatoryName: " " }], ctx()).map((f) => f.code)).toEqual(["SIGNATORY_NAME_REQUIRED", "NOT_CONFIRMED"]);
    expect(declarationFaults([good[0]!], ctx()).map((f) => f.code)).toEqual(["NOT_CONFIRMED"]);
    expect(declarationFaults([good[0]!, good[1]!, good[1]!], ctx()).map((f) => f.code)).toEqual(["NOT_CONFIRMED"]);
  });
});

describe("the text in force for a declaration", () => {
  const text = (o: Partial<StoredDeclarationText> & { id: string; version: number }): StoredDeclarationText => ({ kind: "GIRO_AUTHORISATION", bodyEn: "x", bodyMs: null, issuedOn: "2026-01-01", retiredOn: null, ...o });
  it("is the highest version issued on or before the day and not yet retired", () => {
    const texts = [text({ id: "a", version: 1 }), text({ id: "b", version: 2, issuedOn: "2026-06-01" }), text({ id: "c", version: 3, issuedOn: "2026-12-01" })];
    expect(currentDeclarationText(texts, "GIRO_AUTHORISATION", "2026-10-09")?.id).toBe("b");
    expect(currentDeclarationText(texts, "GIRO_AUTHORISATION", "2026-12-01")?.id).toBe("c");
    expect(currentDeclarationText(texts, "GIRO_AUTHORISATION", "2026-05-31")?.id).toBe("a");
  });
  it("is none before any is issued, after the last is retired, for the other kind, and while the day is not known", () => {
    const texts = [text({ id: "a", version: 1, issuedOn: "2026-06-01", retiredOn: "2026-09-01" })];
    expect(currentDeclarationText(texts, "GIRO_AUTHORISATION", "2026-05-01")).toBeNull();
    expect(currentDeclarationText(texts, "GIRO_AUTHORISATION", "2026-09-01")).toBeNull();
    expect(currentDeclarationText(texts, "FALSE_DECLARATION", "2026-07-01")).toBeNull();
    expect(currentDeclarationText(texts, "GIRO_AUTHORISATION", null)).toBeNull();
  });
  it("a retired version gives way to the one before it only if that one was not retired too", () => {
    const texts = [text({ id: "a", version: 1 }), text({ id: "b", version: 2, retiredOn: "2026-08-01" })];
    expect(currentDeclarationText(texts, "GIRO_AUTHORISATION", "2026-10-09")?.id).toBe("a");
  });
});

describe("the three questions: save, next, send", () => {
  it("a save judges shape and length only, and never says a draft is valid or not", () => {
    expect(draftShapeFaults({ step: "documents", documents: [{ id: "a", typeId: "t", title: "", reference: "", issuingAuthority: "", expiresOn: "", notApplicable: false, ratePercent: "" }] })).toEqual([]);
    const bad = draftShapeFaults({ step: "documents", documents: [{ id: "a", typeId: "t", title: "x".repeat(121), reference: "r", issuingAuthority: "", expiresOn: "soon", notApplicable: false, ratePercent: "a lot" }] });
    expect(bad.map((f) => [f.code, f.field])).toEqual([["TOO_LONG", "documents.a.title"], ["NOT_A_DAY", "documents.a.expiresOn"], ["NOT_A_NUMBER", "documents.a.ratePercent"]]);
    expect(draftShapeFaults({ step: "epayment", creditor: { bankAccountNo: "9".repeat(161) } }).map((f) => f.field)).toEqual(["creditor.bankAccountNo"]);
    expect(draftShapeFaults({ step: "epayment", creditor: { beneficiaryName: "" }, signatoryName: "" })).toEqual([]);
  });

  it("an empty, half-finished draft is saved as it is", () => {
    expect(draftShapeFaults({ step: "codes", documents: [{ id: "a", valueIds: [] }] })).toEqual([]);
    expect(draftShapeFaults({ step: "review" })).toEqual([]);
  });

  it("each step's rules are its own", () => {
    const d = draft({ statementCount: 0 });
    expect(stepFaults("company", d, ctx())).toEqual([]);
    expect(blocks(stepFaults("documents", d, ctx()))).toEqual([]);
    expect(blocks(stepFaults("epayment", d, ctx()))).toEqual(["STATEMENT_REQUIRED"]);
    expect(blocks(stepFaults("review", d, ctx({ noticeEn: null })))).toEqual(["NOTICE_NOT_SET"]);
  });

  it("sending asks every step at once, and the first blocked step is where the supplier is sent back", () => {
    const d = draft({ statementCount: 0, documents: [doc({ id: "d-works", typeId: "t-works" })] });
    const all = registrationFaults(d, ctx({ noticeEn: null }));
    expect(blockingFaults(all).map((f) => f.step)).toEqual(["documents", "epayment", "review"]);
    expect(firstBlockedStep(all)).toBe("documents");
    expect(firstBlockedStep(registrationFaults(draft(), ctx()))).toBeNull();
  });

  it("the request's own declarations are judged only when it carries them", () => {
    const withDeclarations = registrationFaults(draft(), ctx(), []);
    expect(blocks(withDeclarations)).toEqual(["NOT_CONFIRMED", "NOT_CONFIRMED"]);
    expect(blocks(registrationFaults(draft(), ctx()))).toEqual([]);
  });
});

describe("a setting that is not set refuses the upload, naming it", () => {
  const store = { allowedTypes: ["application/pdf", "image/png"], capBytes: 1000n };
  const policy = { classId: "class-1", maxFiles: 3, maxBytes: 2000n };
  const file = { size: 500n, sniffedType: "application/pdf" };
  const usage = { files: 0, bytes: 0n };

  it("a file within every limit is taken", () => {
    expect(uploadFault(file, store, policy, usage)).toBeNull();
  });
  it("the store's types or size not set refuses, before anything else", () => {
    expect(uploadFault(file, { allowedTypes: [], capBytes: 1000n }, policy, usage)?.code).toBe("STORE_POLICY_NOT_SET");
    expect(uploadFault(file, { allowedTypes: ["application/pdf"], capBytes: null }, policy, usage)?.code).toBe("STORE_POLICY_NOT_SET");
  });
  it("the class not set refuses, naming which one", () => {
    const f = uploadFault(file, store, { ...policy, classId: null }, usage, "statement");
    expect(f?.code).toBe("CLASS_NOT_SET");
    expect(uploadFaultText(f!, "statement").en).toContain("bank statements");
    expect(uploadFaultText(uploadFault(file, store, { ...policy, classId: null }, usage)!).en).toContain("uploaded certificates");
  });
  it("the quota not set refuses: unset closes uploads", () => {
    expect(uploadFault(file, store, { ...policy, maxFiles: null }, usage)?.code).toBe("QUOTA_NOT_SET");
    expect(uploadFault(file, store, { ...policy, maxBytes: null }, usage)?.code).toBe("QUOTA_NOT_SET");
  });
  it("an empty file, one over the cap and one of a type that is not allowed or not recognised are refused", () => {
    expect(uploadFault({ ...file, size: 0n }, store, policy, usage)?.code).toBe("EMPTY");
    expect(uploadFault({ ...file, size: 1001n }, store, policy, usage)?.code).toBe("TOO_LARGE");
    expect(uploadFault({ ...file, size: 1000n }, store, policy, usage)).toBeNull();
    expect(uploadFault({ ...file, sniffedType: "image/tiff" }, store, policy, usage)?.code).toBe("TYPE_NOT_ALLOWED");
    expect(uploadFault({ ...file, sniffedType: null }, store, policy, usage)?.code).toBe("TYPE_NOT_ALLOWED");
  });
  it("the quota counts every version already uploaded", () => {
    expect(uploadFault(file, store, policy, { files: 2, bytes: 100n })).toBeNull();
    expect(uploadFault(file, store, policy, { files: 3, bytes: 100n })?.code).toBe("QUOTA_FILES");
    expect(uploadFault(file, store, policy, { files: 1, bytes: 1501n })?.code).toBe("QUOTA_BYTES");
    expect(uploadFault(file, store, policy, { files: 1, bytes: 1500n })).toBeNull();
  });
});

describe("every finding has plain words, in English and Malay, and none shows a code", () => {
  it("each fault code has text", () => {
    const codes = [
      "TIME_ZONE_UNSET", "DOCUMENT_TYPES_NOT_SET", "DOCUMENT_TYPE_UNKNOWN", "DOCUMENT_REQUIRED", "DOCUMENT_DUPLICATE", "FILE_REQUIRED", "EXPIRY_REQUIRED", "EXPIRY_NOT_A_DAY", "ALREADY_EXPIRED", "EXPIRES_NOT_SET",
      "RATE_INVALID", "TITLE_REQUIRED", "TITLE_DUPLICATE", "MANDATORY_NOT_SAID", "NOT_APPLICABLE_NOT_ALLOWED", "VALUE_UNKNOWN", "VALUE_RETIRED", "VALUE_NOT_FOR_DOCUMENT", "ONE_GRADE_ONLY", "DOCUMENT_FIRST",
      "LIST_NOT_CONFIGURED", "FIELD_REQUIRED", "BANKS_NOT_SET", "ACCOUNT_TYPES_NOT_SET", "BANK_NOT_LISTED", "ACCOUNT_TYPE_NOT_LISTED", "EMAIL_NOT_VALID", "FORMAT_MISMATCH", "FORMAT_NOT_CHECKED", "IDENTITY_DIFFERS",
      "STATEMENT_REQUIRED", "TEXT_NOT_SET", "TEXT_STALE", "SIGNATORY_NAME_REQUIRED", "SIGNATORY_DESIGNATION_REQUIRED", "NOT_CONFIRMED", "NOTICE_NOT_SET", "SIGNATORY_DIFFERS", "TOO_LONG", "NOT_A_DAY", "NOT_A_NUMBER",
    ];
    for (const code of codes) {
      expect(hasRegistrationFaultText(code), code).toBe(true);
      const t = registrationFaultText({ code: code as never, data: { type: "Companies registry certificate", field: "Account number", body: "Works board", value: "G1 — Grade 1", kind: "GIRO_AUTHORISATION", title: "Safety", max: 10, expiresOn: "2020-01-01" } });
      expect(t.en.length, code).toBeGreaterThan(8);
      expect(t.ms.length, code).toBeGreaterThan(8);
      expect(t.en, code).not.toMatch(/[A-Z]{2,}_[A-Z_]+|undefined|null/);
    }
  });
  it("an unset-setting refusal tells the supplier it is the office's to set", () => {
    for (const code of ["DOCUMENT_TYPES_NOT_SET", "BANKS_NOT_SET", "ACCOUNT_TYPES_NOT_SET", "TEXT_NOT_SET", "NOTICE_NOT_SET", "TIME_ZONE_UNSET"] as const) {
      expect(registrationFaultText({ code, data: { kind: "GIRO_AUTHORISATION" } }).en, code).toMatch(/Tell the procurement office/);
    }
  });
  it("each upload fault has text", () => {
    for (const code of ["STORE_POLICY_NOT_SET", "CLASS_NOT_SET", "STATEMENT_CLASS_NOT_SULIT", "QUOTA_NOT_SET", "EMPTY", "TYPE_NOT_ALLOWED", "TOO_LARGE", "QUOTA_FILES", "QUOTA_BYTES"] as const) {
      const t = uploadFaultText({ code, level: "block", data: { max: 3 } });
      expect(t.en.length).toBeGreaterThan(8);
      expect(t.ms.length).toBeGreaterThan(8);
    }
  });
});

describe("the rules never name a customer or a literal policy", () => {
  it("the fixtures are invented and the module names no document type, body, bank or regulator", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "src", "lib", "portal", "registration");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && n !== "fixture.ts")) {
      const text = readFileSync(path.join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(text, f).not.toMatch(/\b(CIDB|MOF|SPAN|SSM|LHDN|Maybank|CIMB|Ranhill|RSAJ|Suruhanjaya|Surat Akuan)\b/i);
    }
  });
});
