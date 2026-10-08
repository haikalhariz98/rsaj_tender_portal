import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/documents/store";
import { postgresBlobStore } from "@/lib/documents/store/postgres";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import { sulitGranted } from "@/lib/auth/sulit-access";
import type { SupplierActor } from "@/lib/auth/types";
import { ensureAdministrator, facts, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { UploadRefusal } from "@/lib/documents/service";

import { contextFor } from "./context-store";
import { frozenWording } from "./declaration";
import { CREDITOR_FIELDS } from "./types";
import { findOwnVersion } from "./own-file-store";
import { forSupplier, registrationSummary } from "./summary";
import { creditorSummaryOf, loadCompanySummary, loadContactsSummary, loadCreditorRows, loadDeclarationsSummary, loadSentDocumentsSummary } from "./summary-store";
import { DraftRefused, loadDraftView, loadWizardState, saveSection } from "./draft-store";
import { submitRegistration } from "./submit-store";
import { storeSupplierUpload, withdrawDraftFile, type UploadTarget } from "./upload-store";
import type { DeclarationInput } from "./types";

/**
 * The registration's writes against a real database (Phase 4b): the draft saved and refused when stale, the upload's quota judged on the locked draft, the files moved and not copied, the
 * send as ONE transaction, and what the database itself refuses (the triggers and the CHECKs). Pure rules are in registration.test.ts.
 */

let organisationId: string;
let classCert: string;
let classStatement: string;
let classStatementOpen: string;
let typeReg: string;
let typeWorks: string;
let typeSst: string;
let bodyId: string;
let gradeId: string;
let categoryId: string;
let giroTextId: string;
let falseTextId: string;
/// The hash of each wording as the page shows it (organisation name filled in): what a tick and a signature are bound to.
let giroSha: string;
let falseSha: string;

/// The hash of a stored wording as it reads now, for the organisation as it is named now.
async function wordingSha(textId: string): Promise<string> {
  const [t, o] = await Promise.all([db.declarationText.findUniqueOrThrow({ where: { id: textId } }), db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true } })]);
  return frozenWording(t, o.name).sha256;
}

const PDF = (n: number) => new TextEncoder().encode(`%PDF-1.4 test ${n} ${randomId()}`);
const STORE = { allowedTypes: ["application/pdf"], capBytes: 100_000n };

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await ensureAdministrator(organisationId);
  const mk = (code: string, classification: "SULIT" | "INTERNAL") => db.documentClass.upsert({ where: { organisationId_code: { organisationId, code } }, update: { classification }, create: { organisationId, code, nameEn: `Class ${code}`, classification } });
  classCert = (await mk("reg4b_cert", "INTERNAL")).id;
  classStatement = (await mk("reg4b_statement", "SULIT")).id;
  classStatementOpen = (await mk("reg4b_statement_open", "INTERNAL")).id;
  await db.supplierPolicy.upsert({
    where: { organisationId },
    update: {},
    create: { organisationId, verificationNoticeEn: "The office checks it.", uploadMaxFilesPerApplication: 6, uploadMaxBytesPerApplication: 1_000_000n, supplierUploadClassId: classCert, supplierBankStatementClassId: classStatement },
  });
  await db.supplierPolicy.update({ where: { organisationId }, data: { verificationNoticeEn: "The office checks it.", uploadMaxFilesPerApplication: 6, uploadMaxBytesPerApplication: 1_000_000n, supplierUploadClassId: classCert, supplierBankStatementClassId: classStatement } });
  const body = await db.registrationBody.upsert({ where: { organisationId_code: { organisationId, code: "reg4b_board" } }, update: {}, create: { organisationId, code: "reg4b_board", labelEn: "the Works board", provenance: "ASSUMED" } });
  bodyId = body.id;
  const type = (code: string, nameEn: string, extra: Record<string, unknown> = {}) =>
    db.supplierDocumentType.upsert({ where: { organisationId_code: { organisationId, code } }, update: extra, create: { organisationId, code, nameEn, provenance: "ASSUMED", expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false, ...extra } });
  typeReg = (await type("reg4b_reg", "Companies registry certificate")).id;
  typeWorks = (await type("reg4b_works", "Works board certificate", { bodyId, valueKinds: ["GRADE", "CATEGORY"] })).id;
  typeSst = (await type("reg4b_sst", "Sales tax certificate", { mandatoryAtRegistration: false, recordsRate: true })).id;
  const value = (code: string, kind: "GRADE" | "CATEGORY", nameEn: string) => db.registrationValue.upsert({ where: { bodyId_kind_code: { bodyId, kind, code } }, update: {}, create: { organisationId, bodyId, kind, code, nameEn, provenance: "ASSUMED" } });
  gradeId = (await value("G1", "GRADE", "Grade one")).id;
  await value("G2", "GRADE", "Grade two");
  categoryId = (await value("B", "CATEGORY", "Buildings")).id;
  const list = (code: string, kind: "BANK" | "ACCOUNT_TYPE", nameEn: string) => db.supplierListValue.upsert({ where: { organisationId_list_code: { organisationId, list: kind, code } }, update: { retiredOn: null }, create: { organisationId, list: kind, code, nameEn, provenance: "ASSUMED" } });
  await list("reg4b_bank", "BANK", "Demonstration Bank");
  await list("reg4b_current", "ACCOUNT_TYPE", "Current account");
  const text = async (kind: "GIRO_AUTHORISATION" | "FALSE_DECLARATION", bodyEn: string) => {
    const id = `reg4b_${kind}`;
    const existing = await db.declarationText.findFirst({ where: { organisationId, kind, version: 1 } });
    if (existing) return existing.id;
    void id;
    return (await db.declarationText.create({ data: { organisationId, kind, version: 1, bodyEn, bodyMs: null, provenance: "ASSUMED", governingSource: "A demonstration wording", issuedOn: new Date("2026-01-01T00:00:00Z") } })).id;
  };
  giroTextId = await text("GIRO_AUTHORISATION", "We authorise {organisation} to pay.");
  falseTextId = await text("FALSE_DECLARATION", "What we say to {organisation} is true.");
  giroSha = await wordingSha(giroTextId);
  falseSha = await wordingSha(falseTextId);
});

/// A supplier with a live account, signed in, as the actor the portal reads from its session.
async function supplier(): Promise<{ actor: SupplierActor; password: string; supplierId: string }> {
  const s = await makeSupplierAccount(organisationId);
  const signedIn = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!signedIn.ok) throw new Error("sign-in failed");
  const read = await readSupplierSession(signedIn.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session failed");
  return { actor: read.actor, password: s.password, supplierId: s.supplier.id };
}

const ctxFor = (actor: SupplierActor) => (tx: Parameters<typeof contextFor>[0], chosen: string[]) => contextFor(tx, actor, chosen);

async function upload(actor: SupplierActor, version: number, target: UploadTarget, n = Math.floor(Math.random() * 1e9), policyOver: Partial<{ classId: string | null; classIsSulit: boolean; maxFiles: number | null; maxBytes: bigint | null }> = {}) {
  const bytes = PDF(n);
  const org = { id: organisationId, code: "AUTH_TEST", timeZone: "Asia/Kuala_Lumpur", today: "2026-10-09" };
  return storeSupplierUpload(actor, {
    version,
    target,
    bytes,
    sha256: sha256Hex(bytes),
    mediaType: "application/pdf",
    originalFilename: `file-${n}.pdf`,
    org,
    store: postgresBlobStore,
    storeSettings: STORE,
    policy: { classId: target.kind === "statement" ? classStatement : classCert, classIsSulit: target.kind === "statement" ? true : undefined, maxFiles: 6, maxBytes: 1_000_000n, ...policyOver },
  });
}

/// A draft with everything the rules ask for, ready to send.
async function readyDraft(actor: SupplierActor) {
  let v = 0;
  const a = await upload(actor, v, { kind: "document", documentId: null, typeId: typeReg, title: "" });
  v = a.version;
  const b = await upload(actor, v, { kind: "document", documentId: null, typeId: typeWorks, title: "" });
  v = b.version;
  v = (await saveSection(actor, { version: v, section: { step: "documents", documents: [
    { id: a.rowId!, typeId: typeReg, title: "", reference: "R-1", issuingAuthority: "Registry", expiresOn: "2027-06-30", notApplicable: false, ratePercent: "" },
    { id: b.rowId!, typeId: typeWorks, title: "", reference: "W-1", issuingAuthority: "Board", expiresOn: "2027-06-30", notApplicable: false, ratePercent: "" },
  ] } }, ctxFor(actor))).version;
  v = (await saveSection(actor, { version: v, section: { step: "codes", documents: [{ id: b.rowId!, valueIds: [gradeId, categoryId] }] } }, ctxFor(actor))).version;
  const s = await upload(actor, v, { kind: "statement" });
  v = s.version;
  v = (await saveSection(actor, { version: v, section: { step: "epayment", creditor: { beneficiaryName: "Demonstration Contractors", beneficiaryAddress: "1 Road", beneficiaryIdentityNo: "ID-1", beneficiaryContactPerson: "Aminah", beneficiaryTelephone: "0123", beneficiaryEmail: "a@example.invalid", bankCode: "reg4b_bank", bankAccountNo: "123456789", bankAccountTypeCode: "reg4b_current", bankAddress: "2 Street" }, signatoryName: actor.displayName, signatoryDesignation: "Director", giroConfirmed: true, giroTextSha256: giroSha } }, ctxFor(actor))).version;
  return { v, rows: { reg: a.rowId!, works: b.rowId! }, statement: s };
}

const declarations = (): DeclarationInput[] => [
  { kind: "GIRO_AUTHORISATION", textVersionId: giroTextId, textSha256: giroSha, signatoryName: "Aminah", signatoryDesignation: "Director", confirmed: true },
  { kind: "FALSE_DECLARATION", textVersionId: falseTextId, textSha256: falseSha, signatoryName: "Aminah", signatoryDesignation: "Director", confirmed: true },
];

async function signStep(s: { actor: SupplierActor; password: string }) {
  const asked = await confirmSupplierPassword(s.actor, s.password, facts());
  if (!asked.ok) throw new Error("password refused");
  return asked.at;
}

function sqlState(error: unknown): string {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}
async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

describe("saving the draft", () => {
  it("makes the draft with the first save, raises its version with each, and refuses a stale page, writing nothing", async () => {
    const { actor } = await supplier();
    expect((await loadDraftView(db, actor)).id).toBeNull();
    const first = await saveSection(actor, { version: 0, section: { step: "documents", documents: [{ id: "new:a", typeId: typeReg, title: "", reference: "R-1", issuingAuthority: "", expiresOn: "2027-06-30", notApplicable: false, ratePercent: "" }] } }, ctxFor(actor));
    expect(first.version).toBe(1);
    const rowId = first.created["new:a"]!;
    expect(rowId).toBeTruthy();
    const stale = saveSection(actor, { version: 0, section: { step: "documents", documents: [{ id: rowId, typeId: typeReg, title: "", reference: "CHANGED", issuingAuthority: "", expiresOn: "", notApplicable: false, ratePercent: "" }] } }, ctxFor(actor));
    await expect(stale).rejects.toMatchObject({ kind: "STALE" });
    expect((await loadDraftView(db, actor)).documents[0]).toMatchObject({ reference: "R-1" });
    const second = await saveSection(actor, { version: 1, section: { step: "documents", documents: [{ id: rowId, typeId: typeReg, title: "", reference: "R-2", issuingAuthority: "", expiresOn: "", notApplicable: false, ratePercent: "" }] } }, ctxFor(actor));
    expect(second.version).toBe(2);
    expect((await loadDraftView(db, actor)).documents[0]).toMatchObject({ reference: "R-2", expiresOn: null });
  });

  it("a half-finished draft is saved as it is: a save never claims it is valid", async () => {
    const { actor } = await supplier();
    const saved = await saveSection(actor, { version: 0, section: { step: "epayment", creditor: { bankAccountNo: "12" } } }, ctxFor(actor));
    expect(saved.faults.some((f) => f.level === "block")).toBe(true);
    expect((await loadDraftView(db, actor)).creditor.bankAccountNo).toBe("12");
  });

  it("refuses a row, a type or a code that is not the supplier's own or the organisation's, and writes nothing", async () => {
    const a = await supplier();
    const b = await supplier();
    const mine = await saveSection(a.actor, { version: 0, section: { step: "documents", documents: [{ id: "new:x", typeId: typeReg, title: "", reference: "", issuingAuthority: "", expiresOn: "", notApplicable: false, ratePercent: "" }] } }, ctxFor(a.actor));
    const rowOfA = mine.created["new:x"]!;
    // B names A's row: it is not B's, so it is not found.
    await expect(saveSection(b.actor, { version: 0, section: { step: "documents", documents: [{ id: rowOfA, typeId: typeReg, title: "", reference: "STOLEN", issuingAuthority: "", expiresOn: "", notApplicable: false, ratePercent: "" }] } }, ctxFor(b.actor))).rejects.toMatchObject({ kind: "NOT_FOUND" });
    expect((await db.registrationDraftDocument.findUniqueOrThrow({ where: { id: rowOfA } })).reference).toBe("");
    await expect(saveSection(b.actor, { version: 0, section: { step: "codes", documents: [{ id: rowOfA, valueIds: [gradeId] }] } }, ctxFor(b.actor))).rejects.toMatchObject({ kind: "NOT_FOUND" });
    // A type of nobody's.
    await expect(saveSection(a.actor, { version: mine.version, section: { step: "documents", documents: [{ id: "new:y", typeId: "type_that_is_not_there_1", title: "", reference: "", issuingAuthority: "", expiresOn: "", notApplicable: false, ratePercent: "" }] } }, ctxFor(a.actor))).rejects.toMatchObject({ kind: "INVALID" });
    // A code of nobody's, and a code of another organisation.
    await expect(saveSection(a.actor, { version: mine.version, section: { step: "codes", documents: [{ id: rowOfA, valueIds: ["code_that_is_not_there_1"] }] } }, ctxFor(a.actor))).rejects.toMatchObject({ kind: "INVALID" });
    const other = await db.organisation.create({ data: { code: `OTHER_${randomId()}`, name: "Another organisation", timeZone: "Asia/Kuala_Lumpur" } });
    const otherBody = await db.registrationBody.create({ data: { organisationId: other.id, code: "b", labelEn: "Another body", provenance: "ASSUMED" } });
    const foreign = await db.registrationValue.create({ data: { organisationId: other.id, bodyId: otherBody.id, kind: "GRADE", code: "X", nameEn: "Foreign", provenance: "ASSUMED" } });
    await expect(saveSection(a.actor, { version: mine.version, section: { step: "codes", documents: [{ id: rowOfA, valueIds: [foreign.id] }] } }, ctxFor(a.actor))).rejects.toMatchObject({ kind: "INVALID" });
    expect(await db.registrationDraftValue.count({ where: { draftDocumentId: rowOfA } })).toBe(0);
  });

  it("refuses a retired code newly chosen, and lets a code already on the draft stay", async () => {
    const { actor } = await supplier();
    const made = await saveSection(actor, { version: 0, section: { step: "documents", documents: [{ id: "new:w", typeId: typeWorks, title: "", reference: "", issuingAuthority: "", expiresOn: "", notApplicable: false, ratePercent: "" }] } }, ctxFor(actor));
    const row = made.created["new:w"]!;
    const retired = await db.registrationValue.create({ data: { organisationId, bodyId, kind: "CATEGORY", code: `OLD${randomId()}`, nameEn: "Old category", provenance: "ASSUMED", retiredOn: new Date("2026-01-01T00:00:00Z") } });
    await expect(saveSection(actor, { version: made.version, section: { step: "codes", documents: [{ id: row, valueIds: [retired.id] }] } }, ctxFor(actor))).rejects.toMatchObject({ kind: "INVALID" });
    const ok = await saveSection(actor, { version: made.version, section: { step: "codes", documents: [{ id: row, valueIds: [gradeId] }] } }, ctxFor(actor));
    expect((await loadDraftView(db, actor)).documents[0]!.valueIds).toEqual([gradeId]);
    expect(ok.version).toBe(made.version + 1);
  });

  it("takes a document off the draft: its files are detached, the bytes stay, and the row is marked, not deleted", async () => {
    const { actor } = await supplier();
    const u = await upload(actor, 0, { kind: "document", documentId: null, typeId: typeSst, title: "" });
    const removed = await saveSection(actor, { version: u.version, section: { step: "documents", documents: [] }, remove: [u.rowId!] }, ctxFor(actor));
    expect(removed.version).toBe(u.version + 1);
    expect((await loadDraftView(db, actor)).documents).toEqual([]);
    const row = await db.registrationDraftDocument.findUniqueOrThrow({ where: { id: u.rowId! } });
    expect(row.removedAt).not.toBeNull();
    const att = await db.documentAttachment.findMany({ where: { versionId: u.versionId } });
    expect(att).toHaveLength(1);
    expect(att[0]!.detachedAt).not.toBeNull();
    expect(await db.blobContent.count({ where: { organisationId } })).toBeGreaterThan(0);
  });
});

describe("uploading", () => {
  it("records the supplier's own account as the recorder, attaches the version to the draft's row, and is Not scanned", async () => {
    const { actor } = await supplier();
    const r = await upload(actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" });
    expect(r).toMatchObject({ scanState: "NOT_SCANNED", label: "Companies registry certificate", version: 1 });
    const v = await db.documentVersion.findUniqueOrThrow({ where: { id: r.versionId }, include: { attachments: true, document: true } });
    expect(v).toMatchObject({ recordedByPersonId: null, recordedBySupplierAccountId: actor.accountId, scanState: "NOT_SCANNED", mediaType: "application/pdf" });
    expect(v.attachments).toHaveLength(1);
    expect(v.attachments[0]).toMatchObject({ purpose: "SUPPLIER_DRAFT_DOCUMENT", registrationDraftDocumentId: r.rowId, detachedAt: null });
    expect(v.document.documentClassId).toBe(classCert);
  });

  it("an identical file uploaded again is stored again: the reply has the same shape whether or not the bytes were held (C-6)", async () => {
    const a = await supplier();
    const b = await supplier();
    const bytes = PDF(777_001);
    const org = { id: organisationId, code: "AUTH_TEST", timeZone: "Asia/Kuala_Lumpur", today: "2026-10-09" };
    const go = (actor: SupplierActor, version: number) => storeSupplierUpload(actor, { version, target: { kind: "document", documentId: null, typeId: typeReg, title: "" }, bytes, sha256: sha256Hex(bytes), mediaType: "application/pdf", originalFilename: "same.pdf", org, store: postgresBlobStore, storeSettings: STORE, policy: { classId: classCert, maxFiles: 6, maxBytes: 1_000_000n } });
    const first = await go(a.actor, 0);
    const second = await go(b.actor, 0);
    expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
    expect(first.byteSize).toBe(second.byteSize);
    expect(first.versionId).not.toBe(second.versionId);
    expect(await db.blobContent.count({ where: { organisationId, sha256: sha256Hex(bytes) } })).toBe(1);
  });

  it("a stale page's upload is refused and stores nothing", async () => {
    const { actor } = await supplier();
    await upload(actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" });
    const before = await db.documentVersion.count({ where: { recordedBySupplierAccountId: actor.accountId } });
    await expect(upload(actor, 0, { kind: "document", documentId: null, typeId: typeWorks, title: "" })).rejects.toMatchObject({ kind: "STALE" });
    expect(await db.documentVersion.count({ where: { recordedBySupplierAccountId: actor.accountId } })).toBe(before);
  });

  it("a row that is not on the supplier's own draft is not found", async () => {
    const a = await supplier();
    const b = await supplier();
    const mine = await upload(a.actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" });
    await expect(upload(b.actor, 0, { kind: "document", documentId: mine.rowId, typeId: null, title: "" })).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("the quota counts every version, and is judged on the locked draft: two uploads that arrive together cannot both pass it", async () => {
    const { actor } = await supplier();
    const one = { maxFiles: 1 };
    const results = await Promise.allSettled([
      upload(actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" }, 1, one),
      upload(actor, 0, { kind: "document", documentId: null, typeId: typeWorks, title: "" }, 2, one),
    ]);
    // One passes. The other is refused: stale (it read the version before the first finished) or over the quota. Never both.
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason instanceof DraftRefused || refused.reason instanceof UploadRefusal).toBe(true);
    const view = await loadDraftView(db, actor);
    expect(view.documents.flatMap((d) => d.files)).toHaveLength(1);
    // And with the version current, the next is refused for the quota itself.
    await expect(upload(actor, view.version, { kind: "document", documentId: null, typeId: typeSst, title: "" }, 3, one)).rejects.toMatchObject({ finding: { code: "QUOTA_FILES" } });
    // A withdrawn file still counts: bytes are never deleted.
    const vid = view.documents.flatMap((d) => d.files)[0]!.versionId;
    const w = await withdrawDraftFile(actor, { version: view.version, versionId: vid });
    await expect(upload(actor, w.version, { kind: "document", documentId: null, typeId: typeSst, title: "" }, 4, one)).rejects.toMatchObject({ finding: { code: "QUOTA_FILES" } });
  });

  it("the byte quota counts the bytes already held", async () => {
    const { actor } = await supplier();
    const a = await upload(actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" }, 11, { maxBytes: 40n });
    await expect(upload(actor, a.version, { kind: "document", documentId: null, typeId: typeWorks, title: "" }, 12, { maxBytes: 40n })).rejects.toMatchObject({ finding: { code: "QUOTA_BYTES" } });
  });

  it("a quota or a class not set refuses, and a statement's class must be SULIT", async () => {
    const { actor } = await supplier();
    await expect(upload(actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" }, 5, { maxFiles: null })).rejects.toMatchObject({ finding: { code: "QUOTA_NOT_SET" } });
    await expect(upload(actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" }, 6, { classId: null })).rejects.toMatchObject({ finding: { code: "CLASS_NOT_SET" } });
    // The class is checked on the row, in the transaction: a statement in a class that is not SULIT is refused even if the caller says it is.
    await expect(upload(actor, 0, { kind: "statement" }, 7, { classId: classStatementOpen, classIsSulit: true })).rejects.toMatchObject({ finding: { code: "STATEMENT_CLASS_NOT_SULIT" } });
    expect(await db.documentVersion.count({ where: { recordedBySupplierAccountId: actor.accountId } })).toBe(0);
  });

  it("a bank statement is SULIT from upload and hangs on the profile being filled in", async () => {
    const { actor, supplierId } = await supplier();
    const r = await upload(actor, 0, { kind: "statement" });
    const v = await db.documentVersion.findUniqueOrThrow({ where: { id: r.versionId }, include: { attachments: true, document: true } });
    expect(v.document.classificationSnapshot).toBe("SULIT");
    expect(v.attachments[0]).toMatchObject({ purpose: "SUPPLIER_BANK_STATEMENT", creditorProfileId: r.rowId });
    const profile = await db.creditorProfile.findUniqueOrThrow({ where: { id: r.rowId! } });
    expect(profile).toMatchObject({ supplierId, version: 1, submittedAt: null, verification: "NOT_CHECKED", enteredBySupplierAccountId: actor.accountId });
  });

  it("withdrawing detaches the file with a reason and keeps the bytes; another supplier's file is not found", async () => {
    const a = await supplier();
    const b = await supplier();
    const r = await upload(a.actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" });
    await expect(withdrawDraftFile(b.actor, { version: 0, versionId: r.versionId })).rejects.toMatchObject({ kind: "NOT_FOUND" });
    const w = await withdrawDraftFile(a.actor, { version: r.version, versionId: r.versionId });
    expect(w.version).toBe(r.version + 1);
    const att = await db.documentAttachment.findFirstOrThrow({ where: { versionId: r.versionId } });
    expect(att.detachedAt).not.toBeNull();
    expect(att.detachReason).toContain("Withdrawn by the supplier");
    expect(await db.documentVersion.count({ where: { id: r.versionId } })).toBe(1);
  });

  it("the wizard is closed to a supplier whose registration the office holds", async () => {
    const { actor, supplierId } = await supplier();
    await db.supplierApplication.create({ data: { organisationId, supplierId, kind: "NEW", receivedOn: new Date("2026-10-09T00:00:00Z"), channel: "COUNTER", recordedByPersonId: (await db.person.create({ data: { organisationId, name: "Officer" } })).id, recordedAt: new Date() } });
    expect(await loadWizardState(db, actor)).toBe("WITH_OFFICE");
    await expect(upload(actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" })).rejects.toMatchObject({ kind: "NOT_OPEN" });
    await expect(saveSection(actor, { version: 0, section: { step: "review" } }, ctxFor(actor))).rejects.toMatchObject({ kind: "NOT_OPEN" });
  });
});

describe("sending the registration", () => {
  it("writes the application, the documents, the bank details, both declarations, the signatures and the audit rows in one transaction, and moves the files without copying them", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    const blobsBefore = await db.blobContent.count({ where: { organisationId } });
    const at = await signStep(s);
    const sent = await submitRegistration(s.actor, { version: d.v, declarations: declarations(), stepUpAt: at });
    expect(await db.blobContent.count({ where: { organisationId } })).toBe(blobsBefore);

    const app = await db.supplierApplication.findUniqueOrThrow({ where: { id: sent.applicationId } });
    expect(app).toMatchObject({ kind: "NEW", channel: "PORTAL", status: "RECEIVED", recordedByPersonId: null, submittedBySupplierAccountId: s.actor.accountId, supplierId: s.supplierId });
    expect(app.submittedAt).not.toBeNull();
    expect(sent.sentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const docs = await db.supplierDocument.findMany({ where: { supplierId: s.supplierId }, include: { values: true, attachments: true } });
    expect(docs).toHaveLength(2);
    for (const doc of docs) expect(doc).toMatchObject({ recordedByPersonId: null, recordedBySupplierAccountId: s.actor.accountId, applicationId: app.id, verification: "NOT_CHECKED" });
    const works = docs.find((x) => x.typeId === typeWorks)!;
    expect(works.values.map((v) => [v.codeSnapshot, v.labelSnapshot]).sort()).toEqual([["B", "Buildings"], ["G1", "Grade one"]]);
    // The same versions: re-attached to the supplier's documents, detached from the draft.
    expect(works.attachments).toHaveLength(1);
    expect(works.attachments[0]).toMatchObject({ purpose: "SUPPLIER_DOCUMENT", detachedAt: null });
    const draftAttachments = await db.documentAttachment.findMany({ where: { versionId: works.attachments[0]!.versionId, purpose: "SUPPLIER_DRAFT_DOCUMENT" } });
    expect(draftAttachments).toHaveLength(1);
    expect(draftAttachments[0]!.detachedAt).not.toBeNull();

    const profile = await db.creditorProfile.findFirstOrThrow({ where: { supplierId: s.supplierId } });
    expect(profile).toMatchObject({ version: 1, verification: "NOT_CHECKED", verifiedByPersonId: null });
    expect(profile.submittedAt).not.toBeNull();

    const decl = await db.registrationDeclaration.findMany({ where: { applicationId: app.id } });
    expect(decl.map((x) => x.kind).sort()).toEqual(["FALSE_DECLARATION", "GIRO_AUTHORISATION"]);
    const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId } });
    for (const x of decl) {
      expect(x.signedBySupplierAccountId).toBe(s.actor.accountId);
      expect(x.frozenTextEn).toContain(org.name);
      expect(x.frozenTextEn).not.toContain("{organisation}");
      expect(x.textSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(decl.find((x) => x.kind === "GIRO_AUTHORISATION")!.creditorProfileId).toBe(profile.id);

    // The signature: one, with the password, on the application; each declaration SIGNED on the same entry.
    const submission = await db.actAttribution.findFirstOrThrow({ where: { entity: "SupplierApplication", entityId: app.id, slot: "submittedBySupplierAccount" } });
    expect(submission).toMatchObject({ mode: "SIGNED", subjectSupplierAccountId: s.actor.accountId, recordedBySupplierAccountId: s.actor.accountId, subjectPersonId: null, recordedByPersonId: null, sessionId: s.actor.sessionId, documentEntity: "SupplierApplication", documentId: app.id });
    expect(submission.stepUpAt?.getTime()).toBe(at.getTime());
    for (const x of decl) {
      const row = await db.actAttribution.findFirstOrThrow({ where: { entity: "RegistrationDeclaration", entityId: x.id, slot: "signedBy" } });
      expect(row).toMatchObject({ mode: "SIGNED", subjectSupplierAccountId: s.actor.accountId, documentEntity: "RegistrationDeclaration", documentId: x.id, stepUpAt: null });
    }

    const draft = await db.registrationDraft.findUniqueOrThrow({ where: { supplierId: s.supplierId } });
    expect(draft.submittedAt).not.toBeNull();
    expect(await loadWizardState(db, s.actor)).toBe("SENT");

    const audit = await db.auditEntry.findMany({ where: { organisationId, actorSupplierAccountId: s.actor.accountId } });
    expect(audit.map((a) => a.entity)).toEqual(expect.arrayContaining(["SupplierApplication", "SupplierDocument", "CreditorProfile", "RegistrationDeclaration", "RegistrationDraft"]));
    // No name of a person, and no login, in the trail.
    expect(JSON.stringify(audit.map((a) => [a.entityLabel, a.changes]))).not.toContain(s.actor.loginName);
  });

  it("sending twice is refused as decided, and writes nothing more", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    await submitRegistration(s.actor, { version: d.v, declarations: declarations(), stepUpAt: await signStep(s) });
    const apps = await db.supplierApplication.count({ where: { supplierId: s.supplierId } });
    await expect(submitRegistration(s.actor, { version: d.v + 1, declarations: declarations(), stepUpAt: await signStep(s) })).rejects.toMatchObject({ kind: "SENT" });
    expect(await db.supplierApplication.count({ where: { supplierId: s.supplierId } })).toBe(apps);
  });

  it("refuses a stale page, a stale or forged text id, and a registration with something blocking, and writes nothing", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    await expect(submitRegistration(s.actor, { version: d.v - 1, declarations: declarations(), stepUpAt: await signStep(s) })).rejects.toMatchObject({ kind: "STALE" });
    const forged = declarations();
    forged[1] = { ...forged[1]!, textVersionId: giroTextId };
    await expect(submitRegistration(s.actor, { version: d.v, declarations: forged, stepUpAt: await signStep(s) })).rejects.toMatchObject({ kind: "INVALID" });
    // A missing statement blocks.
    await withdrawDraftFile(s.actor, { version: d.v, versionId: d.statement.versionId });
    await expect(submitRegistration(s.actor, { version: d.v + 1, declarations: declarations(), stepUpAt: await signStep(s) })).rejects.toMatchObject({ kind: "INVALID" });
    expect(await db.supplierApplication.count({ where: { supplierId: s.supplierId } })).toBe(0);
    expect(await db.registrationDeclaration.count({ where: { signedBySupplierAccountId: s.actor.accountId } })).toBe(0);
  });

  it("stores the signatory the draft holds, never the one the request carries, and the GIRO tick the draft holds", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    const crafted = declarations().map((x) => ({ ...x, signatoryName: "Somebody Else Entirely", signatoryDesignation: "Chairman", confirmed: true }));
    const sent = await submitRegistration(s.actor, { version: d.v, declarations: crafted, stepUpAt: await signStep(s) });
    const signed = await db.registrationDeclaration.findMany({ where: { applicationId: sent.applicationId } });
    expect(signed).toHaveLength(2);
    for (const x of signed) expect(x).toMatchObject({ signatoryName: s.actor.displayName, signatoryDesignation: "Director" });
  });

  it("a GIRO box ticked on one wording does not count for another: refused when a new version took its place, and the supplier ticks again", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    const latest = await db.declarationText.aggregate({ where: { organisationId, kind: "GIRO_AUTHORISATION" }, _max: { version: true } });
    const v2 = await db.declarationText.create({ data: { organisationId, kind: "GIRO_AUTHORISATION", version: (latest._max.version ?? 1) + 1, bodyEn: "A new authorisation for {organisation} to pay.", bodyMs: null, provenance: "ASSUMED", governingSource: "A demonstration wording", issuedOn: new Date("2026-02-01T00:00:00Z") } });
    try {
      // The page loaded after the new version, so it carries the new text's id and hash: it is the BOX that is stale.
      const now = declarations();
      now[0] = { ...now[0]!, textVersionId: v2.id, textSha256: await wordingSha(v2.id) };
      await expect(submitRegistration(s.actor, { version: d.v, declarations: now, stepUpAt: await signStep(s) })).rejects.toMatchObject({ kind: "INVALID", faults: [expect.objectContaining({ code: "TEXT_STALE", field: "giro.confirmed" })] });
      expect(await db.supplierApplication.count({ where: { supplierId: s.supplierId } })).toBe(0);
      // A tick that names the old wording is refused at the save; ticking again on the wording now in force is accepted and can be sent.
      await expect(saveSection(s.actor, { version: d.v, section: { step: "epayment", creditor: {}, giroConfirmed: true, giroTextSha256: giroSha } }, ctxFor(s.actor))).rejects.toMatchObject({ kind: "INVALID", faults: [expect.objectContaining({ code: "TEXT_STALE" })] });
      const ticked = await saveSection(s.actor, { version: d.v, section: { step: "epayment", creditor: {}, giroConfirmed: true, giroTextSha256: await wordingSha(v2.id) } }, ctxFor(s.actor));
      const sent = await submitRegistration(s.actor, { version: ticked.version, declarations: now, stepUpAt: await signStep(s) });
      expect((await db.registrationDeclaration.findFirstOrThrow({ where: { applicationId: sent.applicationId, kind: "GIRO_AUTHORISATION" } })).textVersion).toBe(v2.version);
    } finally {
      // The scratch organisation is shared: the second version is signed by now, so it is retired (a signed wording is never deleted) and the first is in force again.
      await db.declarationText.update({ where: { id: v2.id }, data: { retiredOn: new Date("2026-02-02T00:00:00Z") } });
    }
  });

  it("wording corrected in place after the page was drawn is refused, with nothing written", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    const original = await db.declarationText.findUniqueOrThrow({ where: { id: falseTextId } });
    // The page was drawn with the false-declaration words as they were; an office then corrects them in place (allowed while nobody has signed that version).
    const drawn = declarations();
    await db.declarationText.update({ where: { id: falseTextId }, data: { bodyEn: "A corrected declaration to {organisation}." } });
    try {
      await expect(submitRegistration(s.actor, { version: d.v, declarations: drawn, stepUpAt: await signStep(s) })).rejects.toMatchObject({ kind: "INVALID", faults: [expect.objectContaining({ code: "TEXT_STALE" })] });
      expect(await db.supplierApplication.count({ where: { supplierId: s.supplierId } })).toBe(0);
      expect(await db.registrationDeclaration.count({ where: { signedBySupplierAccountId: s.actor.accountId } })).toBe(0);
    } finally {
      await db.declarationText.update({ where: { id: falseTextId }, data: { bodyEn: original.bodyEn } });
    }
  });

  it("the organisation renamed after the page was drawn is refused too: what is signed names the organisation", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId } });
    const drawn = declarations();
    await db.organisation.update({ where: { id: organisationId }, data: { name: `${org.name} (renamed)` } });
    try {
      await expect(submitRegistration(s.actor, { version: d.v, declarations: drawn, stepUpAt: await signStep(s) })).rejects.toMatchObject({ kind: "INVALID" });
      expect(await db.registrationDeclaration.count({ where: { signedBySupplierAccountId: s.actor.accountId } })).toBe(0);
    } finally {
      await db.organisation.update({ where: { id: organisationId }, data: { name: org.name } });
    }
  });

  it("a correction in flight is waited for: a registration sent while a wording is being corrected is refused, never signed on the old words under the corrected row", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    const original = await db.declarationText.findUniqueOrThrow({ where: { id: falseTextId } });
    const drawn = declarations();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // The office's correction, as the configuration action takes it: the row locked first, the edit not yet committed.
    const correcting = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DeclarationText" WHERE id = ${falseTextId} FOR UPDATE`;
      await tx.declarationText.update({ where: { id: falseTextId }, data: { bodyEn: "A corrected declaration to {organisation}." } });
      await held;
    });
    try {
      await new Promise((r) => setTimeout(r, 300));
      const stepUpAt = await signStep(s);
      const sending = submitRegistration(s.actor, { version: d.v, declarations: drawn, stepUpAt }).then(
        () => "SENT",
        (e: unknown) => (e as { kind?: string }).kind ?? String(e),
      );
      await new Promise((r) => setTimeout(r, 500));
      release();
      await correcting;
      // Without the shared lock the send read the old words while the correction was uncommitted, signed them, and the row then changed under the signature.
      expect(await sending).toBe("INVALID");
      expect(await db.registrationDeclaration.count({ where: { signedBySupplierAccountId: s.actor.accountId } })).toBe(0);
    } finally {
      release();
      await correcting.catch(() => undefined);
      await db.declarationText.update({ where: { id: falseTextId }, data: { bodyEn: original.bodyEn } });
    }
  });

  it("no audit row of the bank details carries a value that was saved (the trail cannot be erased)", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    await saveSection(s.actor, { version: d.v, section: { step: "epayment", creditor: { bankAccountNo: "55501234567", beneficiaryIdentityNo: "IC-770101-01-5555", beneficiaryTelephone: "0199998888" } } }, ctxFor(s.actor));
    const profile = await db.creditorProfile.findFirstOrThrow({ where: { supplierId: s.supplierId } });
    const rows = await db.auditEntry.findMany({ where: { organisationId, entity: "CreditorProfile", entityId: profile.id } });
    expect(rows.length).toBeGreaterThan(0);
    const trail = JSON.stringify(rows.map((r) => [r.entityLabel, r.changes]));
    for (const v of ["123456789", "55501234567", "IC-770101-01-5555", "0199998888", "Demonstration Contractors", "a@example.invalid", "2 Street", "1 Road", "reg4b_bank"]) expect(trail, v).not.toContain(v);
    const changed = rows.flatMap((r) => (r.changes as { field: string }[]).map((c) => c.field));
    expect(changed).toEqual(expect.arrayContaining(["bankAccountNo", "beneficiaryIdentityNo"]));
    for (const f of changed) expect(CREDITOR_FIELDS as readonly string[]).toContain(f);
  });

  it("refuses a password entry that was not asked for this session, or was already used to sign something", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    await expect(submitRegistration(s.actor, { version: d.v, declarations: declarations(), stepUpAt: new Date(Date.now() - 1000) })).rejects.toMatchObject({ faults: [expect.objectContaining({ code: "STEP_UP_NOT_CURRENT" })] });
    expect(await db.supplierApplication.count({ where: { supplierId: s.supplierId } })).toBe(0);
    // The failure rolled the whole send back, so the draft is still open.
    expect(await loadWizardState(db, s.actor)).toBe("OPEN");
  });

  it("the date stamped is the server's day: the request carries none", async () => {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    await submitRegistration(s.actor, { version: d.v, declarations: declarations(), stepUpAt: await signStep(s) });
    const decl = await db.registrationDeclaration.findMany({ where: { signedBySupplierAccountId: s.actor.accountId } });
    for (const x of decl) {
      expect(x.signedOn.toISOString().slice(0, 10)).toBe(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }));
      expect(Math.abs(Date.now() - x.signedAt.getTime())).toBeLessThan(60_000);
    }
  });
});

describe("what the database itself refuses", () => {
  async function sent() {
    const s = await supplier();
    const d = await readyDraft(s.actor);
    const r = await submitRegistration(s.actor, { version: d.v, declarations: declarations(), stepUpAt: await signStep(s) });
    const profile = await db.creditorProfile.findFirstOrThrow({ where: { supplierId: s.supplierId } });
    return { s, d, r, profile };
  }

  it("a creditor profile that was sent never changes its content, but is checked once, by an officer", async () => {
    const { profile, s } = await sent();
    expect(await refusal(db.creditorProfile.update({ where: { id: profile.id }, data: { bankAccountNo: "000" } }))).toBe("PA006");
    expect(await refusal(db.creditorProfile.update({ where: { id: profile.id }, data: { beneficiaryName: "Someone Else" } }))).toBe("PA006");
    expect(await refusal(db.creditorProfile.delete({ where: { id: profile.id } }))).toBe("PA006");
    const officer = await db.person.create({ data: { organisationId, name: "Checking Officer" } });
    // Checked without who, the day and the time: the CHECK refuses.
    expect(await refusal(db.creditorProfile.update({ where: { id: profile.id }, data: { verification: "VERIFIED" } }))).toBe("23514");
    await db.creditorProfile.update({ where: { id: profile.id }, data: { verification: "VERIFIED", verifiedByPersonId: officer.id, verifiedOn: new Date("2026-10-10T00:00:00Z"), verifiedAt: new Date(), verificationNote: "Matches the statement" } });
    expect(await refusal(db.creditorProfile.update({ where: { id: profile.id }, data: { verificationNote: "Changed my mind" } }))).toBe("PA006");
    expect(await refusal(db.creditorProfile.update({ where: { id: profile.id }, data: { verification: "NOT_IN_ORDER" } }))).toBe("PA006");
    void s;
  });

  it("a draft profile cannot be marked checked", async () => {
    const { actor, supplierId } = await supplier();
    const made = await upload(actor, 0, { kind: "statement" });
    const officer = await db.person.create({ data: { organisationId, name: "Checking Officer" } });
    expect(await refusal(db.creditorProfile.update({ where: { id: made.rowId! }, data: { verification: "VERIFIED", verifiedByPersonId: officer.id, verifiedOn: new Date(), verifiedAt: new Date() } }))).toBe("PA006");
    void supplierId;
  });

  it("a signed declaration is evidence: no update, no delete", async () => {
    const { r } = await sent();
    const d = await db.registrationDeclaration.findFirstOrThrow({ where: { applicationId: r.applicationId } });
    expect(await refusal(db.registrationDeclaration.update({ where: { id: d.id }, data: { signatoryName: "Someone Else" } }))).toBe("PA001");
    expect(await refusal(db.registrationDeclaration.delete({ where: { id: d.id } }))).toBe("PA001");
  });

  it("a registration that was sent is frozen, and so is everything on it", async () => {
    const { s, d } = await sent();
    const draft = await db.registrationDraft.findUniqueOrThrow({ where: { supplierId: s.supplierId } });
    expect(await refusal(db.registrationDraft.update({ where: { id: draft.id }, data: { signatoryName: "Changed" } }))).toBe("PA007");
    expect(await refusal(db.registrationDraft.delete({ where: { id: draft.id } }))).toBe("PA007");
    expect(await refusal(db.registrationDraftDocument.update({ where: { id: d.rows.reg }, data: { reference: "Changed" } }))).toBe("PA007");
    expect(await refusal(db.registrationDraftDocument.create({ data: { organisationId, draftId: draft.id, typeId: typeSst } }))).toBe("PA007");
    expect(await refusal(db.registrationDraftValue.deleteMany({ where: { draftDocumentId: d.rows.works } }))).toBe("PA007");
    // And through the store: a save and an upload after the send are refused as sent.
    await expect(saveSection(s.actor, { version: 99, section: { step: "review" } }, ctxFor(s.actor))).rejects.toMatchObject({ kind: "SENT" });
    await expect(upload(s.actor, 99, { kind: "document", documentId: null, typeId: typeSst, title: "" })).rejects.toMatchObject({ kind: "SENT" });
  });

  it("exactly one recorder of a document or a version, and the pair on an application the supplier sent", async () => {
    const { s, r } = await sent();
    const person = await db.person.create({ data: { organisationId, name: "Someone" } });
    const doc = await db.supplierDocument.findFirstOrThrow({ where: { supplierId: s.supplierId } });
    expect(await refusal(db.supplierDocument.update({ where: { id: doc.id }, data: { recordedByPersonId: person.id } }))).toBe("23514");
    expect(await refusal(db.supplierDocument.update({ where: { id: doc.id }, data: { recordedBySupplierAccountId: null } }))).toBe("23514");
    expect(await refusal(db.supplierApplication.update({ where: { id: r.applicationId }, data: { submittedAt: null } }))).toBe("23514");
    expect(await refusal(db.supplierApplication.update({ where: { id: r.applicationId }, data: { recordedByPersonId: person.id } }))).toBe("23514");
    expect(await refusal(db.supplierApplication.update({ where: { id: r.applicationId }, data: { channel: "COUNTER" } }))).toBe("23514");
  });

  it("an attachment names one owner, and a statement's purpose needs a profile", async () => {
    const { s, r } = await sent();
    const version = await db.documentVersion.findFirstOrThrow({ where: { recordedBySupplierAccountId: s.actor.accountId } });
    const profile = await db.creditorProfile.findFirstOrThrow({ where: { supplierId: s.supplierId } });
    expect(await refusal(db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_BANK_STATEMENT", versionId: version.id, supplierApplicationId: r.applicationId } }))).toBe("23514");
    expect(await refusal(db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_DRAFT_DOCUMENT", versionId: version.id, creditorProfileId: profile.id } }))).toBe("23514");
    expect(await refusal(db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_BANK_STATEMENT", versionId: version.id, creditorProfileId: profile.id, supplierApplicationId: r.applicationId } }))).toBe("23514");
  });

  it("a rate is a percentage from nothing to a hundred", async () => {
    const { s } = await sent();
    const doc = await db.supplierDocument.findFirstOrThrow({ where: { supplierId: s.supplierId } });
    expect(await refusal(db.supplierDocument.update({ where: { id: doc.id }, data: { ratePercent: "100.01" } }))).toBe("23514");
    await db.supplierDocument.update({ where: { id: doc.id }, data: { ratePercent: "8.5" } });
  });

  it("the access logs accept a supplier as the actor, and only one actor", async () => {
    const { actor } = await supplier();
    await db.sulitAccessEvent.create({ data: { organisationId, actorSupplierAccountId: actor.accountId, scope: "creditorProfile", entity: "CreditorProfile", entityId: "x", fields: ["bankAccountNo"], outcome: "GRANTED", basis: "OWN_RECORD" } });
    expect(await refusal(db.sulitAccessEvent.create({ data: { organisationId, actorSupplierAccountId: actor.accountId, actorSystemLabel: "also", scope: "creditorProfile", entity: "CreditorProfile", entityId: "x", fields: ["bankAccountNo"], outcome: "GRANTED", basis: "OWN_RECORD" } }))).toBe("23514");
    expect(await refusal(db.sulitAccessEvent.create({ data: { organisationId, actorSupplierAccountId: actor.accountId, scope: "creditorProfile", entity: "CreditorProfile", entityId: "x", fields: ["bankAccountNo"], outcome: "WITHHELD", basis: "OWN_RECORD" } }))).toBe("23514");
    expect(await refusal(db.sulitAccessEvent.create({ data: { organisationId, actorSupplierAccountId: actor.accountId, scope: "nothing", entity: "CreditorProfile", entityId: "x", fields: ["bankAccountNo"], outcome: "GRANTED", basis: "OWN_RECORD" } }))).toBe("23514");
    await db.documentAccessEvent.create({ data: { organisationId, kind: "DOWNLOADED", actorSupplierAccountId: actor.accountId } });
    expect(await refusal(db.documentAccessEvent.create({ data: { organisationId, kind: "DOWNLOADED", actorSupplierAccountId: actor.accountId, actorSystemLabel: "also" } }))).toBe("23514");
  });
});

describe("one supplier's registration is invisible to another (a supplier named in a request is never read)", () => {
  it("a file is found for the supplier whose draft, bank statement or document it hangs on, and for nobody else: another supplier's is not found, and reads the same as one that does not exist", async () => {
    const a = await supplier();
    const b = await supplier();
    const d = await readyDraft(a.actor);
    const draftFile = (await db.documentAttachment.findFirstOrThrow({ where: { registrationDraftDocumentId: d.rows.reg, purpose: "SUPPLIER_DRAFT_DOCUMENT" } })).versionId;
    const statementFile = d.statement.versionId;
    expect((await findOwnVersion(db, a.actor, draftFile))?.id).toBe(draftFile);
    expect((await findOwnVersion(db, a.actor, statementFile))?.creditorProfileId).toBeTruthy();
    for (const id of [draftFile, statementFile, "no_such_version_id"]) expect(await findOwnVersion(db, b.actor, id), id).toBeNull();
    // Once sent, the file hangs on the supplier's document and is still its own alone.
    const at = await signStep(a);
    await submitRegistration(a.actor, { version: d.v, declarations: declarations(), stepUpAt: at });
    const promoted = (await db.supplierDocument.findFirstOrThrow({ where: { supplierId: a.supplierId, typeId: typeReg }, include: { attachments: true } })).attachments[0]!.versionId;
    expect((await findOwnVersion(db, a.actor, promoted))?.id).toBe(promoted);
    expect(await findOwnVersion(db, b.actor, promoted)).toBeNull();
    // Nor does an actor with another organisation's id see it.
    expect(await findOwnVersion(db, { organisationId: "another_organisation", supplierId: a.supplierId }, promoted)).toBeNull();
  });

  it("a version an officer attached to the supplier's document and then detached is not the supplier's to fetch; its own withdrawn upload still is", async () => {
    const a = await supplier();
    const b = await supplier();
    const da = await readyDraft(a.actor);
    const draftB = await readyDraft(b.actor);
    await submitRegistration(a.actor, { version: da.v, declarations: declarations(), stepUpAt: await signStep(a) });
    const aDoc = await db.supplierDocument.findFirstOrThrow({ where: { supplierId: a.supplierId, typeId: typeReg } });
    // B's certificate, as it hangs on B's draft: attached to A's document by an officer's mistake.
    const bFile = (await db.documentAttachment.findFirstOrThrow({ where: { registrationDraftDocumentId: draftB.rows.reg, purpose: "SUPPLIER_DRAFT_DOCUMENT" } })).versionId;
    expect(await findOwnVersion(db, a.actor, bFile)).toBeNull();
    const mistaken = await db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_DOCUMENT", versionId: bFile, supplierDocumentId: aDoc.id } });
    expect((await findOwnVersion(db, a.actor, bFile))?.id, "while the mistake stands").toBe(bFile);
    await db.documentAttachment.update({ where: { id: mistaken.id }, data: { detachedAt: new Date(), detachReason: "Attached to the wrong supplier" } });
    expect(await findOwnVersion(db, a.actor, bFile), "once corrected").toBeNull();
    // The same for a bank statement: a version detached from the profile is gone from the supplier too.
    const bStatement = draftB.statement.versionId;
    const wrongStatement = await db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_DOCUMENT", versionId: bStatement, supplierDocumentId: aDoc.id } });
    await db.documentAttachment.update({ where: { id: wrongStatement.id }, data: { detachedAt: new Date(), detachReason: "Attached to the wrong supplier" } });
    expect(await findOwnVersion(db, a.actor, bStatement)).toBeNull();

    // A's own upload, withdrawn from a draft of its own: the supplier uploaded it, so it can still open it.
    const c = await supplier();
    const up = await upload(c.actor, 0, { kind: "document", documentId: null, typeId: typeReg, title: "" });
    const own = (await db.documentAttachment.findFirstOrThrow({ where: { registrationDraftDocumentId: up.rowId!, purpose: "SUPPLIER_DRAFT_DOCUMENT" } })).versionId;
    await withdrawDraftFile(c.actor, { version: up.version, versionId: own });
    expect((await findOwnVersion(db, c.actor, own))?.id).toBe(own);
    expect(await findOwnVersion(db, a.actor, own)).toBeNull();
  });

  it("the sent registration's summary for the supplier names no officer and carries no officer's note, though the office's own copy does", async () => {
    const a = await supplier();
    const d = await readyDraft(a.actor);
    await submitRegistration(a.actor, { version: d.v, declarations: declarations(), stepUpAt: await signStep(a) });
    const officer = await db.person.create({ data: { organisationId, name: "Officer Zainal Abidin Binti Ghazali" } });
    const doc = await db.supplierDocument.findFirstOrThrow({ where: { supplierId: a.supplierId, typeId: typeReg } });
    await db.supplierDocument.update({ where: { id: doc.id }, data: { verification: "NOT_IN_ORDER", verifiedByPersonId: officer.id, verifiedOn: new Date("2026-10-10T00:00:00Z"), verifiedAt: new Date(), verificationNote: "The seal looks altered, ask the board" } });
    const profile = await db.creditorProfile.findFirstOrThrow({ where: { supplierId: a.supplierId } });
    await db.creditorProfile.update({ where: { id: profile.id }, data: { verification: "VERIFIED", verifiedByPersonId: officer.id, verifiedOn: new Date("2026-10-10T00:00:00Z"), verifiedAt: new Date(), verificationNote: "Account number differs from the first statement" } });
    const scope = { organisationId, supplierId: a.supplierId };
    const [row] = await loadCreditorRows(db, scope);
    const record = {
      company: (await loadCompanySummary(db, scope, "APPLICATION"))!,
      contacts: sulitGranted(await loadContactsSummary(db, scope), "OWN_RECORD"),
      documents: await loadSentDocumentsSummary(db, scope),
      creditor: sulitGranted(await creditorSummaryOf(db, organisationId, row!), "OWN_RECORD"),
      declarations: await loadDeclarationsSummary(db, scope, "Asia/Kuala_Lumpur"),
    };
    const fmt = { day: (iso: string) => iso };
    const office = JSON.stringify(registrationSummary(record, fmt));
    expect(office).toContain("Officer Zainal Abidin");
    const supplierCopy = JSON.stringify(registrationSummary(forSupplier(record), fmt));
    for (const leaked of ["Zainal", "seal looks altered", "differs from the first statement"]) expect(supplierCopy, leaked).not.toContain(leaked);
    expect(supplierCopy).toContain("Checked and found not in order, 2026-10-10");
    expect(supplierCopy).toContain("Checked and in order, 2026-10-10");
  });

  it("the summary reads one supplier's rows at a time: the loaders are scoped by the supplier and the organisation they are given", async () => {
    const a = await supplier();
    const b = await supplier();
    const d = await readyDraft(a.actor);
    await submitRegistration(a.actor, { version: d.v, declarations: declarations(), stepUpAt: await signStep(a) });
    const scopeA = { organisationId, supplierId: a.supplierId };
    const scopeB = { organisationId, supplierId: b.supplierId };
    expect((await loadSentDocumentsSummary(db, scopeA)).length).toBe(2);
    expect(await loadSentDocumentsSummary(db, scopeB)).toEqual([]);
    expect((await loadDeclarationsSummary(db, scopeA, "Asia/Kuala_Lumpur")).map((x) => x.kind).sort()).toEqual(["FALSE_DECLARATION", "GIRO_AUTHORISATION"]);
    expect(await loadDeclarationsSummary(db, scopeB, "Asia/Kuala_Lumpur")).toEqual([]);
    expect(await loadCreditorRows(db, scopeB)).toEqual([]);
    expect(await loadCreditorRows(db, { organisationId: "another_organisation", supplierId: a.supplierId })).toEqual([]);
    expect(await loadCompanySummary(db, { organisationId: "another_organisation", supplierId: a.supplierId }, "REGISTER")).toBeNull();
    // The bank's and the account type's names are read from the lists, not typed codes; the statement by its file's name; and the version the supplier sent says it waits for a check.
    const [row] = await loadCreditorRows(db, scopeA);
    expect(row).toMatchObject({ version: 1, verification: "NOT_CHECKED" });
    const summary = await creditorSummaryOf(db, organisationId, row!);
    expect(summary).toMatchObject({ bankName: "Demonstration Bank", accountTypeName: "Current account" });
    expect(summary.statementFiles).toHaveLength(1);
    expect(summary.verification).toMatchObject({ state: "NOT_CHECKED" });
    // The documents show who lodged them, in words and not a login, with the codes as "code — name".
    const docs = await loadSentDocumentsSummary(db, scopeA);
    const works = docs.find((x) => x.typeName === "Works board certificate")!;
    expect(works.codes.sort()).toEqual(["B — Buildings", "G1 — Grade one"]);
    expect(works.lodgedBy).toMatch(/portal account/i);
    expect(works.files.every((f) => f.scanLabel === "Not scanned")).toBe(true);
    expect(JSON.stringify(docs)).not.toContain(a.actor.loginName);
  });
});
