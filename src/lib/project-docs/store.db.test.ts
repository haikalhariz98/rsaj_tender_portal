import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { actStatusFault } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { loadContract } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";
import type { SupplierActor } from "@/lib/auth/types";
import { inHeldContract } from "@/lib/portal/projects/submission-store";
import { hiddenExerciseIds } from "@/lib/auth/sulit-store";
import { loadInboxPage } from "@/lib/inbox/store";
import type { WrittenAttribution } from "@/lib/test-support/staff";

/**
 * The Project workspace's staff acts and their cores against a real database (ADR 0042, plan step 4 §5.4): the founder's loop end to end (a request, the contractor's upload,
 * a rejection with remarks, Version 2, an approval), with an audit row per act, the attribution, and the staff notices (the approver told at Version 1 and again at Version 2);
 * the one lock under concurrent approvals; PW-5 (the S.O., acting, and a representative whose letter lists contractor communication, and nobody else, judged again at the
 * decision); the unset project class naming its setting; the 20-file bound; staged files of another person; the contract's state; and who is told when an approver is added.
 *
 * The staff acts run through their server actions (the form read once, the lock, the words of a refusal); the contractor's through the core inside `inHeldContract`, as
 * step 5's portal routes will call it.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, written: [] as WrittenAttribution[] }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return {
    ...base,
    staffForAct: async () => ({ ok: true as const, actor: h.who! }),
    requireStaff: async () => h.who!,
  };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  const act = actModule();
  h.written = act.written;
  return act.module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { addProjectApprover, createProjectDocument, decideProjectVersion, removeProjectApprover, requestProjectDocument, uploadProjectVersion } from "@/app/projects/[id]/document-actions";
import { loadDocumentFacts } from "./facts";
import { loadDocumentPage, loadWorkspaceStart } from "./page-store";
import { loadRegister } from "./register";
import { documentState } from "./state";
import { addVersion, createDocument, pinConflictRefusal, requestDocument, WorkspaceRefused, workspaceRefusalText, type WorkspaceCtx } from "./store";

const run = randomId();
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

let organisationId = "";
const ORG_NAME = `Jabatan Ujian ${run}`;
let soRole = "";
let projectClassId = "";
/// Staff: `so` and `so2` hold the S.O. office (the approvers), `so3` holds it too and is made to lose it; `stranger` holds nothing.
const p = { so: "", so2: "", so3: "", stranger: "", rep: "", repNoComms: "" };
let counter = 0;

const staff = (personId: string): StaffActor =>
  ({
    kind: "STAFF",
    accountId: `acc_${personId}`,
    sessionId: `ses_${personId}`,
    personId,
    personName: "Officer",
    jobTitle: null,
    isAdministrator: false,
    organisationId,
    organisationCode: `PWS_${run}`,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    offices: [],
    permissions: new Set(),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;

/// A staff act, as the person.
async function as<T>(personId: string, fn: () => Promise<T>): Promise<T> {
  h.who = staff(personId);
  return fn();
}

interface Contractor {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
}
async function contractor(): Promise<Contractor> {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  // The session as the portal reads it (sign-in is not what is under test, and resolves the one configured organisation).
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
  return { actor, supplierId: s.supplier.id, accountId: s.account!.id };
}

/// A contract awarded to the supplier, with its S.O. office; its exercise restricted to its named people where asked (FR-MTD-007).
async function contract(vendorId: string | null, status: ContractStatus = "ACTIVE", o: { restricted?: boolean } = {}) {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PWS/RQ/${r}`, requestingUnitCode: "PWS_DEPT", requestingPersonId: p.so, title: "Workspace requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PWS_CC", accountCode: "PWS_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PWS/EX/${r}`, requisitionId: requisition.id, title: `Drainage ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "PWS_METHOD", status: "EVALUATED", restricted: o.restricted ?? false } });
  const award = await db.award.create({ data: { organisationId, reference: `PWS/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId } });
  const c = await db.contract.create({ data: { organisationId, number: `PWS/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status } });
  await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  return c.id;
}

/// A representative of the S.O. on a contract, by a letter issued five days ago that lists `scope`.
async function represent(contractId: string, personId: string, scope: ("DIARY" | "CONTRACTOR_COMMUNICATION")[]) {
  const assignment = await db.contractSoAssignment.findFirstOrThrow({ where: { contractId } });
  const baseline = await db.contractBaseline.create({ data: { organisationId, contractId, version: 1, reason: "EXECUTED", contractSum: "100000.00", completionPeriod: 90, completionUnit: "DAYS", entered: {}, snapshot: {}, recordedAt: at(-10), recordedOn: D(at(-10)) } });
  const letter = (kind: "DELEGATION_LETTER" | "DELEGATION_NOTICE") =>
    db.certificate.create({ data: { organisationId, contractId, kind, status: "ISSUED", baselineId: baseline.id, number: `PWS/CERT/${randomId()}`, sequence: 1, issuedAt: at(-5), issueSnapshot: {}, certificateDate: D(at(-5)), openedAt: at(-6), openedOn: D(at(-6)) } });
  const [l, n] = [await letter("DELEGATION_LETTER"), await letter("DELEGATION_NOTICE")];
  await db.soDelegation.create({
    data: { organisationId, contractId, assignmentId: assignment.id, kind: "PRINCIPAL", delegatePersonId: personId, delegateName: "A representative", grantorPersonId: p.so, grantorName: "The S.O.", competencyConfirmed: true, competencyNote: "Tests.", variant: "CONVENTIONAL", letterCertificateId: l.id, noticeCertificateId: n.id, recordedAt: at(-5), recordedOn: D(at(-5)), scope: { create: scope.map((act) => ({ organisationId, act })) } },
  });
}

/// A file staged for a project document, by a person or a portal account.
async function stage(by: { person?: string; account?: string }, o: { stagedFor?: string | null; name?: string } = {}) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 workspace ${run} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = o.name ?? `drawing-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: o.stagedFor === undefined ? "project-document" : o.stagedFor } });
  const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: by.person ?? null, recordedBySupplierAccountId: by.account ?? null, storedAt: new Date() } });
  return v.id;
}

/// The contractor's act, through the core inside the held contract, as step 5's routes call it.
function asContractor<T>(c: Contractor, contractId: string, fn: (ctx: WorkspaceCtx) => Promise<T>): Promise<T> {
  return inHeldContract(c.actor, contractId, async (tx, l, today) => {
    const shut = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
    if (shut) throw new WorkspaceRefused([{ code: shut.code, level: "block" }]);
    return fn({ tx, l, now: new Date(), today });
  });
}

const refusedWith = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(WorkspaceRefused);
  expect((e as WorkspaceRefused).faults.map((f) => f.code), code).toContain(code);
};

const stateOf = async (documentId: string) => documentState(await loadDocumentFacts(db, documentId));
const noticesOf = (subjectId: string) => db.staffNotice.findMany({ where: { subjectId, organisationId }, orderBy: [{ kind: "asc" }, { recipientPersonId: "asc" }] });
const auditOf = (entity: string, entityId: string) => db.auditEntry.findMany({ where: { organisationId, entity, entityId }, orderBy: { at: "asc" } });

/// A staff create of an organisation document with one staged file by `by`, naming the approvers.
const createStaff = (by: string, contractId: string, o: { approvers?: string[]; files?: string[]; mode?: "upload" | "request"; title?: string } = {}) =>
  as(by, async () =>
    createProjectDocument({ ok: false }, form({ contractId, title: o.title ?? "Drainage layout", note: "", mode: o.mode ?? "upload", firstNote: "For review.", stagedVersionId: (o.mode ?? "upload") === "upload" ? (o.files ?? [await stage({ person: by })]) : [], approverPersonId: o.approvers ?? [] })),
  );

const documentOf = async (contractId: string, title: string) => (await db.projectDocument.findFirstOrThrow({ where: { contractId, title }, orderBy: { createdAt: "desc" } })).id;

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `PWS_${run}`, name: ORG_NAME, timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Workspace ${k} ${run}`)).id;
  soRole = `PWS_SO_${run}`;
  for (const id of [p.so, p.so2, p.so3]) await db.roleAssignment.create({ data: { personId: id, roleCode: soRole, effectiveFrom: D(new Date("2020-01-01")) } });
  const cls = await db.documentClass.create({ data: { organisationId, code: "pws_project", nameEn: "Project files", classification: "INTERNAL" } });
  projectClassId = cls.id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
});

describe("the founder's loop, end to end through the store", () => {
  it("a request, the contractor's Version 1, a rejection with remarks, Version 2, an approval: an audit row per act, the attribution, and the approver told at each version", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    h.written.length = 0;

    // 1. The organisation asks the contractor for a document, naming an approver.
    const made = await createStaff(p.so, contractId, { mode: "request", title: "Drainage layout", approvers: [p.so2] });
    expect(made, JSON.stringify(made)).toMatchObject({ ok: true, message: "Document asked for." });
    const documentId = await documentOf(contractId, "Drainage layout");
    expect(made.href).toBe(`/projects/${contractId}/documents/${documentId}`);
    let reading = await stateOf(documentId);
    expect(reading).toMatchObject({ state: "REQUESTED", waitsOn: "CONTRACTOR" });
    const request = await db.projectDocumentRequest.findFirstOrThrow({ where: { documentId } });
    expect(request).toMatchObject({ toSide: "CONTRACTOR", requestedByPersonId: p.so });
    expect((await auditOf("ProjectDocument", documentId)).map((a) => a.action)).toEqual(["CREATE"]);
    expect((await auditOf("ProjectDocumentRequest", request.id)).map((a) => a.action)).toEqual(["CREATE"]);
    const approver = await db.projectDocumentApprover.findFirstOrThrow({ where: { documentId } });
    expect((await auditOf("ProjectDocumentApprover", approver.id)).map((a) => a.action)).toEqual(["CREATE"]);
    expect(h.written.map((w) => w.slot).sort()).toEqual(["addedBy", "createdByPerson", "requestedByPerson"]);
    expect(h.written.every((w) => w.subjectPersonId === p.so)).toBe(true);
    // Asked for with an approver: nobody is told yet (no version waits on anyone).
    expect(await db.staffNotice.count({ where: { organisationId, kind: "PROJECT_DOCUMENT_TO_APPROVE", subjectId: request.id } })).toBe(0);

    // 2. The contractor uploads Version 1, answering the request.
    const v1 = await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "First issue." }, null));
    expect(v1.number).toBe(1);
    const version1 = await db.projectDocumentVersion.findUniqueOrThrow({ where: { id: v1.versionId }, include: { files: true } });
    expect(version1).toMatchObject({ requestId: request.id, noApproversAtUpload: false, uploadedBySupplierAccountId: c.accountId, uploadedByPersonId: null });
    expect(version1.files).toHaveLength(1);
    expect(version1.files[0]).toMatchObject({ purpose: "PROJECT_DOCUMENT_FILE", projectDocumentVersionId: v1.versionId });
    expect((await auditOf("ProjectDocumentVersion", v1.versionId))[0]).toMatchObject({ action: "CREATE", actorSupplierAccountId: c.accountId });
    // The store's document is filed by the act that pinned it.
    expect((await db.document.findFirstOrThrow({ where: { versions: { some: { id: version1.files[0]!.versionId } } } })).status).toBe("FILED");
    reading = await stateOf(documentId);
    expect(reading).toMatchObject({ state: "WAITING_FOR_APPROVAL", waitsOn: "ORGANISATION", pendingApproverPersonIds: [p.so2] });
    // The approver is told this version waits on them; the S.O. office is told the contractor uploaded it; the document's link is its page.
    const told1 = await noticesOf(v1.versionId);
    expect(told1.filter((n) => n.kind === "PROJECT_DOCUMENT_TO_APPROVE").map((n) => n.recipientPersonId)).toEqual([p.so2]);
    expect(told1.filter((n) => n.kind === "PROJECT_DOCUMENT_FROM_CONTRACTOR").map((n) => n.recipientPersonId).sort()).toEqual([p.so, p.so2, p.so3].sort());
    expect(told1[0]!.href).toBe(`/projects/${contractId}/documents/${documentId}`);
    expect(told1.map((n) => n.title + n.body).join(" ")).not.toMatch(/[0-9]+\.[0-9]{2}/);

    // 3. The approver rejects, with remarks.
    h.written.length = 0;
    const rejected = await as(p.so2, () => decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId: v1.versionId, outcome: "REJECTED", remarks: "The levels are wrong." })));
    expect(rejected, JSON.stringify(rejected)).toMatchObject({ ok: true });
    expect(await stateOf(documentId)).toMatchObject({ state: "REJECTED", waitsOn: "CONTRACTOR" });
    const decision = await db.projectDocumentDecision.findFirstOrThrow({ where: { versionId: v1.versionId } });
    expect(decision).toMatchObject({ outcome: "REJECTED", remarks: "The levels are wrong.", approverId: approver.id, decidedByPersonId: p.so2 });
    expect((await auditOf("ProjectDocumentDecision", decision.id))[0]).toMatchObject({ action: "CREATE" });
    expect(h.written.map((w) => w.slot)).toEqual(["decidedBy"]);

    // 4. The contractor uploads Version 2; the rejection of Version 1 does not count; the approver is told again.
    const v2 = await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "Levels corrected." }, null));
    expect(v2.number).toBe(2);
    expect(await stateOf(documentId)).toMatchObject({ state: "WAITING_FOR_APPROVAL", pendingApproverPersonIds: [p.so2] });
    expect((await noticesOf(v2.versionId)).filter((n) => n.kind === "PROJECT_DOCUMENT_TO_APPROVE").map((n) => n.recipientPersonId)).toEqual([p.so2]);
    expect((await noticesOf(v1.versionId)).filter((n) => n.kind === "PROJECT_DOCUMENT_TO_APPROVE")).toHaveLength(1);

    // 5. The approver approves: final.
    const approved = await as(p.so2, () => decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId: v2.versionId, outcome: "APPROVED", remarks: "" })));
    expect(approved).toMatchObject({ ok: true });
    expect(await stateOf(documentId)).toMatchObject({ state: "APPROVED", waitsOn: null, final: true });
    // The contractor cannot send a third version of a document that is approved (a later change is a new document).
    await refusedWith(asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "" }, null)), "FINAL");
    // An audit row for every act of the loop.
    const acts = await db.auditEntry.findMany({ where: { organisationId, entity: { in: ["ProjectDocument", "ProjectDocumentRequest", "ProjectDocumentApprover", "ProjectDocumentVersion", "ProjectDocumentDecision"] }, entityLabel: { contains: "Drainage layout" } } });
    expect(acts.filter((a) => a.entity === "ProjectDocumentDecision")).toHaveLength(2);
    expect(acts.filter((a) => a.entity === "ProjectDocumentVersion")).toHaveLength(2);

    // The page the screen reads: both versions with their files and decisions, the approver's answer, and the words.
    const l = (await loadContract(organisationId, contractId))!;
    const page = (await loadDocumentPage(db, l, staff(p.so), documentId))!;
    expect(page).toMatchObject({ state: "APPROVED", stateLabel: "Approved", waitsOn: null, waitsOnLabel: null, final: true, side: "CONTRACTOR", sideLabel: "The contractor", readerMayAct: true });
    expect(page.versions.map((v) => [v.label, v.files.length, v.decisions.map((d) => d.outcomeLabel)])).toEqual([["Version 1", 1, ["Rejected"]], ["Version 2", 1, ["Approved"]]]);
    expect(page.versions[0]!.decisions[0]).toMatchObject({ remarks: "The levels are wrong.", approverName: expect.stringContaining("so2") });
    expect(page.versions[0]!.files[0]!.scanLabel).toMatch(/Not scanned/);
    expect(page.approvers).toMatchObject([{ live: true, answer: "APPROVED", answerLabel: "Approved" }]);
    expect(page.actions.upload.allowed).toBe(false);
    expect(page.actions.upload.reasons.join(" ")).toMatch(/approved/);
    expect(page.actions.approve.allowed).toBe(false);
  });

  it("the document is shown to the register with its words, filterable, and paged by a cursor", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await createStaff(p.so, contractId, { mode: "request", title: "A: asked for", approvers: [] });
    await createStaff(p.so, contractId, { title: "B: shared", approvers: [] });
    await createStaff(p.so, contractId, { title: "C: waiting", approvers: [p.so2] });
    const all = await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME });
    expect(all.rows.map((r) => [r.title, r.stateLabel, r.waitsOnLabel])).toEqual([
      ["C: waiting", "Waiting for approval", `Waiting on ${ORG_NAME}`],
      ["B: shared", "Shared", null],
      ["A: asked for", "Asked for", "Waiting on the contractor"],
    ]);
    expect(all.rows[0]!.latestOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(all.rows[2]!.latestOn).toBeNull();
    expect(all.rows.every((r) => !/[A-Z]{3,}_/.test(JSON.stringify([r.stateLabel, r.waitsOnLabel, r.kindLabel])))).toBe(true);
    expect((await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, filter: "CONTRACTOR" })).rows.map((r) => r.title)).toEqual(["A: asked for"]);
    expect((await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, filter: "ORGANISATION" })).rows.map((r) => r.title)).toEqual(["C: waiting"]);
    expect((await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, filter: "APPROVED" })).rows).toEqual([]);
    // Paged: one at a time, newest first, to the end; another contract's documents are never listed.
    const titles: string[] = [];
    let after: string | null = null;
    for (let guard = 0; guard < 6; guard++) {
      const page: Awaited<ReturnType<typeof loadRegister>> = await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, take: 1, after });
      titles.push(...page.rows.map((r) => r.title));
      after = page.next;
      if (!after) break;
    }
    expect(titles).toEqual(["C: waiting", "B: shared", "A: asked for"]);
    expect((await loadRegister(db, { organisationId, contractId: await contract(null), orgName: ORG_NAME })).rows).toEqual([]);
  });
});

describe("concurrency: one lock, one answer", () => {
  it("two concurrent approvals by the last pending approver give one APPROVED and no error row", async () => {
    const contractId = await contract(null);
    await createStaff(p.so, contractId, { title: "Concurrent", approvers: [p.so2] });
    const documentId = await documentOf(contractId, "Concurrent");
    const versionId = (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId } })).id;
    h.who = staff(p.so2);
    const decide = () => decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId, outcome: "APPROVED", remarks: "" }));
    const results = await Promise.all([decide(), decide()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const lost = results.find((r) => !r.ok)!;
    expect(lost.message).toMatch(/already/i);
    expect(await db.projectDocumentDecision.findMany({ where: { versionId } })).toHaveLength(1);
    expect(await stateOf(documentId)).toMatchObject({ state: "APPROVED" });
    // The loser wrote nothing: one audit row for the decision, and the attribution of the winner alone.
    expect(await db.auditEntry.count({ where: { organisationId, entity: "ProjectDocumentDecision", entityLabel: { contains: "Concurrent" } } })).toBe(1);
  });

  it("two approvers deciding at once both succeed, and the document is approved", async () => {
    const contractId = await contract(null);
    await createStaff(p.so, contractId, { title: "Two approvers", approvers: [p.so2, p.so3] });
    const documentId = await documentOf(contractId, "Two approvers");
    const versionId = (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId } })).id;
    const decide = (who: string) => as(who, () => decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId, outcome: "APPROVED", remarks: "" })));
    // `as` sets the shared actor before it awaits, so each act reads its own person.
    const a = decide(p.so2);
    await new Promise((r) => setTimeout(r, 0));
    const b = decide(p.so3);
    const [ra, rb] = await Promise.all([a, b]);
    expect([ra.ok, rb.ok]).toEqual([true, true]);
    expect(await stateOf(documentId)).toMatchObject({ state: "APPROVED" });
    expect(await db.projectDocumentDecision.count({ where: { versionId } })).toBe(2);
  });
});

describe("PW-5: who may act", () => {
  it("a staff member with no S.O. office and no delegation is refused every act, and can still read the document", async () => {
    const contractId = await contract(null);
    await createStaff(p.so, contractId, { title: "Guarded", approvers: [p.so2] });
    const documentId = await documentOf(contractId, "Guarded");
    const version = await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId } });
    const approver = await db.projectDocumentApprover.findFirstOrThrow({ where: { documentId } });
    const before = await db.projectDocument.count({ where: { contractId } });
    const refused = async (r: Promise<{ ok: boolean; message?: string }>) => {
      const s = await r;
      expect(s.ok, JSON.stringify(s)).toBe(false);
      expect(s.message).toMatch(/Only the S\.O\./);
    };
    await as(p.stranger, async () => {
      await refused(createProjectDocument({ ok: false }, form({ contractId, title: "Nope", note: "", mode: "request", firstNote: "" })));
      await refused(uploadProjectVersion({ ok: false }, form({ contractId, documentId, note: "", stagedVersionId: [await stage({ person: p.stranger })] })));
      await refused(requestProjectDocument({ ok: false }, form({ contractId, documentId, note: "" })));
      await refused(addProjectApprover({ ok: false }, form({ contractId, documentId, approverPersonId: p.so3 })));
      await refused(removeProjectApprover({ ok: false }, form({ contractId, documentId, approverId: approver.id, reason: "Not needed." })));
      await refused(decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId: version.id, outcome: "REJECTED", remarks: "No." })));
    });
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(before);
    expect(await db.projectDocumentApprover.count({ where: { documentId, removedAt: null } })).toBe(1);
    // It still reads: the page is there, its gates say why not, and the stranger is not offered as an approver.
    const l = (await loadContract(organisationId, contractId))!;
    const page = (await loadDocumentPage(db, l, staff(p.stranger), documentId))!;
    expect(page).toMatchObject({ title: "Guarded", readerMayAct: false });
    expect(page.versions).toHaveLength(1);
    for (const g of [page.actions.upload, page.actions.request, page.actions.addApprover, page.actions.approve, page.actions.reject, page.approvers[0]!.remove]) {
      expect(g.allowed).toBe(false);
      expect(g.reasons.join(" ")).toMatch(/Only the S\.O\./);
    }
    expect(page.picker.map((m) => m.personId).sort()).toEqual([p.so, p.so3].sort());
    // The S.O. is offered every gate that is open.
    const mine = (await loadDocumentPage(db, l, staff(p.so), documentId))!;
    expect(mine).toMatchObject({ readerMayAct: true });
    expect(mine.actions.upload.allowed).toBe(true);
    expect(mine.actions.addApprover.allowed).toBe(true);
    expect(mine.actions.approve.reasons.join(" ")).toMatch(/not an approver/);
  });

  it("a representative whose letter omits contractor communication is refused; one whose letter lists it may act", async () => {
    const contractId = await contract(null);
    await represent(contractId, p.repNoComms, ["DIARY"]);
    const s = await as(p.repNoComms, () => createProjectDocument({ ok: false }, form({ contractId, title: "By a representative", note: "", mode: "request", firstNote: "" })));
    expect(s.ok).toBe(false);
    expect(s.message).toMatch(/Only the S\.O\./);
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(0);
    const other = await contract(null);
    await represent(other, p.rep, ["CONTRACTOR_COMMUNICATION"]);
    const ok = await as(p.rep, () => createProjectDocument({ ok: false }, form({ contractId: other, title: "By a representative", note: "", mode: "request", firstNote: "" })));
    expect(ok, JSON.stringify(ok)).toMatchObject({ ok: true });
    // A representative who may act is offered as an approver; one who may not is not.
    const l = (await loadContract(organisationId, other))!;
    const page = (await loadDocumentPage(db, l, staff(p.so), await documentOf(other, "By a representative")))!;
    expect(page.picker.map((m) => m.personId)).toContain(p.rep);
    const repDocument = await documentOf(other, "By a representative");
    const refusedPick = await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId: other, documentId: repDocument, approverPersonId: p.repNoComms })));
    expect(refusedPick.ok).toBe(false);
  });

  it("an approver who lost authority between being added and deciding is refused at the decision", async () => {
    const contractId = await contract(null);
    await createStaff(p.so, contractId, { title: "Lost authority", approvers: [] });
    const documentId = await documentOf(contractId, "Lost authority");
    const versionId = (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId } })).id;
    // A person who holds the office today is added; then the office is no longer theirs.
    const who = (await makePerson(organisationId, `Holder who leaves ${run}`)).id;
    const assignment = await db.roleAssignment.create({ data: { personId: who, roleCode: soRole, effectiveFrom: D(new Date("2020-01-01")) } });
    const added = await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId, approverPersonId: who })));
    expect(added, JSON.stringify(added)).toMatchObject({ ok: true });
    await db.roleAssignment.update({ where: { id: assignment.id }, data: { effectiveTo: D(at(-1)) } });
    const decided = await as(who, () => decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId, outcome: "APPROVED", remarks: "" })));
    expect(decided.ok).toBe(false);
    expect(decided.message).toMatch(/Only the S\.O\./);
    expect(await db.projectDocumentDecision.count({ where: { versionId } })).toBe(0);
    // And a person without the office is refused when named.
    const refused = await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId, approverPersonId: who })));
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/An approver must be/);
  });
});

describe("the project class, the files, and the contract's state", () => {
  it("creating while the project class is unset is refused, naming the setting; nothing is written", async () => {
    const contractId = await contract(null);
    await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: null } });
    try {
      const s = await createStaff(p.so, contractId, { mode: "request", title: "Class unset" });
      expect(s.ok).toBe(false);
      expect(s.message).toMatch(/class for project files/);
      expect(s.message).toMatch(/Configuration › Documents/);
      expect(await db.projectDocument.count({ where: { contractId } })).toBe(0);
    } finally {
      await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: projectClassId } });
    }
  });

  it("a version of 20 files is accepted and one of 21 is refused; a version needs a file", async () => {
    const contractId = await contract(null);
    await createStaff(p.so, contractId, { title: "Many files" });
    const documentId = await documentOf(contractId, "Many files");
    const files = async (n: number) => Promise.all(Array.from({ length: n }, () => stage({ person: p.so })));
    const over = await as(p.so, async () => uploadProjectVersion({ ok: false }, form({ contractId, documentId, note: "", stagedVersionId: await files(21) })));
    expect(over.ok).toBe(false);
    expect(over.message).toMatch(/at most 20 files, and this one has 21/);
    const none = await as(p.so, () => uploadProjectVersion({ ok: false }, form({ contractId, documentId, note: "" })));
    expect(none.message).toMatch(/Add at least one file/);
    expect(await db.projectDocumentVersion.count({ where: { documentId } })).toBe(1);
    const ok = await as(p.so, async () => uploadProjectVersion({ ok: false }, form({ contractId, documentId, note: "", stagedVersionId: await files(20) })));
    expect(ok, JSON.stringify(ok)).toMatchObject({ ok: true, message: "Version 2 added." });
    expect(await db.documentAttachment.count({ where: { projectDocumentVersion: { documentId }, purpose: "PROJECT_DOCUMENT_FILE" } })).toBe(21);
  });

  // Rewritten for PW-36 (audit L2): this test asserted that another person's or account's file read "uploaded by someone else" and a file of another purpose "not uploaded for
  // a project document". Those words told a crafted id apart from an unknown one (an oracle on the store). The read is now narrowed, before any lock, to the actor's own files
  // staged for a project document, so every other id reads the one "was not found" (FILE_UNKNOWN); NOT_YOURS and NOT_STAGED_FOR_PROJECT stay an internal backstop only.
  it("a staged file of another person, of another purpose, already pinned, or unknown is refused, and nothing is pinned; another's file reads exactly as an unknown one (PW-36)", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await createStaff(p.so, contractId, { title: "Staged files" });
    const documentId = await documentOf(contractId, "Staged files");
    const upload = (ids: string[]) => as(p.so, () => uploadProjectVersion({ ok: false }, form({ contractId, documentId, note: "", stagedVersionId: ids })));
    const unknown = await upload(["no-such-version"]);
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toMatch(/File 1 was not found/);
    const others = await upload([await stage({ person: p.so2 })]);
    expect(others.ok).toBe(false);
    expect(others.message).toBe(unknown.message);
    const theirs = await upload([await stage({ account: c.accountId })]);
    expect(theirs.message).toBe(unknown.message);
    const wrongPurpose = await upload([await stage({ person: p.so }, { stagedFor: null })]);
    expect(wrongPurpose.message).toBe(unknown.message);
    for (const said of [others, theirs, wrongPurpose]) expect(said.message).not.toMatch(/someone else|not uploaded for a project document/);
    const mine = await stage({ person: p.so });
    expect(await upload([mine])).toMatchObject({ ok: true });
    const again = await upload([mine]);
    expect(again.message).toMatch(/already attached/);
    const twice = await upload([await stage({ person: p.so }), "no-such-version"]);
    expect(twice.ok).toBe(false);
    expect(await db.projectDocumentVersion.count({ where: { documentId } })).toBe(2);
    // The contractor pinning a person's file, or another contractor's, is refused the same way: not found.
    const other = await contractor();
    const contractorDoc = (await asContractor(c, contractId, async (ctx) => createDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { title: "Contractor's own", note: "", first: { upload: { stagedVersionIds: [await stage({ account: c.accountId })], note: "" } }, approverPersonIds: [] }, null))).documentId;
    for (const foreign of [await stage({ account: other.accountId }), await stage({ person: p.so })]) {
      const e = await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId: contractorDoc, stagedVersionIds: [foreign], note: "" }, null)).then(() => null, (x) => x);
      expect(e).toBeInstanceOf(WorkspaceRefused);
      expect((e as WorkspaceRefused).faults.map((f) => f.code)).toEqual(["FILE_UNKNOWN"]);
    }
  });

  it("PW-36: another's staged file is never locked by an act that names it: the act answers not found while the file's store document is held by someone else", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await createStaff(p.so, contractId, { title: "No foreign lock" });
    const documentId = await documentOf(contractId, "No foreign lock");
    const foreign = await stage({ person: p.so2 });
    const foreignDoc = (await db.documentVersion.findUniqueOrThrow({ where: { id: foreign }, select: { documentId: true } })).documentId;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let taken!: () => void;
    const lockTaken = new Promise<void>((r) => (taken = r));
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${foreignDoc} FOR UPDATE`;
        taken();
        await held;
      },
      { timeout: 60_000 },
    );
    await lockTaken;
    const act = as(p.so, () => uploadProjectVersion({ ok: false }, form({ contractId, documentId, note: "", stagedVersionId: [foreign] })));
    const first = await Promise.race([act, new Promise<"BLOCKED">((r) => setTimeout(() => r("BLOCKED"), 5_000))]);
    release();
    await holder;
    expect(first, "the act waited on another's store document").not.toBe("BLOCKED");
    expect((first as { ok: boolean; message?: string }).message).toMatch(/File 1 was not found/);
  });

  it("an act before Executed and on a Closed or Cancelled contract is refused; on a Terminated one it is allowed", async () => {
    const refused: [ContractStatus, RegExp][] = [
      ["LEGALLY_ENDORSED", /not executed|before/i],
      ["CLOSED", /closed/i],
      ["CANCELLED", /cancel/i],
    ];
    for (const [status, words] of refused) {
      const contractId = await contract(null, status);
      const s = await createStaff(p.so, contractId, { mode: "request", title: `In ${status}` });
      expect(s.ok, status).toBe(false);
      expect(s.message, status).toMatch(words);
      expect(await db.projectDocument.count({ where: { contractId } }), status).toBe(0);
    }
    for (const status of ["EXECUTED", "TERMINATED"] as const) {
      const contractId = await contract(null, status);
      const s = await createStaff(p.so, contractId, { mode: "request", title: `In ${status}` });
      expect(s, `${status}: ${JSON.stringify(s)}`).toMatchObject({ ok: true });
    }
    // The page still reads on a closed contract, with its gates shut and the contract's state said.
    const closed = await contract(null, "ACTIVE");
    await createStaff(p.so, closed, { title: "Before it closed" });
    await db.contract.update({ where: { id: closed }, data: { status: "CLOSED" } });
    const l = (await loadContract(organisationId, closed))!;
    const page = (await loadDocumentPage(db, l, staff(p.so), await documentOf(closed, "Before it closed")))!;
    expect(page.workspaceShut).toMatch(/closed/i);
    expect(page.actions.upload).toMatchObject({ allowed: false });
  });

  it("a document that is not on the contract reads as not found, to the staff act, the page and the contractor", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const elsewhere = await contract(null);
    await createStaff(p.so, elsewhere, { title: "On another contract" });
    const documentId = await documentOf(elsewhere, "On another contract");
    const s = await as(p.so, () => requestProjectDocument({ ok: false }, form({ contractId, documentId, note: "" })));
    expect(s).toMatchObject({ ok: false, message: expect.stringMatching(/not on this contract/) });
    expect(await loadDocumentPage(db, (await loadContract(organisationId, contractId))!, staff(p.so), documentId)).toBeNull();
    await refusedWith(asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "" }, null)), "NOT_FOUND");
    // Another contractor's contract is not found at all.
    const stranger = await contractor();
    const e = await asContractor(stranger, contractId, async () => "reached").then(() => null, (x) => x);
    expect((e as { status?: number }).status).toBe(404);
  });
});

describe("approvers", () => {
  it("adding an approver to a waiting document notifies that person; to a Shared one it turns it into one waiting; to a rejected one it tells nobody", async () => {
    const contractId = await contract(null);
    await createStaff(p.so, contractId, { title: "Waiting", approvers: [p.so2] });
    const documentId = await documentOf(contractId, "Waiting");
    const versionId = (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId } })).id;
    expect((await noticesOf(versionId)).map((n) => n.recipientPersonId)).toEqual([p.so2]);
    const added = await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId, approverPersonId: p.so3 })));
    expect(added, JSON.stringify(added)).toMatchObject({ ok: true });
    const told = await noticesOf(versionId);
    expect(told.map((n) => [n.kind, n.recipientPersonId]).sort()).toEqual([["PROJECT_DOCUMENT_TO_APPROVE", p.so2], ["PROJECT_DOCUMENT_TO_APPROVE", p.so3]].sort());
    expect(told.find((n) => n.recipientPersonId === p.so3)).toMatchObject({ title: "Document to approve: Waiting", href: `/projects/${contractId}/documents/${documentId}` });
    expect(h.written.some((w) => w.slot === "addedBy")).toBe(true);
    // Twice is refused; so is a person without the office.
    expect((await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId, approverPersonId: p.so3 })))).message).toMatch(/already an approver/);
    expect((await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId, approverPersonId: p.stranger })))).message).toMatch(/An approver must be/);

    // A Shared document: no approver, a version shared at once. Adding one makes its version wait on them.
    await createStaff(p.so, contractId, { title: "Shared first", approvers: [] });
    const sharedId = await documentOf(contractId, "Shared first");
    const sharedVersion = (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId: sharedId } })).id;
    expect(await stateOf(sharedId)).toMatchObject({ state: "SHARED" });
    expect(await noticesOf(sharedVersion)).toEqual([]);
    expect(await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId: sharedId, approverPersonId: p.so2 })))).toMatchObject({ ok: true });
    expect(await stateOf(sharedId)).toMatchObject({ state: "WAITING_FOR_APPROVAL" });
    expect((await noticesOf(sharedVersion)).map((n) => n.recipientPersonId)).toEqual([p.so2]);
    // The version shared at once stays shared to the contractor: it was written with noApproversAtUpload.
    expect((await db.projectDocumentVersion.findUniqueOrThrow({ where: { id: sharedVersion } })).noApproversAtUpload).toBe(true);

    // A rejected document waits on its uploader, not on approvers: a new approver is told nothing.
    expect(await as(p.so2, () => decideProjectVersion({ ok: false }, form({ contractId, documentId: sharedId, versionId: sharedVersion, outcome: "REJECTED", remarks: "Redo it." })))).toMatchObject({ ok: true });
    expect(await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId: sharedId, approverPersonId: p.so3 })))).toMatchObject({ ok: true });
    expect((await noticesOf(sharedVersion)).map((n) => n.recipientPersonId)).toEqual([p.so2]);
  });

  it("an approver is removed with a reason, audited with before and after; never the last, never after deciding; replace by adding first", async () => {
    const contractId = await contract(null);
    await createStaff(p.so, contractId, { title: "Removal", approvers: [p.so2] });
    const documentId = await documentOf(contractId, "Removal");
    const approver = await db.projectDocumentApprover.findFirstOrThrow({ where: { documentId, personId: p.so2 } });
    const remove = (approverId: string, reason: string) => as(p.so, () => removeProjectApprover({ ok: false }, form({ contractId, documentId, approverId, reason })));
    const blank = await remove(approver.id, "");
    expect(blank.ok).toBe(false);
    expect(blank.errors?.reason).toMatch(/required/);
    // The only approver is never removed (replace: add first).
    expect((await remove(approver.id, "Wrong person.")).message).toMatch(/only approver/);
    expect(await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId, approverPersonId: p.so3 })))).toMatchObject({ ok: true });
    h.written.length = 0;
    const removed = await remove(approver.id, "Moved to another project.");
    expect(removed, JSON.stringify(removed)).toMatchObject({ ok: true });
    expect(h.written.map((w) => w.slot)).toEqual(["removedBy"]);
    const row = await db.projectDocumentApprover.findUniqueOrThrow({ where: { id: approver.id } });
    expect(row).toMatchObject({ removedByPersonId: p.so, removeReason: "Moved to another project." });
    expect(row.removedAt).not.toBeNull();
    const entry = (await auditOf("ProjectDocumentApprover", approver.id)).find((a) => a.action === "UPDATE")!;
    expect(entry.reason).toBe("Moved to another project.");
    expect(JSON.stringify(entry.changes)).toMatch(/"before":"no"/);
    expect(JSON.stringify(entry.changes)).toMatch(/"after":"yes"/);
    // Removed once: removing again is refused.
    expect((await remove(approver.id, "Again.")).message).toMatch(/not on this document, or has been removed/);
    // The approver who decided the latest version stays.
    const versionId = (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId } })).id;
    expect(await as(p.so3, () => decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId, outcome: "APPROVED", remarks: "" })))).toMatchObject({ ok: true });
  });

  it("the person who uploaded a version never decides it, and is not told it waits on them", async () => {
    const contractId = await contract(null);
    await createStaff(p.so2, contractId, { title: "Own version", approvers: [p.so2, p.so3] });
    const documentId = await documentOf(contractId, "Own version");
    const versionId = (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId } })).id;
    expect((await noticesOf(versionId)).map((n) => n.recipientPersonId)).toEqual([p.so3]);
    const own = await as(p.so2, () => decideProjectVersion({ ok: false }, form({ contractId, documentId, versionId, outcome: "APPROVED", remarks: "" })));
    expect(own.message).toMatch(/You uploaded this version/);
    const l = (await loadContract(organisationId, contractId))!;
    const page = (await loadDocumentPage(db, l, staff(p.so2), documentId))!;
    expect(page.ownVersionApproverNames).toHaveLength(1);
    expect(page.approvers.find((a) => a.personId === p.so2)).toMatchObject({ ownVersion: true, answer: "PENDING" });
  });
});

describe("requests, and the contractor's own acts", () => {
  it("the contractor creates a document and asks for one: the S.O. office is told; the organisation's request goes to the contractor only while Shared", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const made = await asContractor(c, contractId, async (ctx) => createDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { title: "Method statement", note: "", first: { upload: { stagedVersionIds: [await stage({ account: c.accountId })], note: "For information." } }, approverPersonIds: [] }, null));
    const doc = await db.projectDocument.findUniqueOrThrow({ where: { id: made.documentId } });
    expect(doc).toMatchObject({ side: "CONTRACTOR", createdBySupplierAccountId: c.accountId, createdByPersonId: null });
    expect(await stateOf(made.documentId)).toMatchObject({ state: "SHARED" });
    expect((await noticesOf(made.versionId!)).map((n) => [n.kind, n.recipientPersonId]).sort()).toEqual([p.so, p.so2, p.so3].map((id) => ["PROJECT_DOCUMENT_FROM_CONTRACTOR", id]).sort());
    // The contractor may not name approvers, ask itself, or pin without a file.
    await refusedWith(asContractor(c, contractId, async (ctx) => createDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { title: "x", note: "", first: { request: { note: "" } }, approverPersonIds: [p.so2] }, null)), "APPROVERS_NOT_ORGANISATION");
    await refusedWith(asContractor(c, contractId, async (ctx) => requestDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId: made.documentId, note: "" }, null)), "OWN_SIDE");
    // The organisation asks for it again while it is Shared: a request to the contractor.
    const asked = await as(p.so, () => requestProjectDocument({ ok: false }, form({ contractId, documentId: made.documentId, note: "Please resubmit with the section." })));
    expect(asked, JSON.stringify(asked)).toMatchObject({ ok: true });
    expect(await stateOf(made.documentId)).toMatchObject({ state: "REQUESTED", waitsOn: "CONTRACTOR" });
    expect((await as(p.so, () => requestProjectDocument({ ok: false }, form({ contractId, documentId: made.documentId, note: "" })))).message).toMatch(/already waiting on the contractor/);
    // The contractor asks the organisation for one (an organisation document, Shared): told to the S.O. office.
    await createStaff(p.so, contractId, { title: "Organisation drawing", approvers: [] });
    const orgDoc = await documentOf(contractId, "Organisation drawing");
    const req = await asContractor(c, contractId, async (ctx) => requestDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId: orgDoc, note: "A newer one, please." }, null));
    expect((await noticesOf(req.requestId)).map((n) => n.kind)).toEqual(["PROJECT_DOCUMENT_REQUESTED", "PROJECT_DOCUMENT_REQUESTED", "PROJECT_DOCUMENT_REQUESTED"]);
    expect(await stateOf(orgDoc)).toMatchObject({ state: "REQUESTED", waitsOn: "ORGANISATION" });
  });
});

describe("what the Documents list needs to offer a new document", () => {
  it("the S.O. may start one and may name those who hold authority; a stranger may not, and is told who may; a closed contract is shut in its own words", async () => {
    const contractId = await contract(null);
    const l = (await loadContract(organisationId, contractId))!;
    const mine = await loadWorkspaceStart(db, l, staff(p.so));
    expect(mine).toMatchObject({ classSet: true, create: { allowed: true, reasons: [] } });
    expect(mine.picker.map((m) => m.personId).sort()).toEqual([p.so, p.so2, p.so3].sort());
    const theirs = await loadWorkspaceStart(db, l, staff(p.stranger));
    expect(theirs.create.allowed).toBe(false);
    expect(theirs.create.reasons.join(" ")).toMatch(/Only the S\.O\./);
    // Closed: the contract's state is said, once, whoever asks.
    await db.contract.update({ where: { id: contractId }, data: { status: "CLOSED" } });
    const closed = await loadWorkspaceStart(db, (await loadContract(organisationId, contractId))!, staff(p.so));
    expect(closed.create.allowed).toBe(false);
    expect(closed.create.reasons).toHaveLength(1);
    expect(closed.create.reasons[0]).toMatch(/closed/i);
  });

  it("with the project class unset the list is told, and names the setting", async () => {
    const contractId = await contract(null);
    await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: null } });
    try {
      const start = await loadWorkspaceStart(db, (await loadContract(organisationId, contractId))!, staff(p.so));
      expect(start.classSet).toBe(false);
      expect(start.create.allowed).toBe(false);
      expect(start.create.reasons.join(" ")).toMatch(/Configuration › Documents/);
    } finally {
      await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: projectClassId } });
    }
  });
});

describe("the fix round (rulings PW-37, PW-43 T1, PW-45)", () => {
  it("T1: two acts pinning the same staged file at once, on two contracts (so no contract lock orders them): one succeeds, the other is refused as already attached, and the file is pinned once", async () => {
    const [first, second] = [await contract(null), await contract(null)];
    const file = await stage({ person: p.so });
    const [a, b] = await Promise.all([createStaff(p.so, first, { title: "Race A", files: [file] }), createStaff(p.so, second, { title: "Race B", files: [file] })]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    const lost = a.ok ? b : a;
    expect(lost.message).toBe("Not done: File 1 is already attached to a record. Upload it again from this form.");
    expect(await db.documentAttachment.count({ where: { versionId: file, purpose: "PROJECT_DOCUMENT_FILE" } })).toBe(1);
    // Exactly one of the two documents was made: the refused act wrote nothing.
    expect(await db.projectDocument.count({ where: { contractId: { in: [first, second] }, title: { in: ["Race A", "Race B"] } } })).toBe(1);
  });

  it("PW-37: the one-pin index is the backstop, and its refusal is said as the locked re-read says it (ALREADY_ATTACHED, 409), never as a raw error", async () => {
    const contractId = await contract(null);
    const file = await stage({ person: p.so });
    expect(await createStaff(p.so, contractId, { title: "Pinned once", files: [file] })).toMatchObject({ ok: true });
    const version = await db.projectDocumentVersion.findFirstOrThrow({ where: { document: { contractId, title: "Pinned once" } } });
    // A writer that skips the act's checks (a loader, a later act) meets the index.
    const e = await db.documentAttachment.create({ data: { organisationId, purpose: "PROJECT_DOCUMENT_FILE", versionId: file, projectDocumentVersionId: version.id } }).then(() => null, (x) => x);
    expect(e, "the index refused the second pin").not.toBeNull();
    const said = pinConflictRefusal(e);
    expect(said).toBeInstanceOf(WorkspaceRefused);
    expect(said!.status).toBe(409);
    expect(said!.faults.map((f) => f.code)).toEqual(["ALREADY_ATTACHED"]);
    expect(workspaceRefusalText(said!, ORG_NAME)).toBe("Not done: A file is already attached to a record. Upload it again from this form.");
    // Any other error is not the workspace's to word.
    expect(pinConflictRefusal(new Error("something else"))).toBeNull();
  });

  it("PW-45: on a restricted exercise, the S.O. who is not named on it is still told of the contractor's upload, and the notice opens the contract's document page", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId, "ACTIVE", { restricted: true });
    const exerciseId = (await db.contract.findUniqueOrThrow({ where: { id: contractId }, select: { award: { select: { exerciseId: true } } } })).award.exerciseId;
    const hidden = await hiddenExerciseIds(db, staff(p.so));
    expect(hidden, "the S.O. is not named on the restricted exercise").toContain(exerciseId);
    const made = await asContractor(c, contractId, async (ctx) => createDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { title: "Delay at the culvert", note: "", first: { upload: { stagedVersionIds: [await stage({ account: c.accountId })], note: "" } }, approverPersonIds: [] }, null));
    const notices = await db.staffNotice.findMany({ where: { organisationId, subjectId: made.versionId! } });
    expect(notices.map((n) => [n.recipientPersonId, n.exerciseId])).toContainEqual([p.so, null]);
    const inbox = (await loadInboxPage(db, { organisationId, personId: p.so }, hidden)).notices;
    const mine = inbox.find((n) => n.kind === "PROJECT_DOCUMENT_FROM_CONTRACTOR" && n.href === `/projects/${contractId}/documents/${made.documentId}`);
    expect(mine, "the notice reaches the S.O. through the inbox").toBeTruthy();
    // Its link is the contract's document page, which reads for the S.O.
    const page = await loadDocumentPage(db, (await loadContract(organisationId, contractId))!, staff(p.so), made.documentId);
    expect(page?.title).toBe("Delay at the culvert");
  });
});
