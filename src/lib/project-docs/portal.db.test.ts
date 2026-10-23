import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { loadContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { db } from "@/lib/db";
import { makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";
import { dayOf } from "@/lib/dates";
import { loadProjectContext } from "@/lib/portal/projects/context-store";

/**
 * The contractor's Project workspace routes against a real database (plan step 5, §6; PW-8, PW-14, PW-15, PW-23, PW-28, PW-32): the three JSON acts, the staging upload and the file
 * download are called as their route handlers, with the portal's guards stood in for by the signed-in actor (the guards have their own tests, `handlers.test.ts` and
 * `supplier-reach.test.ts`); everything behind them is real. Another contractor's reach is 404 everywhere; an organisation version that waits for approval, its remarks and its
 * files are never read; an organisation document the contractor did not ask for is not listed, not opened, not downloaded and not exported; the window refuses at the 61st file and
 * at 256 MiB, naming the limit and the retry time; a class raised to SULIT refuses a download and logs it; every download is logged with the supplier as the actor; staging never
 * waits on the contract's lock.
 */

const h = vi.hoisted(() => ({ actor: null as SupplierActor | null }));
const FACTS = { sourceAddress: "203.0.113.9", userAgent: "vitest" };

// The portal's guards (the copy, the Origin guard, the token, the session) are stood in for: they are held by their own tests. The actor is the one the session would read.
vi.mock("@/app/_auth/supplier", () => ({
  supplierPost: async (request: Request) => ({ ok: true as const, actor: h.actor!, post: { fields: await request.json(), facts: FACTS, token: null } }),
  supplierUploadPost: async () => ({ ok: true as const, actor: h.actor!, facts: FACTS }),
  supplierGet: async () => ({ ok: true as const, actor: h.actor!, facts: FACTS }),
}));

import { POST as createRoute } from "@/app/supplier/projects/documents/create/route";
import { GET as fileRoute, HEAD as fileHead } from "@/app/supplier/projects/documents/file/[attachmentId]/route";
import { POST as requestRoute } from "@/app/supplier/projects/documents/request/route";
import { POST as uploadRoute } from "@/app/supplier/projects/documents/upload/route";
import { POST as versionRoute } from "@/app/supplier/projects/documents/version/route";
import { exportSupplierData, readProjectDocuments } from "@/lib/portal/data-export-store";

import { PROJECT_BYTES_PER_WINDOW, PROJECT_FILES_PER_WINDOW } from "./bounds";
import { kindChoices } from "./labels";
import { loadDocumentPage } from "./page-store";
import { contractorDocumentTally, loadPortalDocumentPage, loadPortalRegister, loadPortalStart, loadWaitingForYou } from "./portal-read";
import { findProjectFile } from "./portal-file";
import { storeProjectFile, WindowRefused, preflightProjectUpload } from "./portal-upload";
import { documentOrg } from "@/lib/documents/service";
import { blobStore, sha256Hex } from "@/lib/documents/store";

const run = randomId();
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60_000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const ORG_NAME = `Jabatan Ujian ${run}`;

let organisationId = "";
let soRole = "";
let projectClassId = "";
const p = { so: "", so2: "" };
const NAMES = { so: `OFFICER-ONE-${run}`, so2: `OFFICER-TWO-${run}` };
let counter = 0;

interface Contractor {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
  contactName: string;
}
async function contractor(): Promise<Contractor> {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  const actor: SupplierActor = {
    kind: "SUPPLIER",
    accountId: s.account!.id,
    sessionId: `ses_${s.account!.id}`,
    contactId: s.contact.id,
    displayName: s.contact.name,
    supplierId: s.supplier.id,
    supplierName: s.supplier.registeredName,
    loginName: s.loginName,
    organisationId,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.9",
    mustChangePassword: false,
    resetNoticePending: false,
  };
  return { actor, supplierId: s.supplier.id, accountId: s.account!.id, contactName: s.contact.name };
}
const as = (c: Contractor) => {
  h.actor = c.actor;
  return c;
};

async function contract(vendorId: string | null, status: ContractStatus = "ACTIVE") {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PWP/RQ/${r}`, requestingUnitCode: "PWP_DEPT", requestingPersonId: p.so, title: "Portal requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PWP_CC", accountCode: "PWP_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PWP/EX/${r}`, requisitionId: requisition.id, title: `Culverts ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "PWP_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `PWP/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId } });
  const c = await db.contract.create({ data: { organisationId, number: `PWP/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status } });
  await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  return c.id;
}

/// A file staged for a project document, by a portal account (or a person), and its bytes.
async function stage(by: { person?: string; account?: string }, o: { name?: string; stagedFor?: string | null } = {}) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 portal ${run} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = o.name ?? `drawing-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: o.stagedFor === undefined ? "project-document" : o.stagedFor } });
  const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: by.person ?? null, recordedBySupplierAccountId: by.account ?? null, storedAt: new Date() } });
  return v.id;
}

// --- rows written directly, as the staff's and the contractor's acts leave them (the triggers still judge every one) ---------------------------------

async function mkDoc(contractId: string, side: "CONTRACTOR" | "ORGANISATION", title: string, by: { person?: string; account?: string }) {
  return (await db.projectDocument.create({ data: { organisationId, contractId, title, note: "", side, createdByPersonId: by.person ?? null, createdBySupplierAccountId: by.account ?? null, createdAt: new Date() } })).id;
}
async function mkApprover(documentId: string, personId: string) {
  return (await db.projectDocumentApprover.create({ data: { organisationId, documentId, personId, addedByPersonId: p.so, addedAt: new Date() } })).id;
}
/// A version with its files pinned. `uploadedOn` is the day it is shown at.
async function mkVersion(documentId: string, number: number, by: { person?: string; account?: string }, o: { noApprovers: boolean; files?: string[]; daysAgo?: number; note?: string; requestId?: string }) {
  const when = at(-(o.daysAgo ?? 0));
  const v = await db.projectDocumentVersion.create({
    data: { organisationId, documentId, number, note: o.note ?? "", uploadedByPersonId: by.person ?? null, uploadedBySupplierAccountId: by.account ?? null, uploadedAt: when, uploadedOn: D(when), noApproversAtUpload: o.noApprovers, requestId: o.requestId ?? null },
  });
  const attachments: string[] = [];
  for (const name of o.files ?? []) {
    const stagedId = await stage(by.account ? { account: by.account } : { person: by.person }, { name });
    attachments.push((await db.documentAttachment.create({ data: { organisationId, purpose: "PROJECT_DOCUMENT_FILE", versionId: stagedId, projectDocumentVersionId: v.id } })).id);
  }
  return { versionId: v.id, attachments };
}
async function mkDecision(versionId: string, approverId: string, personId: string, outcome: "APPROVED" | "REJECTED", remarks = "") {
  await db.projectDocumentDecision.create({ data: { organisationId, versionId, approverId, outcome, remarks, decidedByPersonId: personId, decidedAt: new Date(), decidedOn: D(new Date()) } });
}
async function mkRequest(documentId: string, toSide: "CONTRACTOR" | "ORGANISATION", by: { person?: string; account?: string }) {
  return (await db.projectDocumentRequest.create({ data: { organisationId, documentId, toSide, note: "Please send it.", requestedByPersonId: by.person ?? null, requestedBySupplierAccountId: by.account ?? null, requestedAt: new Date() } })).id;
}

// --- calling the routes -------------------------------------------------------------------------------------------------------------------------

async function postJson(route: (r: Request) => Promise<Response>, fields: Record<string, unknown>) {
  const res = await route(new Request("http://portal.example/x", { method: "POST", body: JSON.stringify(fields), headers: { "content-type": "application/json" } }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const createDoc = (fields: Record<string, unknown>) => postJson(createRoute, fields);

async function uploadFile(contractId: string | null, o: { name?: string; bytes?: Uint8Array; extra?: Record<string, string>; query?: string } = {}) {
  const bytes = o.bytes ?? new TextEncoder().encode(`%PDF-1.4 upload ${run} ${++counter}`);
  const fd = new FormData();
  fd.append("file", new File([bytes as BlobPart], o.name ?? `upload-${counter}.pdf`, { type: "application/pdf" }));
  for (const [k, v] of Object.entries(o.extra ?? {})) fd.append(k, v);
  const probe = new Response(fd);
  const body = new Uint8Array(await probe.arrayBuffer());
  const url = `http://portal.example/supplier/projects/documents/upload${o.query ?? (contractId ? `?contractId=${contractId}` : "")}`;
  const res = await uploadRoute(new Request(url, { method: "POST", body, headers: { "content-type": probe.headers.get("content-type")!, "content-length": String(body.byteLength) } }));
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, unknown> };
}

async function download(attachmentId: string) {
  const res = await fileRoute(new Request(`http://portal.example/supplier/projects/documents/file/${attachmentId}`), { params: Promise.resolve({ attachmentId }) } as never);
  return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
}

const eventsOf = (versionId: string) => db.documentAccessEvent.findMany({ where: { organisationId, versionId }, orderBy: { at: "asc" } });

/// Rows of the account's store versions, `agoMinutes` old, as one flood leaves them: `n` files of `bytes` each.
async function seedWindow(accountId: string, n: number, o: { agoMinutes?: number; bytes?: bigint } = {}) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 seed ${run}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const doc = await db.document.create({ data: { organisationId, title: `seed ${counter++}`, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "project-document" } });
  await db.documentVersion.createMany({
    data: Array.from({ length: n }, (_, i) => ({ organisationId, documentId: doc.id, versionNo: i + 1, sha256: sha, byteSize: o.bytes ?? BigInt(bytes.length), mediaType: "application/pdf", originalFilename: `seed-${i}.pdf`, recordedBySupplierAccountId: accountId, storedAt: new Date(Date.now() - (o.agoMinutes ?? 5) * MIN - i) })),
  });
}

beforeAll(async () => {
  vi.stubEnv("DOCUMENT_STORE_DRIVER", "postgres");
  vi.stubEnv("DOCUMENT_MAX_BYTES", "52428800");
  const org = await db.organisation.create({ data: { code: `PWP_${run}`, name: ORG_NAME, timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  p.so = (await makePerson(organisationId, NAMES.so)).id;
  p.so2 = (await makePerson(organisationId, NAMES.so2)).id;
  soRole = `PWP_SO_${run}`;
  for (const id of [p.so, p.so2]) await db.roleAssignment.create({ data: { personId: id, roleCode: soRole, effectiveFrom: D(new Date("2020-01-01")) } });
  projectClassId = (await db.documentClass.create({ data: { organisationId, code: "pwp_project", nameEn: "Project files", classification: "INTERNAL" } })).id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
});

describe("the contractor's acts, end to end through the routes", () => {
  it("create with a staged file, a new version and a request; each writes its audit row with the supplier as the actor, and the document's state is the contractor's", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const staged = await stage({ account: c.accountId });
    const made = await createDoc({ contractId, title: "Method statement", note: "For the S.O.", mode: "upload", versionIds: [staged], versionNote: "First issue." });
    expect(made, JSON.stringify(made)).toMatchObject({ status: 201, body: { ok: true } });
    const documentId = made.body.documentId as string;
    const version1 = made.body.versionId as string;
    expect(await db.projectDocument.findUniqueOrThrow({ where: { id: documentId } })).toMatchObject({ side: "CONTRACTOR", createdBySupplierAccountId: c.accountId, createdByPersonId: null });
    const audit = await db.auditEntry.findMany({ where: { organisationId, entity: { in: ["ProjectDocument", "ProjectDocumentVersion"] }, entityId: { in: [documentId, version1] } } });
    expect(audit.map((a) => a.entity).sort()).toEqual(["ProjectDocument", "ProjectDocumentVersion"]);
    expect(audit.every((a) => a.actorSupplierAccountId === c.accountId)).toBe(true);

    // A new version, from a second staged file.
    const v2 = await postJson(versionRoute, { contractId, documentId, versionIds: [await stage({ account: c.accountId })], note: "Levels corrected." });
    expect(v2, JSON.stringify(v2)).toMatchObject({ status: 201, body: { ok: true, number: 2 } });

    // Its page, as the contractor reads it: its two versions, the organisation named, no count.
    const page = await loadPortalDocumentPage(db, c.actor, contractId, documentId);
    expect(page).toMatchObject({ title: "Method statement", fromLabel: "Yours", organisationName: ORG_NAME, shown: "VERSIONS" });
    expect(page!.versions.map((v) => v.label)).toEqual(["Version 1", "Version 2"]);
    expect(page!.versions[0]!.files[0]).toMatchObject({ scanLabel: expect.stringContaining("Not scanned"), href: expect.stringContaining("/supplier/projects/documents/file/") });
    expect(page!.versions.every((v) => v.uploadedByName === c.contactName)).toBe(true);
  });

  it("a request is answered through the same routes: asked of the organisation for its Shared document, refused for the contractor's own", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const shared = await mkDoc(contractId, "ORGANISATION", "Site plan", { person: p.so });
    await mkVersion(shared, 1, { person: p.so }, { noApprovers: true, files: ["plan.pdf"] });
    const asked = await postJson(requestRoute, { contractId, documentId: shared, note: "A newer plan, please." });
    expect(asked, JSON.stringify(asked)).toMatchObject({ status: 201, body: { ok: true } });
    expect(await db.projectDocumentRequest.findFirstOrThrow({ where: { documentId: shared } })).toMatchObject({ toSide: "ORGANISATION", requestedBySupplierAccountId: c.accountId });
    // The S.O. office is told the contractor asked.
    expect(await db.staffNotice.count({ where: { organisationId, kind: "PROJECT_DOCUMENT_REQUESTED", subjectId: asked.body.requestId as string } })).toBeGreaterThan(0);
    // Asking again while one is open is refused, in the contractor's words.
    const again = await postJson(requestRoute, { contractId, documentId: shared, note: "" });
    expect(again.status).toBe(422);
    expect(JSON.stringify(again.body)).not.toMatch(/approval|approver|Configuration/i);

    const own = await mkDoc(contractId, "CONTRACTOR", "Insurance", { account: c.accountId });
    await mkVersion(own, 1, { account: c.accountId }, { noApprovers: true });
    const ownAsk = await postJson(requestRoute, { contractId, documentId: own, note: "" });
    expect(ownAsk.status).toBe(422);
    expect(ownAsk.body.message).toMatch(/your side/);
  });

  it("an act on a contract the workspace shuts is refused in the contract's own words", async () => {
    const c = as(await contractor());
    const closed = await contract(c.supplierId, "CLOSED");
    const r = await createDoc({ contractId: closed, title: "Late document", mode: "request", requestNote: "x" });
    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/closed/i);
    expect(await db.projectDocument.count({ where: { contractId: closed } })).toBe(0);
  });

  // Rewritten for plan step 6 (PW-23: the kind picker lands in step 6, and step 5's refusal closes with it). The guarantee kept: a posted kind is never ignored. The create route
  // takes it with a first version (and the version route with the first version of a document asked for: `kinds.db.test.ts`); the request route and the staging upload still
  // refuse it 422 and write nothing; a kind that is not one of the six is a field error.
  it("a posted kind is taken by the create route with a file, refused 422 by the request route and the upload, and 400 when it is not one of the six; an unknown field is 400 with its name", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const before = await db.projectDocument.count({ where: { contractId } });
    const staged = await stage({ account: c.accountId });
    const bad = await createDoc({ contractId, title: "Claim 4", mode: "upload", versionIds: [staged], kind: "PAY_ME" });
    expect(bad).toMatchObject({ status: 400, body: { ok: false, code: "VALIDATION", errors: { kind: expect.any(String) } } });
    expect(await postJson(requestRoute, { contractId, documentId: "document_0001", kind: "DELAY_NOTICE" })).toMatchObject({ status: 422, body: { code: "KIND_NOT_AVAILABLE" } });
    expect(await uploadFile(contractId, { extra: { kind: "INTERIM_CLAIM" } })).toMatchObject({ status: 422, body: { code: "KIND_NOT_AVAILABLE" } });
    expect(await uploadFile(contractId, { query: `?contractId=${contractId}&kind=INTERIM_CLAIM` })).toMatchObject({ status: 422, body: { code: "KIND_NOT_AVAILABLE" } });
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(before);
    // The staged file was not pinned by any of those.
    expect(await db.documentAttachment.count({ where: { versionId: staged } })).toBe(0);
    // Taken with a file: the document is of that kind.
    const made = await createDoc({ contractId, title: "Claim 4", mode: "upload", versionIds: [staged], kind: "INTERIM_CLAIM" });
    expect(made, JSON.stringify(made)).toMatchObject({ status: 201, body: { ok: true } });
    expect((await db.projectDocument.findUniqueOrThrow({ where: { id: made.body.documentId as string } })).kind).toBe("INTERIM_CLAIM");

    const unknown = await createDoc({ contractId, title: "x", mode: "request", approverPersonIds: [p.so] });
    expect(unknown).toMatchObject({ status: 400, body: { code: "VALIDATION", errors: { approverPersonIds: expect.any(String) } } });
  });
});

describe("another contractor reaches nothing (PW-14: a 404 for every cause)", () => {
  it("create, version, request, the page and the file are 404 for a contractor that does not hold the contract, with one answer for a contract that is not there", async () => {
    const owner = as(await contractor());
    const contractId = await contract(owner.supplierId);
    const own = await mkDoc(contractId, "CONTRACTOR", "Method statement", { account: owner.accountId });
    const v1 = await mkVersion(own, 1, { account: owner.accountId }, { noApprovers: true, files: ["method.pdf"] });
    // The owner reads its own file.
    expect((await download(v1.attachments[0]!)).status).toBe(200);

    const other = as(await contractor());
    const staged = await stage({ account: other.accountId });
    const created = await createDoc({ contractId, title: "Sneaky", mode: "upload", versionIds: [staged], versionNote: "" });
    const missing = await createDoc({ contractId: "contract_missing_00001", title: "Sneaky", mode: "upload", versionIds: [staged], versionNote: "" });
    expect(created.status).toBe(404);
    // The same body for another contractor's contract and for one that does not exist.
    expect(JSON.stringify(created.body)).toBe(JSON.stringify(missing.body));
    const version = await postJson(versionRoute, { contractId, documentId: own, versionIds: [staged], note: "" });
    const request = await postJson(requestRoute, { contractId, documentId: own, note: "" });
    expect(version.status).toBe(404);
    expect(request.status).toBe(404);
    expect(JSON.stringify(version.body)).toBe(JSON.stringify(created.body));
    expect(JSON.stringify(request.body)).toBe(JSON.stringify(created.body));
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(1);
    expect(await db.projectDocumentVersion.count({ where: { documentId: own } })).toBe(1);
    expect(await db.documentAttachment.count({ where: { versionId: staged } })).toBe(0);

    // The page and the list read as nothing; the file is 404 and, being a real file, is logged as refused.
    expect(await loadPortalDocumentPage(db, other.actor, contractId, own)).toBeNull();
    expect(await loadPortalRegister(db, other.actor, contractId)).toBeNull();
    expect(await loadWaitingForYou(db, other.actor)).toEqual({ rows: [], next: null });
    const file = await download(v1.attachments[0]!);
    expect(file.status).toBe(404);
    const refused = (await eventsOf((await db.documentAttachment.findUniqueOrThrow({ where: { id: v1.attachments[0]! } })).versionId)).filter((e) => e.kind === "REFUSED");
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ actorSupplierAccountId: other.accountId, reasonCode: "NOT_HELD" });
    // An id that is nowhere is 404 and writes nothing.
    const nowhere = await download("attachment_does_not_exist");
    expect(nowhere.status).toBe(404);
    expect((await fileHead()).status).toBe(405);
  });

  // Rewritten for PW-36 (audit L2): this test asserted the words "uploaded by someone else", which told another account's file apart from an id that is nowhere. Another's
  // file now reads exactly as an unknown one ("was not found"), and no row of it is locked; the guarantee kept: it is refused and stays unattached.
  it("pinning another account's staged file is refused, even from the same company, in the same words as an unknown file, and the file stays unattached", async () => {
    const c = as(await contractor());
    const colleague = await makeSupplierAccount(organisationId, { supplierId: c.supplierId });
    const contractId = await contract(c.supplierId);
    const theirs = await stage({ account: colleague.account!.id });
    const staff = await stage({ person: p.so });
    const unknown = await createDoc({ contractId, title: "Borrowed file", mode: "upload", versionIds: ["no-such-version"], versionNote: "" });
    expect(unknown.body.message).toMatch(/File 1 was not found/);
    for (const staged of [theirs, staff]) {
      const r = await createDoc({ contractId, title: "Borrowed file", mode: "upload", versionIds: [staged], versionNote: "" });
      expect(r.status, JSON.stringify(r.body)).toBe(422);
      expect(r.body.message).toBe(unknown.body.message);
      expect(r.body.message).not.toMatch(/someone else/);
      expect(await db.documentAttachment.count({ where: { versionId: staged } })).toBe(0);
    }
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(0);
  });
});

describe("what the contractor may read of an organisation document (PW-8, PW-28)", () => {
  it("a version waiting for approval, its note, its files and its remarks are never read; an earlier shared version is; the day is the shared one's", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "ORGANISATION", "Site plan", { person: p.so });
    const v1 = await mkVersion(doc, 1, { person: p.so }, { noApprovers: true, files: ["plan-shared.pdf"], daysAgo: 5, note: "Shared for information." });
    const approver = await mkApprover(doc, p.so2);
    await mkDecision(v1.versionId, approver, p.so2, "APPROVED", "ORG-REMARK-ON-V1");
    const v2 = await mkVersion(doc, 2, { person: p.so }, { noApprovers: false, files: ["PENDING-plan.pdf"], daysAgo: 1, note: "PENDING-NOTE" });
    await mkDecision(v2.versionId, approver, p.so2, "REJECTED", "SECRET-REMARK");

    const page = await loadPortalDocumentPage(db, c.actor, contractId, doc);
    expect(page).not.toBeNull();
    const json = JSON.stringify(page);
    for (const secret of ["PENDING", "SECRET-REMARK", "ORG-REMARK-ON-V1", v2.versionId, ...v2.attachments, NAMES.so, NAMES.so2, "Waiting for approval", "Rejected", "approver"]) expect(json, secret).not.toContain(secret);
    expect(page!.versions.map((v) => v.label)).toEqual(["Version 1"]);
    expect(page!.versions[0]).toMatchObject({ note: "Shared for information.", decisions: [], uploadedByName: ORG_NAME });
    expect(page!.versions[0]!.files.map((f) => f.name)).toEqual(["plan-shared.pdf"]);
    expect(page).toMatchObject({ stateLabel: "Shared", waitsOnLabel: null, waitsOnYou: false });

    const list = await loadPortalRegister(db, c.actor, contractId);
    expect(list!.rows).toHaveLength(1);
    expect(list!.rows[0]).toMatchObject({ title: "Site plan", stateLabel: "Shared", latestOn: D(at(-5)).toISOString().slice(0, 10), waitsOnLabel: null });
    expect(JSON.stringify(list)).not.toMatch(/PENDING|SECRET|Waiting for approval|Rejected/);

    // The shared file downloads; the pending one is 404 and the refusal is logged against its version.
    expect((await download(v1.attachments[0]!)).status).toBe(200);
    expect((await download(v2.attachments[0]!)).status).toBe(404);
    const hidden = await db.documentAttachment.findUniqueOrThrow({ where: { id: v2.attachments[0]! } });
    expect((await eventsOf(hidden.versionId)).map((e) => `${e.kind}:${e.reasonCode}`)).toEqual(["REFUSED:NOT_VISIBLE"]);
  });

  it("the contractor's own document shows the approver's remarks, by the organisation and never an officer", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "CONTRACTOR", "Method statement", { account: c.accountId });
    const approver = await mkApprover(doc, p.so2);
    const v1 = await mkVersion(doc, 1, { account: c.accountId }, { noApprovers: false, files: ["method.pdf"] });
    await mkDecision(v1.versionId, approver, p.so2, "REJECTED", "Lower the levels at gully 4.");
    const page = await loadPortalDocumentPage(db, c.actor, contractId, doc);
    expect(page!.versions[0]!.decisions).toEqual([expect.objectContaining({ outcomeLabel: "Rejected", remarks: "Lower the levels at gully 4.", byName: ORG_NAME })]);
    expect(page).toMatchObject({ stateLabel: "Rejected", waitsOnLabel: "Waiting for you", waitsOnYou: true });
    const json = JSON.stringify(page);
    expect(json).not.toContain(NAMES.so2);
    expect(json).not.toContain("RSAJ");
  });

  it("an organisation document the contractor did not ask for, with nothing it may see, is not listed, 404 to the page, the file and every act, and left out of the export (PW-28)", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "ORGANISATION", "UNLISTED-Internal costing", { person: p.so });
    const approver = await mkApprover(doc, p.so2);
    const v1 = await mkVersion(doc, 1, { person: p.so }, { noApprovers: false, files: ["UNLISTED-costing.pdf"] });
    expect(approver).toBeTruthy();

    expect(await loadPortalDocumentPage(db, c.actor, contractId, doc)).toBeNull();
    const list = await loadPortalRegister(db, c.actor, contractId);
    expect(list).toEqual({ rows: [], next: null });
    expect((await download(v1.attachments[0]!)).status).toBe(404);
    const version = await postJson(versionRoute, { contractId, documentId: doc, versionIds: [], note: "" });
    const request = await postJson(requestRoute, { contractId, documentId: doc, note: "" });
    const nowhere = await postJson(requestRoute, { contractId, documentId: "document_nowhere_0001", note: "" });
    expect([version.status, request.status]).toEqual([404, 404]);
    expect(JSON.stringify(version.body)).toBe(JSON.stringify(nowhere.body));
    expect(JSON.stringify(request.body)).toBe(JSON.stringify(nowhere.body));
    // The reader is handed it (it is on a contract the supplier holds), and the export's gate is what leaves it out.
    const handed = await db.$transaction((tx) => readProjectDocuments(tx, c.actor, ORG_NAME));
    expect(handed.map((x) => x.row.title)).toContain("UNLISTED-Internal costing");
    const exported = await exportSupplierData(c.actor, "FILE");
    expect(exported!.json).not.toContain("UNLISTED");
    expect(exported!.export.sections.find((s) => s.key === "projectDocuments")!.rows).toEqual([]);
  });

  it("the contractor asked for it: listed as being prepared, with no version; then its approved version only", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "ORGANISATION", "Insurance policy", { person: p.so });
    const approver = await mkApprover(doc, p.so2);
    const request = await mkRequest(doc, "ORGANISATION", { account: c.accountId });
    const v1 = await mkVersion(doc, 1, { person: p.so }, { noApprovers: false, files: ["policy.pdf"], requestId: request });
    const prepared = await loadPortalDocumentPage(db, c.actor, contractId, doc);
    expect(prepared).toMatchObject({ shown: "BEING_PREPARED", stateLabel: `Being prepared by ${ORG_NAME}`, versions: [] });
    expect(JSON.stringify(prepared)).not.toContain("policy.pdf");
    expect((await download(v1.attachments[0]!)).status).toBe(404);
    expect((await loadPortalRegister(db, c.actor, contractId))!.rows[0]).toMatchObject({ title: "Insurance policy", stateLabel: `Being prepared by ${ORG_NAME}`, shown: "BEING_PREPARED" });

    await mkDecision(v1.versionId, approver, p.so2, "APPROVED");
    const approved = await loadPortalDocumentPage(db, c.actor, contractId, doc);
    expect(approved).toMatchObject({ shown: "VERSIONS", stateLabel: "Approved" });
    expect(approved!.versions[0]!.files.map((f) => f.name)).toEqual(["policy.pdf"]);
    expect(approved!.requests[0]).toMatchObject({ answeredByVersion: 1, toLabel: ORG_NAME });
    expect((await download(v1.attachments[0]!)).status).toBe(200);
  });
});

describe("PW-35 and PW-46: the contractor's reading and its gates are made from its projection, never the organisation's working", () => {
  it("a request answered only by a hidden version still reads Asked for, waiting on the organisation, on the page, the list, the tally and the export; Ask for it is not offered, and asking again is refused in the plain words", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "ORGANISATION", "Bridge drawings", { person: p.so });
    await mkVersion(doc, 1, { person: p.so }, { noApprovers: true, files: ["bridge-v1.pdf"], daysAgo: 3 });
    const asked = await mkRequest(doc, "ORGANISATION", { account: c.accountId });
    await mkApprover(doc, p.so2);
    await mkVersion(doc, 2, { person: p.so }, { noApprovers: false, files: ["HIDDEN-bridge-v2.pdf"], requestId: asked });

    const page = (await loadPortalDocumentPage(db, c.actor, contractId, doc))!;
    expect(page).toMatchObject({ stateLabel: "Asked for", waitsOnLabel: `Waiting on ${ORG_NAME}`, waitsOnYou: false });
    expect(page.requests.map((r) => r.answeredByVersion)).toEqual([null]);
    expect(page.actions.request.allowed).toBe(false);
    expect(page.versions.map((v) => v.label)).toEqual(["Version 1"]);
    expect(JSON.stringify(page)).not.toMatch(/HIDDEN|Waiting for approval/);
    const row = (await loadPortalRegister(db, c.actor, contractId))!.rows.find((r) => r.id === doc)!;
    expect(row).toMatchObject({ stateLabel: "Asked for", waitsOnLabel: `Waiting on ${ORG_NAME}` });
    const ctx = (await loadProjectContext(db, c.actor, contractId))!;
    expect(await contractorDocumentTally(db, c.actor, ctx)).toEqual({ withOrganisation: 1, returned: 0 });
    const exported = JSON.stringify((await exportSupplierData(c.actor, "PAGE"))!);
    expect(exported).toContain("Bridge drawings");
    expect(exported).not.toMatch(/HIDDEN-bridge/);
    // The act judges on the real facts (the request is answered): refused in the plain words, never the organisation's working.
    const again = await postJson(requestRoute, { contractId, documentId: doc, note: "Again, please." });
    expect(again.status).toBe(422);
    expect(again.body.message).toBe("Not done: That cannot be done on this document now.");
  });

  it("a hidden pending version with no request: the page reads Shared and offers Ask for it, as for any Shared document; the act refuses it in the plain words (the accepted LOW residual)", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "ORGANISATION", "Traffic plan", { person: p.so });
    await mkVersion(doc, 1, { person: p.so }, { noApprovers: true, files: ["traffic-v1.pdf"], daysAgo: 3 });
    await mkApprover(doc, p.so2);
    await mkVersion(doc, 2, { person: p.so }, { noApprovers: false, files: ["traffic-v2.pdf"] });
    const page = (await loadPortalDocumentPage(db, c.actor, contractId, doc))!;
    expect(page).toMatchObject({ stateLabel: "Shared", waitsOnLabel: null });
    expect(page.actions.request).toEqual({ allowed: true, reasons: [] });
    const ask = await postJson(requestRoute, { contractId, documentId: doc, note: "" });
    expect(ask.status).toBe(422);
    expect(ask.body.message).toBe("Not done: That cannot be done on this document now.");
    expect(await db.projectDocumentRequest.count({ where: { documentId: doc } })).toBe(0);
  });
});

describe("PW-54: the staff document page lists files as the portal and the export do", () => {
  it("a file whose store version is withdrawn is listed on neither page (PW-33 keeps a pinned one from being withdrawn at all, so only a writer that skips the act can leave one)", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "ORGANISATION", "Parity", { person: p.so });
    const v = await mkVersion(doc, 1, { person: p.so }, { noApprovers: true, files: ["kept.pdf"] });
    // Withdrawn BEFORE it was pinned (trigger PA047 refuses it after): the act itself refuses to pin a withdrawn file, so this row is a loader's, not an act's.
    const gone = await stage({ person: p.so }, { name: "withdrawn.pdf" });
    await db.documentVersion.update({ where: { id: gone }, data: { withdrawnAt: new Date(), withdrawnReason: "Wrong scan" } });
    await db.documentAttachment.create({ data: { organisationId, purpose: "PROJECT_DOCUMENT_FILE", versionId: gone, projectDocumentVersionId: v.versionId } });
    const viewer = { kind: "STAFF", personId: p.so, organisationId, isAdministrator: false, permissions: new Set() } as unknown as StaffActor;
    const staffPage = (await loadDocumentPage(db, (await loadContract(organisationId, contractId))!, viewer, doc))!;
    expect(staffPage.versions[0]!.files.map((f) => f.name)).toEqual(["kept.pdf"]);
    const portal = (await loadPortalDocumentPage(db, c.actor, contractId, doc))!;
    expect(portal.versions[0]!.files.map((f) => f.name)).toEqual(["kept.pdf"]);
  });
});

describe("PW-55: a portal act reads the clock once", () => {
  it("a version's moment is to the second, and its day is the organisation's day of that same moment", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const made = await createDoc({ contractId, title: "Clock", mode: "upload", versionIds: [await stage({ account: c.accountId })], versionNote: "" });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const v = await db.projectDocumentVersion.findUniqueOrThrow({ where: { id: made.body.versionId as string } });
    expect(v.uploadedAt.getMilliseconds()).toBe(0);
    expect(v.uploadedOn.toISOString().slice(0, 10)).toBe(dayOf(v.uploadedAt, "Asia/Kuala_Lumpur"));
    expect((await db.projectDocument.findUniqueOrThrow({ where: { id: made.body.documentId as string } })).createdAt.getTime()).toBe(v.uploadedAt.getTime());
  });
});

describe("the download (PW-14)", () => {
  it("every download writes an access event with the supplier's account as the actor, and nobody else; the file is an attachment", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "CONTRACTOR", "Method statement", { account: c.accountId });
    const v1 = await mkVersion(doc, 1, { account: c.accountId }, { noApprovers: true, files: ["method.pdf"] });
    const storeVersion = (await db.documentAttachment.findUniqueOrThrow({ where: { id: v1.attachments[0]! }, include: { version: true } })).version;
    for (let n = 1; n <= 2; n++) {
      const got = await download(v1.attachments[0]!);
      expect(got.status).toBe(200);
      expect(got.headers.get("content-disposition")).toMatch(/^attachment/);
      expect(got.headers.get("x-content-type-options")).toBe("nosniff");
      expect(sha256Hex(got.bytes)).toBe(storeVersion.sha256);
      const events = (await eventsOf(storeVersion.id)).filter((e) => e.kind === "DOWNLOADED");
      expect(events).toHaveLength(n);
      expect(events.at(-1)).toMatchObject({ actorSupplierAccountId: c.accountId, actorPersonId: null, actorSessionId: c.actor.sessionId });
    }
  });

  it("a class raised to SULIT after the upload is refused at download and logged as refused; lowered again, it is served", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "CONTRACTOR", "Method statement", { account: c.accountId });
    const v1 = await mkVersion(doc, 1, { account: c.accountId }, { noApprovers: true, files: ["method.pdf"] });
    const versionId = (await db.documentAttachment.findUniqueOrThrow({ where: { id: v1.attachments[0]! } })).versionId;
    expect((await download(v1.attachments[0]!)).status).toBe(200);
    await db.documentClass.update({ where: { id: projectClassId }, data: { classification: "SULIT" } });
    try {
      const refused = await download(v1.attachments[0]!);
      expect(refused.status).toBe(403);
      expect(new TextDecoder().decode(refused.bytes)).not.toMatch(/SULIT|classif/i);
      const events = await eventsOf(versionId);
      expect(events.map((e) => `${e.kind}:${e.reasonCode}`)).toEqual(["DOWNLOADED:", "REFUSED:NOT_OPEN_TO_CONTRACTOR"]);
      expect(events[1]).toMatchObject({ actorSupplierAccountId: c.accountId });
      // Nothing can be staged while the class is raised (the contractor could never download it).
      expect((await uploadFile(contractId)).status).toBe(422);
    } finally {
      await db.documentClass.update({ where: { id: projectClassId }, data: { classification: "INTERNAL" } });
    }
    expect((await download(v1.attachments[0]!)).status).toBe(200);
  });

  it("a file whose store document is itself SULIT is refused, whatever its class says", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const doc = await mkDoc(contractId, "CONTRACTOR", "Method statement", { account: c.accountId });
    const v1 = await mkVersion(doc, 1, { account: c.accountId }, { noApprovers: true, files: ["method.pdf"] });
    const found = await db.documentAttachment.findUniqueOrThrow({ where: { id: v1.attachments[0]! }, include: { version: true } });
    await db.document.update({ where: { id: found.version.documentId }, data: { classificationSnapshot: "SULIT" } });
    expect(await findProjectFile(db, c.actor, v1.attachments[0]!)).toMatchObject({ ok: false, status: 403 });
  });
});

describe("staging: the window and the lock (PW-15, PW-32)", () => {
  it("stages a file through the route: STAGED for a project document, in the project class, recorded by the account, with its answer naming nothing but the version", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const r = await uploadFile(contractId, { name: "levels.pdf" });
    expect(r, JSON.stringify(r.body)).toMatchObject({ status: 201, body: { ok: true, name: "levels.pdf", scanState: "NOT_SCANNED" } });
    const v = await db.documentVersion.findUniqueOrThrow({ where: { id: r.body.versionId as string }, include: { document: true } });
    expect(v).toMatchObject({ recordedBySupplierAccountId: c.accountId, recordedByPersonId: null, mediaType: "application/pdf" });
    expect(v.document).toMatchObject({ stagedFor: "project-document", documentClassId: projectClassId, status: "STAGED" });
  });

  it("refuses the 61st file in an hour, naming the limit and when to try again; the 60th is accepted", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    await seedWindow(c.accountId, PROJECT_FILES_PER_WINDOW - 1, { agoMinutes: 20 });
    const sixtieth = await uploadFile(contractId);
    expect(sixtieth.status, JSON.stringify(sixtieth.body)).toBe(201);
    const refused = await uploadFile(contractId);
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(refused.body.message).toMatch(/60 files in the last 60 minutes/);
    // The oldest counted file was staged 20 minutes ago, so it leaves the window in about 40.
    expect(refused.body.message).toMatch(/Try again in (39|40|41) minutes/);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(38 * 60);
    expect(Number(refused.headers.get("retry-after"))).toBeLessThanOrEqual(41 * 60);
    expect(JSON.stringify(refused.body)).not.toMatch(/TOO_MANY_FILES/);
    // Nothing was stored for the refused file, and the refusal is logged with the supplier as the actor.
    expect(await db.documentVersion.count({ where: { recordedBySupplierAccountId: c.accountId } })).toBe(PROJECT_FILES_PER_WINDOW);
    const logged = await db.documentAccessEvent.findMany({ where: { organisationId, actorSupplierAccountId: c.accountId, kind: "REFUSED" } });
    expect(logged.map((e) => e.reasonCode)).toEqual(["TOO_MANY_FILES_IN_WINDOW"]);
  });

  it("PW-38: an account already over its window is answered 429 before the body is read, in PW-32's words, and the refusal is logged", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    await seedWindow(c.accountId, PROJECT_FILES_PER_WINDOW, { agoMinutes: 20 });
    // A body that fails if anything reads it (no chunk is pulled until a reader asks: high-water mark 0): the answer must come first.
    let pulled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulled = true;
          throw new Error("the body was read");
        },
      },
      { highWaterMark: 0 },
    );
    const res = await uploadRoute(new Request(`http://portal.example/supplier/projects/documents/upload?contractId=${contractId}`, { method: "POST", body, headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "4096" }, duplex: "half" } as RequestInit));
    expect(res.status).toBe(429);
    expect(pulled).toBe(false);
    const said = (await res.json()) as Record<string, unknown>;
    expect(said).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    expect(said.message).toMatch(/60 files in the last 60 minutes/);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(38 * 60);
    expect((await db.documentAccessEvent.findMany({ where: { organisationId, actorSupplierAccountId: c.accountId, kind: "REFUSED" } })).map((e) => e.reasonCode)).toEqual(["TOO_MANY_FILES_IN_WINDOW"]);
    // The pre-check reads the declared length; with none stated it judges nothing (the route refuses that next), and the locked check stays the authority.
    expect((await preflightProjectUpload(c.actor, contractId, { declaredBytes: 10n })).ok).toBe(false);
    expect((await preflightProjectUpload(c.actor, contractId, { declaredBytes: null })).ok).toBe(true);
    expect(await db.documentVersion.count({ where: { recordedBySupplierAccountId: c.accountId } })).toBe(PROJECT_FILES_PER_WINDOW);
  });

  it("files that have left the hour do not count", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    await seedWindow(c.accountId, PROJECT_FILES_PER_WINDOW + 10, { agoMinutes: 61 });
    expect((await uploadFile(contractId)).status).toBe(201);
  });

  it("refuses a file that would take the account past 256 MiB in the hour, naming the limit and the retry time", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    await seedWindow(c.accountId, 1, { agoMinutes: 30, bytes: PROJECT_BYTES_PER_WINDOW - 10n });
    const refused = await uploadFile(contractId);
    expect(refused.status).toBe(429);
    expect(refused.body.message).toMatch(/256 MiB/);
    expect(refused.body.message).toMatch(/Try again in (29|30|31) minutes/);
    // With room for the file it is accepted.
    const c2 = as(await contractor());
    await seedWindow(c2.accountId, 1, { agoMinutes: 30, bytes: PROJECT_BYTES_PER_WINDOW - 5000n });
    expect((await uploadFile(await contract(c2.supplierId))).status).toBe(201);
  });

  it("two uploads that arrive together cannot both take the last place in the window", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    await seedWindow(c.accountId, PROJECT_FILES_PER_WINDOW - 1, { agoMinutes: 10 });
    const pre = await preflightProjectUpload(c.actor, contractId);
    if (!pre.ok) throw new Error(JSON.stringify(pre.outcome));
    const store = blobStore();
    if ("fault" in store) throw new Error("no store");
    const org = (await documentOrg(organisationId))!;
    const one = (n: number) => {
      const bytes = new TextEncoder().encode(`%PDF-1.4 race ${run} ${n}`);
      return storeProjectFile(c.actor, { org, store: store.store, classId: projectClassId, bytes, sha256: sha256Hex(bytes), mediaType: "application/pdf", originalFilename: `race-${n}.pdf` });
    };
    const results = await Promise.allSettled([one(1), one(2)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(WindowRefused);
    expect(await db.documentVersion.count({ where: { recordedBySupplierAccountId: c.accountId } })).toBe(PROJECT_FILES_PER_WINDOW);
  });

  it("storing never runs under the contract's lock: it completes while another transaction holds the contract row", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => (locked = resolve));
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractId} FOR UPDATE`;
        locked();
        await gate;
      },
      { timeout: 30_000 },
    );
    await holding;
    try {
      const staged = await Promise.race([uploadFile(contractId), new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 15_000))]);
      expect(staged, "staging waited on the contract's lock").not.toBe("blocked");
      expect((staged as { status: number }).status).toBe(201);
    } finally {
      release();
      await holder;
    }
  });

  it("refuses what is not a file it may take: no length, a name that is not a type, a type the rules do not allow, an empty file; none is stored", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const before = await db.documentVersion.count({ where: { recordedBySupplierAccountId: c.accountId } });
    expect((await uploadFile(contractId, { name: "notes.txt", bytes: new TextEncoder().encode("plain text, no signature") })).status).toBe(415);
    expect((await uploadFile(contractId, { name: "claim.pdf", bytes: new TextEncoder().encode("plain text, not a pdf") })).status).toBe(415);
    expect((await uploadFile(contractId, { bytes: new Uint8Array(0) })).status).toBe(422);
    // A real picture the rules do not allow: refused in words that name what is accepted and point at no staff screen.
    const png = await uploadFile(contractId, { name: "site.png", bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]) });
    expect(png.status).toBe(415);
    expect(png.body.message).toMatch(/not accepted here\. Send a PDF/);
    expect(png.body.message).not.toMatch(/Upload rules|Configuration|administrator/i);
    expect((await uploadFile(null, { query: "" })).status).toBe(400);
    expect(await db.documentVersion.count({ where: { recordedBySupplierAccountId: c.accountId } })).toBe(before);
  });

  it("another contractor's contract is a 404 and writes nothing, and a barred contract state is refused before the body is read", async () => {
    const owner = await contractor();
    const contractId = await contract(owner.supplierId);
    const closed = await contract(owner.supplierId, "CLOSED");
    const other = as(await contractor());
    const before = await db.documentVersion.count({ where: { recordedBySupplierAccountId: other.accountId } });
    expect(await uploadFile(contractId)).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
    expect(await db.documentAccessEvent.count({ where: { actorSupplierAccountId: other.accountId } })).toBe(0);
    as(owner);
    const shut = await uploadFile(closed);
    expect(shut.status).toBe(422);
    expect(shut.body.message).toMatch(/closed/i);
    expect(await db.documentVersion.count({ where: { recordedBySupplierAccountId: other.accountId } })).toBe(before);
  });

  it("the project class unset: nothing is staged, and the contractor is told to ask the organisation, never where an administrator sets it", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: null } });
    try {
      const r = await uploadFile(contractId);
      expect(r.status).toBe(422);
      expect(r.body.message).toContain(ORG_NAME);
      expect(r.body.message).not.toMatch(/Configuration|administrator/i);
      const made = await createDoc({ contractId, title: "x", mode: "request", requestNote: "x" });
      expect(made.status).toBe(422);
      expect(JSON.stringify(made.body)).not.toMatch(/Configuration|administrator/i);
    } finally {
      await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: projectClassId } });
    }
  });
});

describe("the lists: Waiting for you and the paged register (PW-4, PW-13)", () => {
  it("lists what waits on the contractor, across its contracts, and nothing that waits on the organisation; contracts that shut the workspace are left out", async () => {
    const c = as(await contractor());
    const a = await contract(c.supplierId);
    const b = await contract(c.supplierId);
    const closed = await contract(c.supplierId, "CLOSED");
    // Asked for by the organisation: waits on the contractor.
    const asked = await mkDoc(a, "CONTRACTOR", "Asked-for drawing", { person: p.so });
    await mkRequest(asked, "CONTRACTOR", { person: p.so });
    // Rejected: waits on the contractor.
    const rejected = await mkDoc(b, "CONTRACTOR", "Rejected statement", { account: c.accountId });
    const approver = await mkApprover(rejected, p.so2);
    const rv = await mkVersion(rejected, 1, { account: c.accountId }, { noApprovers: false });
    await mkDecision(rv.versionId, approver, p.so2, "REJECTED", "Redo.");
    // Waiting for approval: waits on the organisation, so not listed.
    const waiting = await mkDoc(a, "CONTRACTOR", "Sent statement", { account: c.accountId });
    await mkApprover(waiting, p.so2);
    await mkVersion(waiting, 1, { account: c.accountId }, { noApprovers: false });
    // An organisation document: never waits on the contractor.
    const org = await mkDoc(a, "ORGANISATION", "Organisation draft", { person: p.so });
    await mkVersion(org, 1, { person: p.so }, { noApprovers: true });
    // On a contract that shuts the workspace.
    const old = await mkDoc(closed, "CONTRACTOR", "Old request", { person: p.so });
    await mkRequest(old, "CONTRACTOR", { person: p.so });

    const all = await loadWaitingForYou(db, c.actor);
    expect(all.rows.map((r) => r.title).sort()).toEqual(["Asked-for drawing", "Rejected statement"]);
    expect(all.next).toBeNull();
    expect(all.rows.find((r) => r.title === "Rejected statement")).toMatchObject({ stateLabel: "Rejected", href: `/supplier/projects/${b}/documents/${rejected}`, contractId: b });
    expect(all.rows[0]).not.toHaveProperty("count");
    expect((await loadWaitingForYou(db, c.actor, { contractId: a })).rows.map((r) => r.title)).toEqual(["Asked-for drawing"]);
    // Another contractor sees none of it.
    expect(await loadWaitingForYou(db, (await contractor()).actor)).toEqual({ rows: [], next: null });
    // A new version answers it: it leaves the list.
    await postJson(versionRoute, { contractId: b, documentId: rejected, versionIds: [await stage({ account: c.accountId })], note: "Redone." });
    expect((await loadWaitingForYou(db, c.actor)).rows.map((r) => r.title)).toEqual(["Asked-for drawing"]);
    // Paged: one at a time, with a cursor, and no total.
    const first = await loadWaitingForYou(db, c.actor, { take: 1 });
    expect(first.rows).toHaveLength(1);
    expect(first.next).not.toBeNull();
    expect(first).not.toHaveProperty("total");
  });

  it("says whether the contractor may start a document: open, then shut by the contract's state or by the unset project class, in words that name the organisation and no setting; another contractor's contract is null", async () => {
    const c = as(await contractor());
    const open = await contract(c.supplierId);
    const closed = await contract(c.supplierId, "CLOSED");
    // Plan step 6 added the kind picker (`kinds`): the six kinds by name, the declaration alone asking the password.
    expect(await loadPortalStart(db, c.actor, open)).toEqual({ create: { allowed: true, reasons: [] }, kinds: kindChoices(), organisationName: ORG_NAME });
    const shut = await loadPortalStart(db, c.actor, closed);
    expect(shut!.create.allowed).toBe(false);
    expect(shut!.create.reasons[0]).toMatch(/closed/i);
    await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: null } });
    try {
      const unset = await loadPortalStart(db, c.actor, open);
      expect(unset!.create.allowed).toBe(false);
      expect(unset!.create.reasons.join(" ")).toContain(ORG_NAME);
      expect(unset!.create.reasons.join(" ")).not.toMatch(/Configuration|administrator/i);
    } finally {
      await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: projectClassId } });
    }
    expect(await loadPortalStart(db, (await contractor()).actor, open)).toBeNull();
  });

  it("the register pages by a cursor, newest first, with no count, and skips what is not listed without breaking the page", async () => {
    const c = as(await contractor());
    const contractId = await contract(c.supplierId);
    const titles: string[] = [];
    for (let i = 1; i <= 5; i++) {
      // Every other document is an unlisted organisation document.
      if (i % 2 === 0) {
        const hidden = await mkDoc(contractId, "ORGANISATION", `Hidden ${i}`, { person: p.so });
        await mkApprover(hidden, p.so2);
        await mkVersion(hidden, 1, { person: p.so }, { noApprovers: false });
      } else {
        const shown = await mkDoc(contractId, "CONTRACTOR", `Shown ${i}`, { account: c.accountId });
        await mkVersion(shown, 1, { account: c.accountId }, { noApprovers: true });
        titles.unshift(`Shown ${i}`);
      }
    }
    const first = await loadPortalRegister(db, c.actor, contractId, { take: 2 });
    expect(first!.rows.map((r) => r.title)).toEqual(titles.slice(0, 2));
    expect(first!.next).not.toBeNull();
    const second = await loadPortalRegister(db, c.actor, contractId, { take: 2, after: first!.next });
    expect(second!.rows.map((r) => r.title)).toEqual(titles.slice(2));
    expect(second!.next).toBeNull();
    for (const r of [...first!.rows, ...second!.rows]) expect(r).not.toHaveProperty("count");
    expect(JSON.stringify([first, second])).not.toContain("Hidden");
  });
});

describe("the data export (PW-19, PW-28)", () => {
  it("carries the contractor's documents and what it may read of the organisation's, with the download path of each file, and nothing of the rest", async () => {
    const c = as(await contractor());
    const other = await contractor();
    const contractId = await contract(c.supplierId);
    const otherContract = await contract(other.supplierId);
    const own = await mkDoc(contractId, "CONTRACTOR", "Method statement", { account: c.accountId });
    const approver = await mkApprover(own, p.so2);
    const v1 = await mkVersion(own, 1, { account: c.accountId }, { noApprovers: false, files: ["method.pdf"] });
    await mkDecision(v1.versionId, approver, p.so2, "REJECTED", "Lower the levels.");
    const shared = await mkDoc(contractId, "ORGANISATION", "Site plan", { person: p.so });
    await mkVersion(shared, 1, { person: p.so }, { noApprovers: true, files: ["plan.pdf"] });
    const sa = await mkApprover(shared, p.so2);
    await mkVersion(shared, 2, { person: p.so }, { noApprovers: false, files: ["EXPORT-HIDDEN.pdf"], note: "EXPORT-HIDDEN-NOTE" });
    expect(sa).toBeTruthy();
    const unlisted = await mkDoc(contractId, "ORGANISATION", "EXPORT-HIDDEN unlisted", { person: p.so });
    await mkApprover(unlisted, p.so2);
    await mkVersion(unlisted, 1, { person: p.so }, { noApprovers: false, files: ["EXPORT-HIDDEN-2.pdf"] });
    const theirs = await mkDoc(otherContract, "CONTRACTOR", "OTHER-CONTRACTOR-DOC", { account: other.accountId });
    await mkVersion(theirs, 1, { account: other.accountId }, { noApprovers: true });

    const out = await exportSupplierData(c.actor, "FILE");
    const section = out!.export.sections.find((s) => s.key === "projectDocuments")!;
    expect(section.title).toBe("Project documents");
    expect(section.rows.map((r) => r.value).sort()).toEqual(["Method statement", "Site plan"]);
    expect(out!.json).not.toMatch(/EXPORT-HIDDEN|OTHER-CONTRACTOR|Waiting for approval/);
    expect(out!.json).not.toContain(NAMES.so);
    expect(out!.json).not.toContain(NAMES.so2);
    const method = section.rows.find((r) => r.value === "Method statement")!;
    const versions = method.rows!.filter((r) => r.label === "Version");
    expect(versions[0]!.files![0]).toMatchObject({ name: "method.pdf", path: `/supplier/projects/documents/file/${v1.attachments[0]}` });
    expect(JSON.stringify(versions[0])).toContain("Lower the levels.");
    const site = section.rows.find((r) => r.value === "Site plan")!;
    expect(site.rows!.filter((r) => r.label === "Version")).toHaveLength(1);
    // The counts in its audit row are of the section, never of what was left out.
    const row = await db.supplierDataExport.findFirstOrThrow({ where: { supplierId: c.supplierId }, orderBy: { generatedAt: "desc" } });
    expect((row.sectionCounts as Record<string, number>).projectDocuments).toBe(2);
  });
});
