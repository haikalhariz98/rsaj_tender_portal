import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import { creditorNamedFacts } from "@/lib/auth/creditor-access-store";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { UploadRefusal } from "@/lib/documents/service";
import { sha256Hex } from "@/lib/documents/store";
import { postgresBlobStore } from "@/lib/documents/store/postgres";
import { creditorStanding } from "@/lib/payment/creditor";
import { creditorFactsOf } from "@/lib/payment/creditor-store";
import { frozenWording } from "@/lib/portal/registration/declaration";
import { CREDITOR_FIELDS, EMPTY_CREDITOR } from "@/lib/portal/registration/types";
import { documentState } from "@/lib/suppliers/documents";
import { documentFacts } from "@/lib/suppliers/repo";
import { ensureAdministrator, facts, makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import type { BankChangeInput } from "./bank";
import { sendBankChange } from "./bank-store";
import { loadBankTab, loadDocumentsTab, loadOpenRequest } from "./company-store";
import { CompanyRefused } from "./errors";
import { storeReplacement, type ReplacementTarget, waitingUsage } from "./replace-store";

/**
 * The Company workspace's writes against a real database (Phase 4c): a renewal and an answer to the office's request lodged as the supplier's own document, waiting for a check and
 * leaving the one in force in force; the rules judged on the locked rows (the item, the deadline, the quota, the order of two that arrive together); and a change of bank details as a
 * new version, signed, that leaves the version in force until an officer has checked the new one.
 */

let organisationId: string;
let classCert: string;
let classStatement: string;
let typeReg: string;
let typeWorks: string;
let typeOther: string;
let bodyId: string;
let gradeId: string;
let giroTextId: string;
let giroSha: string;

const PDF = (n: number) => new TextEncoder().encode(`%PDF-1.4 company ${n} ${randomId()}`);
const STORE = { allowedTypes: ["application/pdf"], capBytes: 100_000n };
const D = (day: string) => new Date(`${day}T00:00:00.000Z`);
const ORG = () => ({ id: organisationId, code: "AUTH_TEST", timeZone: "Asia/Kuala_Lumpur", today: "2026-10-09" });
const dayNow = async () => (await import("@/lib/dates")).todayIn(new Date(), "Asia/Kuala_Lumpur")!;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await ensureAdministrator(organisationId);
  await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
  const mk = (code: string, classification: "SULIT" | "INTERNAL") => db.documentClass.upsert({ where: { organisationId_code: { organisationId, code } }, update: { classification }, create: { organisationId, code, nameEn: `Class ${code}`, classification } });
  classCert = (await mk("co4c_cert", "INTERNAL")).id;
  classStatement = (await mk("co4c_statement", "SULIT")).id;
  const policy = { verificationNoticeEn: "The office checks it.", uploadMaxFilesPerApplication: 6, uploadMaxBytesPerApplication: 1_000_000n, supplierUploadClassId: classCert, supplierBankStatementClassId: classStatement };
  await db.supplierPolicy.upsert({ where: { organisationId }, update: policy, create: { organisationId, ...policy } });
  const body = await db.registrationBody.upsert({ where: { organisationId_code: { organisationId, code: "co4c_board" } }, update: {}, create: { organisationId, code: "co4c_board", labelEn: "the Works board", provenance: "ASSUMED" } });
  bodyId = body.id;
  const type = (code: string, nameEn: string, extra: Record<string, unknown> = {}) =>
    db.supplierDocumentType.upsert({ where: { organisationId_code: { organisationId, code } }, update: { retiredOn: null, ...extra }, create: { organisationId, code, nameEn, provenance: "ASSUMED", expires: true, mandatoryAtRegistration: true, notApplicableAllowed: false, ...extra } });
  typeReg = (await type("co4c_reg", "Companies registry certificate")).id;
  typeWorks = (await type("co4c_works", "Works board certificate", { bodyId, valueKinds: ["GRADE", "CATEGORY"] })).id;
  typeOther = (await type("co4c_other", "Other", { mandatoryAtRegistration: false, repeatable: true })).id;
  gradeId = (await db.registrationValue.upsert({ where: { bodyId_kind_code: { bodyId, kind: "GRADE", code: "G1" } }, update: {}, create: { organisationId, bodyId, kind: "GRADE", code: "G1", nameEn: "Grade one", provenance: "ASSUMED" } })).id;
  const list = (code: string, kind: "BANK" | "ACCOUNT_TYPE", nameEn: string) => db.supplierListValue.upsert({ where: { organisationId_list_code: { organisationId, list: kind, code } }, update: { retiredOn: null }, create: { organisationId, list: kind, code, nameEn, provenance: "ASSUMED" } });
  await list("co4c_bank", "BANK", "Demonstration Bank");
  await list("co4c_current", "ACCOUNT_TYPE", "Current account");
  const existing = await db.declarationText.findFirst({ where: { organisationId, kind: "GIRO_AUTHORISATION", version: 1 } });
  giroTextId = existing?.id ?? (await db.declarationText.create({ data: { organisationId, kind: "GIRO_AUTHORISATION", version: 1, bodyEn: "We authorise {organisation} to pay.", bodyMs: null, provenance: "ASSUMED", governingSource: "A demonstration wording", issuedOn: D("2026-01-01") } })).id;
  const [t, o] = await Promise.all([db.declarationText.findUniqueOrThrow({ where: { id: giroTextId } }), db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true } })]);
  giroSha = frozenWording(t, o.name).sha256;
});

// The scratch organisation is shared by every database test, and the registration's rules ask for every live mandatory document type: these tests' types are retired when they are done,
// so a type of theirs is never one another file's registration is asked for.
afterAll(async () => {
  await db.supplierDocumentType.updateMany({ where: { organisationId, code: { startsWith: "co4c_" } }, data: { retiredOn: D("2000-01-01") } });
});

/// A supplier with a live account, signed in, as the actor the portal reads from its session; `status` is what the register says of it.
async function supplier(status: "REGISTERED" | "APPLICANT" = "REGISTERED"): Promise<{ actor: SupplierActor; password: string; supplierId: string; accountId: string }> {
  const s = await makeSupplierAccount(organisationId);
  if (status === "REGISTERED") await db.supplier.update({ where: { id: s.supplier.id }, data: { status, registeredOn: D("2026-01-01") } });
  const signedIn = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!signedIn.ok) throw new Error("sign-in failed");
  const read = await readSupplierSession(signedIn.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session failed");
  return { actor: read.actor, password: s.password, supplierId: s.supplier.id, accountId: s.account!.id };
}

/// A document of the supplier's, as an officer or an earlier registration left it.
async function held(s: { supplierId: string; accountId: string }, typeId: string, o: { verification?: "VERIFIED" | "NOT_CHECKED" | "NOT_IN_ORDER"; expiresOn?: string; supersedesId?: string | null; applicationId?: string | null; title?: string } = {}) {
  const verification = o.verification ?? "VERIFIED";
  return db.supplierDocument.create({
    data: {
      organisationId,
      supplierId: s.supplierId,
      typeId,
      typeLabelSnapshot: "A certificate",
      reference: `H-${randomId()}`,
      issuingAuthority: "An authority",
      title: o.title ?? "",
      expiresOn: D(o.expiresOn ?? "2027-01-01"),
      validFrom: D("2026-01-01"),
      supersedesId: o.supersedesId ?? null,
      applicationId: o.applicationId ?? null,
      lodgedOn: D("2026-01-02"),
      recordedAt: new Date(),
      recordedBySupplierAccountId: s.accountId,
      verification,
      ...(verification === "NOT_CHECKED" ? {} : { verifiedOn: D("2026-01-03"), verifiedAt: new Date() }),
    },
  });
}

const details = (o: Partial<{ reference: string; issuingAuthority: string; expiresOn: string; ratePercent: string; title: string; valueIds: string[] }> = {}) => ({ reference: "R-NEW", issuingAuthority: "Board", expiresOn: "2028-06-30", ratePercent: "", title: "", valueIds: [] as string[], ...o });

async function replace(actor: SupplierActor, target: ReplacementTarget, d = details(), n = Math.floor(Math.random() * 1e9), policyOver: Partial<{ classId: string | null; maxFiles: number | null; maxBytes: bigint | null }> = {}) {
  const bytes = PDF(n);
  return storeReplacement(actor, {
    target,
    details: d,
    bytes,
    sha256: sha256Hex(bytes),
    mediaType: "application/pdf",
    originalFilename: `file-${n}.pdf`,
    org: ORG(),
    store: postgresBlobStore,
    storeSettings: STORE,
    policy: { classId: classCert, maxFiles: 6, maxBytes: 1_000_000n, ...policyOver },
  });
}

const refusedWith = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(CompanyRefused);
  expect((e as CompanyRefused).faults.map((f) => f.code), code).toContain(code);
};

/// A resubmission request on an application of the supplier: one item about a document, one about a type not given.
async function request(s: { supplierId: string }, o: { resubmitBy?: string; documentId?: string | null; typeId?: string | null } = {}) {
  const app = await db.supplierApplication.create({ data: { organisationId, supplierId: s.supplierId, kind: "NEW", receivedOn: D("2026-10-01"), channel: "COUNTER", recordedByPersonId: (await makePerson(organisationId)).id, recordedAt: new Date(), status: "RESUBMISSION_REQUESTED", resubmitBy: D(o.resubmitBy ?? "2099-01-01") } });
  const person = await makePerson(organisationId);
  const decision = await db.applicationDecision.create({
    data: {
      organisationId, applicationId: app.id, outcome: "RESUBMIT", remarks: "Send what is missing.", resubmitBy: D(o.resubmitBy ?? "2099-01-01"), decidedByPersonId: person.id, decidedOn: D("2026-10-05"), decidedAt: new Date(),
      items: { create: [{ organisationId, supplierDocumentId: o.documentId ?? null, documentTypeId: o.documentId ? null : (o.typeId ?? typeReg), labelSnapshot: "The item", remarks: "The scan is not legible." }] },
    },
    include: { items: true },
  });
  return { applicationId: app.id, itemId: decision.items[0]!.id };
}

describe("a renewal by a registered supplier (FR-VND-008)", () => {
  it("lodges the supplier's own document, waiting for a check, over the one in force, which stays in force", async () => {
    const s = await supplier();
    const old = await held(s, typeReg, { expiresOn: "2027-01-01" });
    const done = await replace(s.actor, { kind: "renew", documentId: old.id }, details({ expiresOn: "2028-06-30" }));
    const row = await db.supplierDocument.findUniqueOrThrow({ where: { id: done.documentId }, include: { attachments: true, values: true } });
    expect(row).toMatchObject({ supplierId: s.supplierId, supersedesId: old.id, verification: "NOT_CHECKED", recordedBySupplierAccountId: s.accountId, recordedByPersonId: null, answersItemId: null, applicationId: null });
    expect(row.attachments).toHaveLength(1);
    expect(row.attachments[0]).toMatchObject({ purpose: "SUPPLIER_DOCUMENT", versionId: done.versionId });
    // The old one is still the one in force; the renewal is waiting.
    const all = (await db.supplierDocument.findMany({ where: { supplierId: s.supplierId } })).map(documentFacts);
    const st = documentState(all, "2026-10-09");
    expect(st.effective?.id).toBe(old.id);
    expect(st.pending?.id).toBe(done.documentId);
    // Recorded by the supplier's account, with the version, and audited in the supplier's name.
    const version = await db.documentVersion.findUniqueOrThrow({ where: { id: done.versionId } });
    expect(version).toMatchObject({ recordedBySupplierAccountId: s.accountId, recordedByPersonId: null });
    const audit = await db.auditEntry.findFirst({ where: { entityId: done.documentId, action: "CREATE" } });
    expect(audit?.entity).toBe("SupplierDocument");
  });

  it("a second renewal of the same document is refused once the first stands", async () => {
    const s = await supplier();
    const old = await held(s, typeReg);
    await replace(s.actor, { kind: "renew", documentId: old.id });
    await refusedWith(replace(s.actor, { kind: "renew", documentId: old.id }), "RENEWS_SUPERSEDED");
  });

  it("two that arrive together: one is lodged and the other is judged on what the first left", async () => {
    const s = await supplier();
    const old = await held(s, typeReg);
    const results = await Promise.allSettled([replace(s.actor, { kind: "renew", documentId: old.id }, details({ reference: "A" })), replace(s.actor, { kind: "renew", documentId: old.id }, details({ reference: "B" }))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.supplierDocument.count({ where: { supersedesId: old.id } })).toBe(1);
  });

  it("the new expiry must be later than the checked one, and a renewal in the past is refused; nothing is stored", async () => {
    const s = await supplier();
    const old = await held(s, typeReg, { expiresOn: "2027-01-01" });
    await refusedWith(replace(s.actor, { kind: "renew", documentId: old.id }, details({ expiresOn: "2027-01-01" })), "RENEWAL_NOT_LATER");
    await refusedWith(replace(s.actor, { kind: "renew", documentId: old.id }, details({ expiresOn: "2026-01-01" })), "ALREADY_EXPIRED");
    expect(await db.supplierDocument.count({ where: { supplierId: s.supplierId } })).toBe(1);
    expect(await db.documentAttachment.count({ where: { supplierDocument: { supplierId: s.supplierId } } })).toBe(0);
  });

  it("another supplier's document is not found", async () => {
    const mine = await supplier();
    const other = await supplier();
    const theirs = await held(other, typeReg);
    const e = await replace(mine.actor, { kind: "renew", documentId: theirs.id }).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(CompanyRefused);
    expect((e as CompanyRefused).status).toBe(404);
    expect(await db.supplierDocument.count({ where: { supersedesId: theirs.id } })).toBe(0);
  });

  it("the codes are recorded as they were named, and one that is not of the document's body is refused", async () => {
    const s = await supplier();
    const old = await held(s, typeWorks);
    const done = await replace(s.actor, { kind: "renew", documentId: old.id }, details({ valueIds: [gradeId] }));
    const values = await db.supplierDocumentValue.findMany({ where: { documentId: done.documentId } });
    expect(values.map((v) => [v.codeSnapshot, v.labelSnapshot])).toEqual([["G1", "Grade one"]]);
    const reg = await held(s, typeReg);
    await refusedWith(replace(s.actor, { kind: "renew", documentId: reg.id }, details({ valueIds: [gradeId] })), "VALUE_NOT_FOR_DOCUMENT");
  });

  it("a type lodged several times is given a title, and a title already held is refused", async () => {
    const s = await supplier();
    await replace(s.actor, { kind: "new", typeId: typeOther }, details({ title: "Safety" }));
    await refusedWith(replace(s.actor, { kind: "new", typeId: typeOther }, details({ title: "safety" })), "TITLE_DUPLICATE");
    await refusedWith(replace(s.actor, { kind: "new", typeId: typeOther }, details({ title: "" })), "TITLE_REQUIRED");
  });

  it("an applicant, with no request open, lodges nothing here", async () => {
    const s = await supplier("APPLICANT");
    await refusedWith(replace(s.actor, { kind: "new", typeId: typeReg }), "NOT_ON_REGISTER");
  });
});

describe("answering the office's request online (FR-VND-007)", () => {
  it("lodges the document against the item and the application, waiting for a check; a second answer is refused until the office has checked the first", async () => {
    const s = await supplier("APPLICANT");
    const bad = await held(s, typeReg, { verification: "NOT_IN_ORDER" });
    const r = await request(s, { documentId: bad.id });
    const loaded = await loadOpenRequest(db, (await supplier("APPLICANT")).actor);
    expect(loaded).toBeNull();
    const own = await loadOpenRequest(db, s.actor);
    expect(own?.items.map((i) => i.id)).toEqual([r.itemId]);
    const done = await replace(s.actor, { kind: "item", itemId: r.itemId }, details());
    const row = await db.supplierDocument.findUniqueOrThrow({ where: { id: done.documentId } });
    expect(row).toMatchObject({ answersItemId: r.itemId, applicationId: r.applicationId, supersedesId: bad.id, verification: "NOT_CHECKED" });
    await refusedWith(replace(s.actor, { kind: "item", itemId: r.itemId }), "ITEM_WAITING");
    // The office finds it not in order: it may be sent again, as a renewal of the one just sent.
    await db.supplierDocument.update({ where: { id: done.documentId }, data: { verification: "NOT_IN_ORDER", verifiedOn: D("2026-10-06"), verifiedAt: new Date(), verificationNote: "Still not legible." } });
    const again = await replace(s.actor, { kind: "item", itemId: r.itemId }, details({ reference: "R-AGAIN" }));
    expect((await db.supplierDocument.findUniqueOrThrow({ where: { id: again.documentId } })).supersedesId).toBe(done.documentId);
  });

  it("a type the office asked for and the supplier had not given is lodged as a first document", async () => {
    const s = await supplier("APPLICANT");
    const r = await request(s, { typeId: typeReg });
    const done = await replace(s.actor, { kind: "item", itemId: r.itemId }, details());
    expect(await db.supplierDocument.findUniqueOrThrow({ where: { id: done.documentId } })).toMatchObject({ typeId: typeReg, supersedesId: null, answersItemId: r.itemId });
  });

  it("after the deadline the request is closed and nothing is stored; the deadline day itself is still open", async () => {
    const s = await supplier("APPLICANT");
    const late = await request(s, { typeId: typeReg, resubmitBy: "2020-01-01" });
    await refusedWith(replace(s.actor, { kind: "item", itemId: late.itemId }), "REQUEST_LAPSED");
    expect(await db.supplierDocument.count({ where: { supplierId: s.supplierId } })).toBe(0);
    const today = await dayNow();
    const s2 = await supplier("APPLICANT");
    const open = await request(s2, { typeId: typeReg, resubmitBy: today });
    await expect(replace(s2.actor, { kind: "item", itemId: open.itemId })).resolves.toBeTruthy();
  });

  it("an item of another supplier's request is not found, and a request that was decided is closed", async () => {
    const a = await supplier("APPLICANT");
    const b = await supplier("APPLICANT");
    const theirs = await request(b, { typeId: typeReg });
    await refusedWith(replace(a.actor, { kind: "item", itemId: theirs.itemId }), "ITEM_NOT_FOUND");
    expect(await db.supplierDocument.count({ where: { OR: [{ supplierId: a.supplierId }, { answersItemId: theirs.itemId }] } })).toBe(0);
    await db.supplierApplication.update({ where: { id: theirs.applicationId }, data: { status: "REJECTED" } });
    await refusedWith(replace(b.actor, { kind: "item", itemId: theirs.itemId }), "ITEM_NOT_FOUND");
  });

  it("a newer request makes an older request's item not found", async () => {
    const s = await supplier("APPLICANT");
    const first = await request(s, { typeId: typeReg });
    const app = await db.supplierApplication.findUniqueOrThrow({ where: { id: first.applicationId } });
    const person = await makePerson(organisationId);
    await db.applicationDecision.create({ data: { organisationId, applicationId: app.id, outcome: "RESUBMIT", remarks: "Newer.", resubmitBy: D("2099-01-01"), decidedByPersonId: person.id, decidedOn: D("2026-10-08"), decidedAt: new Date(Date.now() + 1000) } });
    await refusedWith(replace(s.actor, { kind: "item", itemId: first.itemId }), "ITEM_NOT_FOUND");
  });
});

describe("a request answered on the deadline day is not a lapse the day after (FR-VND-007 online)", () => {
  it("is named answered in time once every item has a document lodged on or before the deadline day, and not before", async () => {
    const today = await dayNow();
    const s = await supplier("APPLICANT");
    const app = await db.supplierApplication.create({ data: { organisationId, supplierId: s.supplierId, kind: "NEW", receivedOn: D("2026-10-01"), channel: "COUNTER", recordedByPersonId: (await makePerson(organisationId)).id, recordedAt: new Date(), status: "RESUBMISSION_REQUESTED", resubmitBy: D(today) } });
    const person = await makePerson(organisationId);
    const decision = await db.applicationDecision.create({
      data: {
        organisationId, applicationId: app.id, outcome: "RESUBMIT", remarks: "Send both.", resubmitBy: D(today), decidedByPersonId: person.id, decidedOn: D("2026-10-05"), decidedAt: new Date(),
        items: { create: [{ organisationId, documentTypeId: typeReg, labelSnapshot: "The registry certificate", remarks: "Not given." }, { organisationId, documentTypeId: typeOther, labelSnapshot: "Another document", remarks: "Not given." }] },
      },
      include: { items: true },
    });
    const { answeredOnTimeIds } = await import("@/lib/suppliers/repo");
    expect((await answeredOnTimeIds(db, organisationId, [app.id])).has(app.id)).toBe(false);
    await replace(s.actor, { kind: "item", itemId: decision.items[0]!.id }, details());
    expect((await answeredOnTimeIds(db, organisationId, [app.id])).has(app.id)).toBe(false);
    await replace(s.actor, { kind: "item", itemId: decision.items[1]!.id }, details({ title: "Safety" }));
    expect((await answeredOnTimeIds(db, organisationId, [app.id])).has(app.id)).toBe(true);
    // A request that was decided is not waiting on the supplier any more.
    await db.supplierApplication.update({ where: { id: app.id }, data: { status: "REJECTED" } });
    expect((await answeredOnTimeIds(db, organisationId, [app.id])).has(app.id)).toBe(false);
    expect(await answeredOnTimeIds(db, organisationId, [])).toEqual(new Set());
  });
});

describe("what is waiting bounds what may be sent (the quota)", () => {
  it("counts the files of documents nobody has checked, and frees them as the office checks", async () => {
    const s = await supplier();
    const old = await held(s, typeReg);
    const a = await replace(s.actor, { kind: "renew", documentId: old.id });
    expect((await waitingUsage(db, organisationId, s.supplierId)).files).toBe(1);
    await db.supplierDocument.update({ where: { id: a.documentId }, data: { verification: "VERIFIED", verifiedOn: D("2026-10-06"), verifiedAt: new Date() } });
    expect((await waitingUsage(db, organisationId, s.supplierId)).files).toBe(0);
  });

  it("refuses a file beyond the quota, and an unset quota or class refuses and names itself", async () => {
    const s = await supplier();
    const old = await held(s, typeReg);
    await replace(s.actor, { kind: "renew", documentId: old.id }, details(), 1, { maxFiles: 1 });
    const other = await held(s, typeWorks);
    const e = await replace(s.actor, { kind: "renew", documentId: other.id }, details(), 2, { maxFiles: 1 }).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(UploadRefusal);
    expect((e as UploadRefusal).finding.code).toBe("QUOTA_FILES");
    const unset = await replace(s.actor, { kind: "renew", documentId: other.id }, details(), 3, { maxFiles: null }).then(() => null, (x) => x);
    expect((unset as UploadRefusal).finding.code).toBe("QUOTA_NOT_SET");
    const noClass = await replace(s.actor, { kind: "renew", documentId: other.id }, details(), 4, { classId: null }).then(() => null, (x) => x);
    expect(noClass).toBeInstanceOf(UploadRefusal);
  });
});

describe("the Documents tab reads only the signed-in supplier's rows", () => {
  it("lists its own documents and none of another supplier's", async () => {
    const mine = await supplier();
    const other = await supplier();
    await held(mine, typeReg);
    await held(other, typeWorks);
    const tab = await loadDocumentsTab(db, mine.actor);
    expect(tab!.rows.find((r) => r.typeId === typeReg)!.state).toBe("VALID");
    expect(tab!.rows.flatMap((r) => [r.effective, r.pending, r.upcoming, r.head]).filter((d) => d != null).every((d) => d!.lodgedBySupplier && d!.id !== undefined)).toBe(true);
    const ids = new Set((await db.supplierDocument.findMany({ where: { supplierId: mine.supplierId }, select: { id: true } })).map((d) => d.id));
    expect(tab!.rows.flatMap((r) => [r.effective, r.pending, r.upcoming, r.head]).filter((d) => d != null).every((d) => ids.has(d!.id))).toBe(true);
    // The works certificate is mandatory, so it is listed for this supplier too - as not given, never as the other supplier's document.
    expect(tab!.rows.find((r) => r.typeId === typeWorks)!.state).toBe("MISSING");
  });
});

// ------------------------------------------------------------------ the bank details

const creditor = () => ({
  ...EMPTY_CREDITOR,
  beneficiaryName: "Demonstration Contractors",
  beneficiaryAddress: "1 Demonstration Road",
  beneficiaryIdentityNo: "202001000001",
  beneficiaryContactPerson: "Aminah",
  beneficiaryTelephone: "0123456789",
  beneficiaryEmail: "accounts@example.invalid",
  bankCode: "co4c_bank",
  bankAccountNo: "1234567890",
  bankAccountTypeCode: "co4c_current",
  bankAddress: "2 Demonstration Street",
});

async function inForce(s: { supplierId: string; accountId: string }) {
  const checker = await makePerson(organisationId);
  return db.creditorProfile.create({
    data: {
      organisationId, supplierId: s.supplierId, version: 1, enteredBySupplierAccountId: s.accountId, ...Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, creditor()[k]])),
      submittedAt: new Date("2026-02-01T02:00:00Z"), verification: "VERIFIED", verifiedByPersonId: checker.id, verifiedOn: D("2026-02-03"), verifiedAt: new Date("2026-02-03T02:00:00Z"),
    },
  });
}

async function change(s: { actor: SupplierActor; password: string }, o: { change?: Partial<BankChangeInput>; classId?: string | null; n?: number } = {}) {
  const asked = await confirmSupplierPassword(s.actor, s.password, facts());
  if (!asked.ok) throw new Error("password refused");
  const bytes = PDF(o.n ?? Math.floor(Math.random() * 1e9));
  const input: BankChangeInput = { creditor: { ...creditor(), bankAccountNo: "9999888877" }, statementFiles: 1, giro: { textVersionId: giroTextId, textSha256: giroSha, signatoryName: s.actor.displayName, signatoryDesignation: "Director", confirmed: true }, ...o.change };
  return sendBankChange(s.actor, {
    change: input,
    stepUpAt: asked.at,
    bytes,
    sha256: sha256Hex(bytes),
    mediaType: "application/pdf",
    originalFilename: "statement.pdf",
    org: ORG(),
    store: postgresBlobStore,
    storeSettings: STORE,
    policy: { classId: o.classId === undefined ? classStatement : o.classId, classIsSulit: true, maxFiles: 6, maxBytes: 1_000_000n },
  });
}

describe("changing the bank details after registration (the CPD rulings)", () => {
  it("writes a new version that waits for a check, signs its authorisation, and leaves version 1 in force", async () => {
    const s = await supplier();
    const v1 = await inForce(s);
    const sent = await change(s);
    expect(sent.version).toBe(2);
    const v2 = await db.creditorProfile.findUniqueOrThrow({ where: { id: sent.profileId }, include: { attachments: true, declarations: true } });
    expect(v2).toMatchObject({ version: 2, supersedesId: v1.id, verification: "NOT_CHECKED", enteredBySupplierAccountId: s.accountId, bankAccountNo: "9999888877" });
    expect(v2.submittedAt).not.toBeNull();
    expect(v2.attachments).toHaveLength(1);
    expect(v2.attachments[0]).toMatchObject({ purpose: "SUPPLIER_BANK_STATEMENT" });
    expect(v2.declarations).toHaveLength(1);
    expect(v2.declarations[0]).toMatchObject({ kind: "GIRO_AUTHORISATION", applicationId: null, textSha256: giroSha, signedBySupplierAccountId: s.accountId, signatoryDesignation: "Director" });
    expect(v2.declarations[0]!.frozenTextEn).toMatch(/^We authorise .+ to pay\.$/);
    // Signed: the profile carries the password's signature and the declaration a SIGNED row of its own, both by the supplier's account.
    const attributions = await db.actAttribution.findMany({ where: { entityId: { in: [v2.id, v2.declarations[0]!.id] } } });
    expect(attributions.map((a) => [a.entity, a.slot, a.mode]).sort()).toEqual([["CreditorProfile", "enteredBy", "SIGNED"], ["RegistrationDeclaration", "signedBy", "SIGNED"]]);
    expect(attributions.every((a) => a.subjectSupplierAccountId === s.accountId && a.recordedBySupplierAccountId === s.accountId)).toBe(true);
    // Payment is judged on the version an officer checked: version 1 stays in force while version 2 waits.
    const rows = await db.creditorProfile.findMany({ where: { supplierId: s.supplierId }, select: { version: true, submittedAt: true, verification: true } });
    const state = (await import("./bank")).bankState(rows.map((r) => ({ version: r.version, sent: r.submittedAt != null, verification: r.verification })));
    expect(state.inForce?.version).toBe(1);
    expect(state.waiting?.version).toBe(2);
    // What a payment reads (BD-613-44): the version an officer checked is in force, and the new one changes nothing until it is checked.
    expect(creditorStanding((await creditorFactsOf(db, organisationId, s.supplierId)).versions)).toEqual({ state: "IN_FORCE", version: 1, awaiting: 2 });
  });

  it("the trail names the fields entered and never the values", async () => {
    const s = await supplier();
    await inForce(s);
    const sent = await change(s);
    const rows = await db.auditEntry.findMany({ where: { entityId: sent.profileId } });
    const text = JSON.stringify(rows.map((r) => r.changes));
    expect(text).toContain("bankAccountNo");
    expect(text).not.toContain("9999888877");
    expect(text).not.toContain("Demonstration Contractors");
  });

  it("is refused while an earlier change waits, and nothing is written; once checked, another may be sent", async () => {
    const s = await supplier();
    await inForce(s);
    const first = await change(s);
    const before = await db.creditorProfile.count({ where: { supplierId: s.supplierId } });
    const e = await change(s).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(CompanyRefused);
    expect((e as CompanyRefused).faults.map((f) => f.code)).toContain("CHANGE_WAITING");
    expect(await db.creditorProfile.count({ where: { supplierId: s.supplierId } })).toBe(before);
    await db.creditorProfile.update({ where: { id: first.profileId }, data: { verification: "NOT_IN_ORDER", verifiedByPersonId: (await makePerson(organisationId)).id, verifiedOn: D("2026-10-09"), verifiedAt: new Date(), verificationNote: "The statement is not stamped." } });
    const second = await change(s);
    expect(second.version).toBe(3);
  });

  it("two that arrive together: one is sent", async () => {
    const s = await supplier();
    await inForce(s);
    const results = await Promise.allSettled([change(s), change(s)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.creditorProfile.count({ where: { supplierId: s.supplierId, version: 2 } })).toBe(1);
  });

  it("refuses wording that is not the wording in force, an unticked box, a bank not on the list; nothing is written", async () => {
    const s = await supplier();
    await inForce(s);
    const codes = async (o: Parameters<typeof change>[1]) => {
      const e = await change(s, o).then(() => null, (x) => x);
      expect(e).toBeInstanceOf(CompanyRefused);
      return (e as CompanyRefused).faults.map((f) => f.code);
    };
    expect(await codes({ change: { giro: { textVersionId: giroTextId, textSha256: "0".repeat(64), signatoryName: "A", signatoryDesignation: "B", confirmed: true } } })).toContain("TEXT_STALE");
    expect(await codes({ change: { giro: { textVersionId: giroTextId, textSha256: giroSha, signatoryName: "A", signatoryDesignation: "B", confirmed: false } } })).toContain("NOT_CONFIRMED");
    expect(await codes({ change: { creditor: { ...creditor(), bankCode: "nowhere" } } })).toContain("BANK_NOT_LISTED");
    expect(await db.creditorProfile.count({ where: { supplierId: s.supplierId } })).toBe(1);
  });

  it("is for a registered supplier only, and a statement class that is not SULIT refuses", async () => {
    const applicant = await supplier("APPLICANT");
    const e = await change(applicant).then(() => null, (x) => x);
    expect((e as CompanyRefused).faults.map((f) => f.code)).toContain("NOT_REGISTERED_FOR_CHANGE");
    const s = await supplier();
    await inForce(s);
    const notSulit = await change(s, { classId: classCert }).then(() => null, (x) => x);
    expect(notSulit).toBeInstanceOf(UploadRefusal);
    expect((notSulit as UploadRefusal).finding.code).toBe("STATEMENT_CLASS_NOT_SULIT");
  });

  it("a stale signature stamp is refused: one password entry signs one act", async () => {
    const s = await supplier();
    await inForce(s);
    const asked = await confirmSupplierPassword(s.actor, s.password, facts());
    if (!asked.ok) throw new Error("password refused");
    const bytes = PDF(77);
    const call = () =>
      sendBankChange(s.actor, {
        change: { creditor: { ...creditor(), bankAccountNo: "5555" }, statementFiles: 1, giro: { textVersionId: giroTextId, textSha256: giroSha, signatoryName: s.actor.displayName, signatoryDesignation: "D", confirmed: true } },
        stepUpAt: new Date(asked.at.getTime() - 60_000),
        bytes, sha256: sha256Hex(bytes), mediaType: "application/pdf", originalFilename: "s.pdf", org: ORG(), store: postgresBlobStore, storeSettings: STORE, policy: { classId: classStatement, classIsSulit: true, maxFiles: 6, maxBytes: 1_000_000n },
      });
    await expect(call()).rejects.toThrow();
    expect(await db.creditorProfile.count({ where: { supplierId: s.supplierId } })).toBe(1);
  });

  it("the Bank details tab shows the supplier its own versions and logs the reading as the supplier's", async () => {
    const s = await supplier();
    await inForce(s);
    await change(s);
    const tab = await loadBankTab(db, s.actor);
    expect(tab.state.inForce?.version).toBe(1);
    expect(tab.state.waiting?.version).toBe(2);
    expect(tab.versions.map((v) => v.row.version).sort()).toEqual([1, 2]);
    const events = await db.sulitAccessEvent.findMany({ where: { actorSupplierAccountId: s.accountId, scope: "creditorProfile" } });
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.outcome === "GRANTED" && e.basis === "OWN_RECORD")).toBe(true);
  });
});

describe("who may read and check a version sent after registration", () => {
  it("is named by the registration route of the application the supplier's first version was sent with", async () => {
    const s = await supplier();
    const person = await makePerson(organisationId);
    const app = await db.supplierApplication.create({ data: { organisationId, supplierId: s.supplierId, kind: "NEW", receivedOn: D("2026-01-02"), channel: "COUNTER", recordedByPersonId: person.id, recordedAt: new Date(), status: "APPROVED" } });
    const route = await db.approvalInstance.create({ data: { organisationId, matterKind: "SUPPLIER", supplierApplicationId: app.id, domain: "supplier_registration", openedAt: new Date("2026-01-03T02:00:00Z") } });
    await db.approvalStep.create({ data: { instanceId: route.id, sequence: 1, roleCode: `CO_${randomId()}`, roleLabel: "Only", act: "A", decision: "DONE", decidedByPersonId: person.id, decidedOn: D("2026-01-04") } });
    const v1 = await inForce(s);
    await db.registrationDeclaration.create({ data: { organisationId, applicationId: app.id, creditorProfileId: v1.id, kind: "GIRO_AUTHORISATION", textId: giroTextId, textVersion: 1, textSha256: giroSha, frozenTextEn: "x", signatoryName: "S", signatoryDesignation: "D", signedOn: D("2026-01-02"), signedAt: new Date(), signedBySupplierAccountId: s.accountId } });
    const sent = await change(s);
    const named = await creditorNamedFacts(db, organisationId, [{ id: sent.profileId, supplierId: s.supplierId, verifiedByPersonId: null }]);
    const facts1 = named.get(sent.profileId)!;
    expect(facts1.routeStarted).toBe(true);
    expect(facts1.stepDeciderIds).toEqual([person.id]);
  });

  it("a version that no application reaches is named by nobody, as before", async () => {
    const s = await supplier();
    await inForce(s);
    const sent = await change(s);
    const named = await creditorNamedFacts(db, organisationId, [{ id: sent.profileId, supplierId: s.supplierId, verifiedByPersonId: null }]);
    expect(named.get(sent.profileId)).toMatchObject({ stepHolderIds: [], stepDeciderIds: [], routeStarted: false });
  });
});
