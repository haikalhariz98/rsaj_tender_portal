import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PreparedAct } from "@/lib/auth/act-begin";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { actStatusFault } from "@/lib/contract/act-status";
import { loadContract, withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf } from "@/lib/dates";
import { db } from "@/lib/db";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { inHeldContract } from "@/lib/portal/projects/submission-store";
import { overviewTab, paymentsTab } from "@/lib/portal/projects/workspace-store";
import { makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";
import type { WrittenAttribution } from "@/lib/test-support/staff";

/**
 * The six kinds in the Project workspace, and the earlier records in the one list, against a real database (plan step 6 §7; PW-9, PW-10, PW-11, PW-24, PW-27):
 * - a kind is the contractor's alone (staff never make one: AC-59 for the declaration), picked with the first version only, never with a live approver (KIND_WITH_APPROVERS,
 *   caught before trigger PA040), and never approved;
 * - the organisation marks the latest version Taken up (Noted, on defects rectified) or Returned with remarks (`markProjectVersion`), with its slot, audit row and words, and
 *   "Taken up" links only where a screen records the kind (PW-24);
 * - an unanswered earlier record is still answered through its own act, and is read-only once answered;
 * - the Documents lists (staff and portal) carry the earlier records, marked, newest first, filtered and paged by the server; "Documents waiting" reads both sources, with
 *   "Waiting for me"; the portal overview and Payments read both.
 * The declaration's password (a real session is needed for the signed attribution) is held in `src/lib/portal/projects/projects.db.test.ts`.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, written: [] as WrittenAttribution[] }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  const act = actModule();
  h.written = act.written;
  return act.module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { answerContractorSubmission } from "@/app/documents/review-actions";
import { addProjectApprover, createProjectDocument, decideProjectVersion, markProjectVersion } from "@/app/projects/[id]/document-actions";

import { documentState } from "./state";
import { loadDocumentFacts } from "./facts";
import { loadDocumentPage } from "./page-store";
import { loadPortalEarlier, loadStaffEarlier } from "./earlier-read";
import { loadPortalRegister, loadWaitingForYou } from "./portal-read";
import { loadRegister } from "./register";
import { addVersion, createDocument, WorkspaceRefused, type WorkspaceCtx } from "./store";
import { documentsWaitingCount, loadDocumentsWaiting } from "./waiting-read";

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
let orgCode = "";
const ORG_NAME = `Jabatan Jenis ${run}`;
let soRole = "";
let projectClassId = "";
/// `so` and `so2` hold the S.O. office; `stranger` holds nothing.
const p = { so: "", so2: "", stranger: "" };
let counter = 0;
type Kind = "WORK_PROGRAMME" | "INTERIM_CLAIM" | "MATERIALS_ON_SITE" | "DELAY_NOTICE" | "DEFECTS_RECTIFIED" | "STATUTORY_DECLARATION";

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
    organisationCode: orgCode,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    offices: [],
    permissions: new Set(),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;

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

async function contract(vendorId: string | null, status: ContractStatus = "ACTIVE", contractTypeCode: string | null = null) {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PWK/RQ/${r}`, requestingUnitCode: "PWK_DEPT", requestingPersonId: p.so, title: "Kinds requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PWK_CC", accountCode: "PWK_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PWK/EX/${r}`, requisitionId: requisition.id, title: `Culverts ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "PWK_METHOD", status: "EVALUATED", contractTypeCode } });
  const award = await db.award.create({ data: { organisationId, reference: `PWK/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId } });
  const c = await db.contract.create({ data: { organisationId, number: `PWK/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status } });
  await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  return c.id;
}

async function stage(by: { person?: string; account?: string }) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 kinds ${run} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = `file-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "project-document" } });
  return (await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: by.person ?? null, recordedBySupplierAccountId: by.account ?? null, storedAt: new Date() } })).id;
}

/// The contractor's act through the core inside the held contract, as the portal routes call it.
function asContractor<T>(c: Contractor, contractId: string, fn: (ctx: WorkspaceCtx) => Promise<T>): Promise<T> {
  return inHeldContract(c.actor, contractId, async (tx, l, today) => {
    const shut = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
    if (shut) throw new WorkspaceRefused([{ code: shut.code, level: "block" }]);
    return fn({ tx, l, now: new Date(), today });
  });
}

/// A staff core called directly, with an attribution that writes nothing (each case refuses before any write).
const NO_ACT = { write: async () => undefined, writeAlso: async () => undefined } as unknown as PreparedAct;
function asStaffCore<T>(personId: string, contractId: string, fn: (ctx: WorkspaceCtx, a: { kind: "STAFF"; actor: StaffActor }) => Promise<T>): Promise<T | null> {
  return withLockedContract(organisationId, contractId, async (tx, l) => fn({ tx, l, now: new Date(), today: dayOf(new Date(), l.org.timeZone)! }, { kind: "STAFF", actor: staff(personId) }));
}

/// The contractor sends one of the six kinds with one file.
const sendKind = (c: Contractor, contractId: string, kind: Kind, title: string) =>
  asContractor(c, contractId, async (ctx) => createDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { title, note: "", first: { upload: { stagedVersionIds: [await stage({ account: c.accountId })], note: "" } }, approverPersonIds: [], kind }, null));

const refusedWith = async (pr: Promise<unknown>, code: string) => {
  const e = await pr.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(WorkspaceRefused);
  expect((e as WorkspaceRefused).faults.map((f) => f.code), code).toContain(code);
};

const latestVersionOf = async (documentId: string) => (await db.projectDocumentVersion.findFirstOrThrow({ where: { documentId }, orderBy: { number: "desc" } })).id;
const mark = (personId: string, contractId: string, documentId: string, versionId: string, outcome: "TAKEN_UP" | "RETURNED", remarks = "") => as(personId, () => markProjectVersion({ ok: false }, form({ contractId, documentId, versionId, outcome, remarks })));
const pageOf = async (personId: string, contractId: string, documentId: string) => (await loadDocumentPage(db, (await loadContract(organisationId, contractId))!, staff(personId), documentId))!;

/// An earlier submission as the closed send path left it, written directly.
const earlier = (c: Contractor, contractId: string, o: { title: string; at: Date; kind?: Kind; supplierId?: string }) =>
  db.contractorSubmission.create({ data: { organisationId, contractId, supplierId: o.supplierId ?? c.supplierId, kind: o.kind ?? "WORK_PROGRAMME", title: o.title, body: "Sent from the earlier form.", submittedBySupplierAccountId: c.accountId, submittedAt: o.at, submittedOn: D(o.at), routedToRoleCode: soRole, routedToRoleLabel: "Superintending Officer (test)", serviceLevelDays: 3, dueOn: D(at(3)) } });
const answerEarlier = (id: string, outcome: "TAKEN_UP" | "RETURNED", note = "") =>
  db.contractorSubmission.update({ where: { id }, data: { outcome, outcomeNote: note, decidedByPersonId: p.so, decidedOn: D(new Date()), decidedAt: new Date() } });

beforeAll(async () => {
  orgCode = `PWK_${run}`;
  const org = await db.organisation.create({ data: { code: orgCode, name: ORG_NAME, timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Kinds ${k} ${run}`)).id;
  soRole = `PWK_SO_${run}`;
  for (const id of [p.so, p.so2]) await db.roleAssignment.create({ data: { personId: id, roleCode: soRole, effectiveFrom: D(new Date("2020-01-01")) } });
  projectClassId = (await db.documentClass.create({ data: { organisationId, code: "pwk_project", nameEn: "Project files", classification: "INTERNAL" } })).id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
  // ADR 0045 D5: a supply type, paid on delivery orders and invoices.
  await db.contractType.create({ data: { organisationId, code: SUPPLY_TYPE, nameEn: "Supply", paymentRoute: "DELIVERY_ORDER_INVOICE" } });
});

const SUPPLY_TYPE = "PWK_SUPPLY";

function sqlState(error: unknown): string {
  const e = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode) return cause.originalCode;
  if (e.code === "P2002") return "23505";
  return cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}
const dbRefusal = (work: Promise<unknown>): Promise<string | null> => work.then(() => null, sqlState);

describe("a kind is the contractor's, picked once, never with an approver, and never approved (PW-9; AC-59)", () => {
  it("staff cannot make a document of a kind, nor give one to a version (so a statutory declaration is never recorded from paper)", async () => {
    const contractId = await contract(null);
    await refusedWith(asStaffCore(p.so, contractId, async (ctx, a) => createDocument(ctx, a, { title: "Declaration", note: "", first: { upload: { stagedVersionIds: [await stage({ person: p.so })], note: "" } }, approverPersonIds: [], kind: "STATUTORY_DECLARATION" }, NO_ACT)), "KIND_NOT_CONTRACTOR");
    const made = await as(p.so, async () => createProjectDocument({ ok: false }, form({ contractId, title: "Our drawing", note: "", mode: "upload", firstNote: "", stagedVersionId: [await stage({ person: p.so })] })));
    expect(made).toMatchObject({ ok: true });
    const documentId = (await db.projectDocument.findFirstOrThrow({ where: { contractId, title: "Our drawing" } })).id;
    await refusedWith(asStaffCore(p.so, contractId, async (ctx, a) => addVersion(ctx, a, { documentId, stagedVersionIds: [await stage({ person: p.so })], note: "", kind: "DELAY_NOTICE" }, NO_ACT)), "KIND_NOT_CONTRACTOR");
    expect(await db.projectDocument.count({ where: { contractId, kind: { not: null } } })).toBe(0);
  });

  it("is picked with the first version only, and the document then takes no approver and is never approved", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const made = await sendKind(c, contractId, "WORK_PROGRAMME", "Programme, revision 1");
    expect((await db.projectDocument.findUniqueOrThrow({ where: { id: made.documentId } })).kind).toBe("WORK_PROGRAMME");
    expect(await documentState(await loadDocumentFacts(db, made.documentId))).toMatchObject({ state: "RECEIVED", waitsOn: "ORGANISATION" });
    // A kind on a later version is refused.
    await refusedWith(asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId: made.documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "", kind: "DELAY_NOTICE" }, null)), "KIND_ALREADY_SET");
    // Never approved: no approver is taken, and an approval is refused in words.
    const added = await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId: made.documentId, approverPersonId: p.so2 })));
    expect(added.ok).toBe(false);
    expect(added.message).toMatch(/takes no approvers/);
    const versionId = await latestVersionOf(made.documentId);
    const approved = await as(p.so2, () => decideProjectVersion({ ok: false }, form({ contractId, documentId: made.documentId, versionId, outcome: "APPROVED", remarks: "" })));
    expect(approved.ok).toBe(false);
    expect(approved.message).toMatch(/never approved/);
    expect(await db.projectDocumentDecision.count({ where: { versionId } })).toBe(0);
    // The page says the same: approve and reject blocked, the marks open.
    const page = await pageOf(p.so, contractId, made.documentId);
    expect(page.actions.approve.allowed).toBe(false);
    expect(page.actions.addApprover.allowed).toBe(false);
    expect(page.actions.markTakenUp).toEqual({ allowed: true, reasons: [] });
    expect(page.actions.markReturned).toEqual({ allowed: true, reasons: [] });
  });

  it("KIND_WITH_APPROVERS is caught before the trigger: the contractor answering a request that has an approver cannot pick a kind, and nothing is written", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const asked = await as(p.so, () => createProjectDocument({ ok: false }, form({ contractId, title: "Method statement", note: "", mode: "request", firstNote: "Please send it.", approverPersonId: [p.so2] })));
    expect(asked).toMatchObject({ ok: true });
    const documentId = (await db.projectDocument.findFirstOrThrow({ where: { contractId, title: "Method statement" } })).id;
    const e = await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "", kind: "DELAY_NOTICE" }, null)).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(WorkspaceRefused);
    expect((e as WorkspaceRefused).faults.map((f) => f.code)).toContain("KIND_WITH_APPROVERS");
    expect(await db.projectDocumentVersion.count({ where: { documentId } })).toBe(0);
    expect((await db.projectDocument.findUniqueOrThrow({ where: { id: documentId } })).kind).toBeNull();
    // Without a kind the same upload is taken, and waits on its approver.
    await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "" }, null));
    expect(documentState(await loadDocumentFacts(db, documentId))).toMatchObject({ state: "WAITING_FOR_APPROVAL" });
  });

  it("the first version of a document the organisation asked for, with no approver, may pick a kind: it is set once, audited", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await as(p.so, () => createProjectDocument({ ok: false }, form({ contractId, title: "Your programme", note: "", mode: "request", firstNote: "" })));
    const documentId = (await db.projectDocument.findFirstOrThrow({ where: { contractId, title: "Your programme" } })).id;
    await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "", kind: "WORK_PROGRAMME" }, null));
    expect((await db.projectDocument.findUniqueOrThrow({ where: { id: documentId } })).kind).toBe("WORK_PROGRAMME");
    expect(documentState(await loadDocumentFacts(db, documentId))).toMatchObject({ state: "RECEIVED", waitsOn: "ORGANISATION" });
    const audits = await db.auditEntry.findMany({ where: { organisationId, entity: "ProjectDocument", entityId: documentId }, orderBy: { at: "asc" } });
    expect(audits.map((a) => a.action)).toEqual(["CREATE", "UPDATE"]);
  });
});

describe("the organisation marks a version: Taken up (Noted on defects rectified) or Returned with remarks (PW-9, PW-24)", () => {
  it("a claim: Returned needs remarks, goes back to the contractor (Waiting for you), Version 2 is received, Taken up closes it; each mark is a decision with no approver, attributed and audited", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const made = await sendKind(c, contractId, "INTERIM_CLAIM", "Interim claim 3");
    const documentId = made.documentId;
    const v1 = await latestVersionOf(documentId);
    // The page offers the marks, and links "Taken up" to Payments › Valuations, where the claim is recorded.
    const page = await pageOf(p.so, contractId, documentId);
    expect(page.markWords).toEqual({ takenUp: "Mark taken up", returned: "Return" });
    expect(page.takenUpLink).toEqual({ words: "Recorded under Payments › Valuations", href: `/projects/${contractId}?stage=project&tab=payments&section=valuations` });
    expect(page.versions[0]!.uploadedAtText).toMatch(/^\d{2} \w{3} \d{4} · \d{2}:\d{2}$/);
    // Someone with no authority today is refused; a return with no remarks is refused.
    const stranger = await mark(p.stranger, contractId, documentId, v1, "TAKEN_UP");
    expect(stranger.ok).toBe(false);
    expect(stranger.message).toMatch(/S\.O\./);
    const bare = await mark(p.so, contractId, documentId, v1, "RETURNED");
    expect(bare.ok).toBe(false);
    expect(bare.message).toMatch(/Say why it is returned/);
    h.written.length = 0;
    const returned = await mark(p.so, contractId, documentId, v1, "RETURNED", "The valuation is missing its back-up.");
    expect(returned).toMatchObject({ ok: true, message: "Returned. The remarks go back with it." });
    expect(h.written.map((w) => [w.slot, w.subjectPersonId])).toEqual([["decidedBy", p.so]]);
    const decision = await db.projectDocumentDecision.findFirstOrThrow({ where: { versionId: v1 } });
    expect(decision).toMatchObject({ approverId: null, outcome: "RETURNED", remarks: "The valuation is missing its back-up.", decidedByPersonId: p.so });
    expect((await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "ProjectDocumentDecision", entityId: decision.id } })).action).toBe("CREATE");
    expect(documentState(await loadDocumentFacts(db, documentId))).toMatchObject({ state: "RETURNED", waitsOn: "CONTRACTOR" });
    expect((await loadWaitingForYou(db, c.actor, { contractId })).rows.map((r) => [r.documentId, r.stateLabel])).toEqual([[documentId, "Returned"]]);
    // Marked once: a second mark on the same version is refused.
    expect((await mark(p.so2, contractId, documentId, v1, "TAKEN_UP")).ok).toBe(false);
    // Version 2 is received; Taken up closes it; nothing follows.
    await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "Back-up attached." }, null));
    expect(documentState(await loadDocumentFacts(db, documentId))).toMatchObject({ state: "RECEIVED", waitsOn: "ORGANISATION" });
    const v2 = await latestVersionOf(documentId);
    expect(await mark(p.so2, contractId, documentId, v2, "TAKEN_UP")).toMatchObject({ ok: true, message: "Taken up." });
    expect(documentState(await loadDocumentFacts(db, documentId))).toMatchObject({ state: "TAKEN_UP", final: true, waitsOn: null });
    await refusedWith(asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId, stagedVersionIds: [await stage({ account: c.accountId })], note: "" }, null)), "FINAL");
    // The portal Payments tab lists it beside the earlier claims, with no figure.
    const pay = await paymentsTab(db, c.actor, (await loadProjectContext(db, c.actor, contractId))!);
    expect(pay.claims.find((x) => x.id === documentId)).toMatchObject({ amount: null, upTo: null, outcome: "TAKEN_UP", href: `/supplier/projects/${contractId}/documents/${documentId}` });
  });

  it("defects rectified reads Noted, never Taken up, and has no link; a delay notice has no link either (no screen records it yet)", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const defects = await sendKind(c, contractId, "DEFECTS_RECTIFIED", "Defects made good");
    const pageD = await pageOf(p.so, contractId, defects.documentId);
    expect(pageD.markWords).toEqual({ takenUp: "Mark noted", returned: "Return" });
    expect(pageD.takenUpLink).toBeNull();
    expect(await mark(p.so, contractId, defects.documentId, await latestVersionOf(defects.documentId), "TAKEN_UP")).toMatchObject({ ok: true, message: "Noted." });
    expect((await pageOf(p.so, contractId, defects.documentId)).stateLabel).toBe("Noted");
    const delay = await sendKind(c, contractId, "DELAY_NOTICE", "Delay at the culvert");
    expect((await pageOf(p.so, contractId, delay.documentId)).takenUpLink).toBeNull();
    // An ordinary document has no marks: the page blocks them, with why.
    const plain = await asContractor(c, contractId, async (ctx) => createDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { title: "Photos", note: "", first: { upload: { stagedVersionIds: [await stage({ account: c.accountId })], note: "" } }, approverPersonIds: [] }, null));
    const pageP = await pageOf(p.so, contractId, plain.documentId);
    expect(pageP.markWords).toBeNull();
    expect(pageP.actions.markTakenUp.allowed).toBe(false);
    expect(pageP.actions.markTakenUp.reasons.join(" ")).toMatch(/six kinds/);
  });
});

describe("the seventh kind, a supply claim, is marked as the six are: Verified or Returned, never approved (ADR 0045 D6)", () => {
  it("takes no approver and is never approved; its mark reads Verified and links to Payments › Supply invoices", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId, "ACTIVE", SUPPLY_TYPE);
    const made = await asContractor(c, contractId, async (ctx) =>
      createDocument(ctx, { kind: "SUPPLIER", actor: c.actor }, { title: "INV-0042", note: "", first: { upload: { stagedVersionIds: [await stage({ account: c.accountId }), await stage({ account: c.accountId })], filePurposes: ["DELIVERY_ORDER", "SUPPLY_INVOICE"], note: "" } }, approverPersonIds: [], kind: "SUPPLY_CLAIM" }, null),
    );
    const added = await as(p.so, () => addProjectApprover({ ok: false }, form({ contractId, documentId: made.documentId, approverPersonId: p.so2 })));
    expect(added.message).toMatch(/takes no approvers/);
    const v1 = await latestVersionOf(made.documentId);
    expect((await as(p.so2, () => decideProjectVersion({ ok: false }, form({ contractId, documentId: made.documentId, versionId: v1, outcome: "APPROVED", remarks: "" })))).ok).toBe(false);
    const page = await pageOf(p.so, contractId, made.documentId);
    expect(page.markWords).toEqual({ takenUp: "Mark verified", returned: "Return" });
    expect(page.takenUpLink).toEqual({ words: "Recorded under Payments › Supply invoices", href: `/projects/${contractId}?stage=project&tab=payments&section=supply` });
    // The ADR 0042 decision trigger keys on the kind: it refuses an approval on a supply claim, and takes the mark (checked, not assumed: wave V plan §2.1).
    expect(await dbRefusal(db.projectDocumentDecision.create({ data: { organisationId, versionId: v1, approverId: null, outcome: "APPROVED", remarks: "", decidedByPersonId: p.so, decidedAt: new Date(), decidedOn: D(new Date()) } }))).toBe("PA044");
    expect(await mark(p.so, contractId, made.documentId, v1, "RETURNED", "The invoice is unsigned.")).toMatchObject({ ok: true });
    await asContractor(c, contractId, async (ctx) => addVersion(ctx, { kind: "SUPPLIER", actor: c.actor }, { documentId: made.documentId, stagedVersionIds: [await stage({ account: c.accountId }), await stage({ account: c.accountId })], filePurposes: ["SUPPLY_INVOICE", "DELIVERY_ORDER"], note: "Signed." }, null));
    expect(await mark(p.so, contractId, made.documentId, await latestVersionOf(made.documentId), "TAKEN_UP")).toMatchObject({ ok: true, message: "Verified." });
    expect((await pageOf(p.so, contractId, made.documentId)).stateLabel).toBe("Verified");
  });
});

describe("the earlier records in the one list (PW-11)", () => {
  it("an unanswered earlier record is still answered through its own act; answered, it is read-only and says its stored answer", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const row = await earlier(c, contractId, { title: "Programme revision 4", at: at(-1) });
    const answered = await as(p.so, () => answerContractorSubmission({ ok: false }, form({ id: row.id, outcome: "RETURNED", note: "Resequence the culvert works." })));
    expect(answered, JSON.stringify(answered)).toMatchObject({ ok: true });
    expect(await db.contractorSubmission.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ outcome: "RETURNED", outcomeNote: "Resequence the culvert works.", decidedByPersonId: p.so });
    expect((await as(p.so2, () => answerContractorSubmission({ ok: false }, form({ id: row.id, outcome: "TAKEN_UP", note: "" })))).ok).toBe(false);
    await expect(db.$executeRawUnsafe(`UPDATE "ContractorSubmission" SET "outcomeNote" = 'Changed' WHERE id = $1`, row.id)).rejects.toThrow(/answered already/);
    const list = await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME });
    const r = list.rows.find((x) => x.id === row.id)!;
    expect(r).toMatchObject({ stateLabel: "Returned", waitsOn: null, waitsOnLabel: null, earlier: { label: "Earlier record", record: { answerLabel: "Returned", answerNote: "Resequence the culvert works.", answerable: false, dueText: expect.stringMatching(/^Due \d{2} \w{3} \d{4}$/) } } });
    expect(r.href).toBe(`/projects/${encodeURIComponent(contractId)}?stage=project&tab=submissions&earlier=${row.id}`);
    // Returned, it is not "Waiting for you": the earlier path is closed.
    expect((await loadWaitingForYou(db, c.actor, { contractId })).rows).toEqual([]);
  });

  it("one earlier record is read by id for its read-only view: only on its own contract and organisation, and by the contractor only its own supplier's", async () => {
    const c = await contractor();
    const other = await contractor();
    const contractId = await contract(c.supplierId);
    const otherContractId = await contract(other.supplierId);
    const mine = await earlier(c, contractId, { title: "Old programme", at: at(-5) });
    const theirs = await earlier(c, contractId, { title: "Another supplier's", at: at(-4), supplierId: other.supplierId });
    expect(await loadStaffEarlier(db, { organisationId, contractId, id: mine.id })).toMatchObject({ title: "Old programme", answerable: true, answerShut: null });
    // Not on another contract, not under another organisation, not a made-up id: the same null.
    expect(await loadStaffEarlier(db, { organisationId, contractId: otherContractId, id: mine.id })).toBeNull();
    expect(await loadStaffEarlier(db, { organisationId: "no-such-organisation", contractId, id: mine.id })).toBeNull();
    expect(await loadStaffEarlier(db, { organisationId, contractId, id: "no-such-record" })).toBeNull();
    expect(await loadPortalEarlier(db, { organisationId, contractId, supplierId: c.supplierId, id: mine.id })).toMatchObject({ title: "Old programme" });
    expect(await loadPortalEarlier(db, { organisationId, contractId, supplierId: c.supplierId, id: theirs.id })).toBeNull();
    expect(JSON.stringify(await loadPortalEarlier(db, { organisationId, contractId, supplierId: c.supplierId, id: mine.id }))).not.toMatch(/answeredBy|answerable/);
  });

  it("both lists interleave documents and earlier records newest first, filter them, page them once each, and the portal shows only its own supplier's", async () => {
    const c = await contractor();
    const other = await contractor();
    const contractId = await contract(c.supplierId);
    const e1 = await earlier(c, contractId, { title: "E1 oldest, unanswered", at: at(-3) });
    const e2 = await earlier(c, contractId, { title: "E2 answered", at: at(-2) });
    await answerEarlier(e2.id, "TAKEN_UP");
    await earlier(c, contractId, { title: "E3 another supplier's", at: at(-1), supplierId: other.supplierId });
    await sendKind(c, contractId, "DELAY_NOTICE", "D1 delay notice");
    const all = await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME });
    expect(all.rows.map((r) => [r.title, r.stateLabel, r.earlier ? "earlier" : "document"])).toEqual([
      ["D1 delay notice", "Received", "document"],
      ["E3 another supplier's", "Received", "earlier"],
      ["E2 answered", "Taken up", "earlier"],
      ["E1 oldest, unanswered", "Received", "earlier"],
    ]);
    expect((await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, filter: "ORGANISATION" })).rows.map((r) => r.title)).toEqual(["D1 delay notice", "E3 another supplier's", "E1 oldest, unanswered"]);
    expect((await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, filter: "CONTRACTOR" })).rows).toEqual([]);
    expect((await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, filter: "APPROVED" })).rows).toEqual([]);
    const titles: string[] = [];
    let after: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: Awaited<ReturnType<typeof loadRegister>> = await loadRegister(db, { organisationId, contractId, orgName: ORG_NAME, take: 1, after });
      titles.push(...page.rows.map((r) => r.title));
      after = page.next;
      if (!after) break;
    }
    expect(titles).toEqual(all.rows.map((r) => r.title));
    // The contractor's own list: its own earlier records only, by the organisation, never an officer; the unanswered one waits on the organisation.
    const portal = (await loadPortalRegister(db, c.actor, contractId))!;
    expect(portal.rows.map((r) => [r.title, r.waitsOnLabel])).toEqual([
      ["D1 delay notice", `Waiting on ${ORG_NAME}`],
      ["E2 answered", null],
      ["E1 oldest, unanswered", `Waiting on ${ORG_NAME}`],
    ]);
    expect(JSON.stringify(portal.rows)).not.toMatch(/answeredBy|Kinds so/);
    expect(portal.rows[1]!.earlier).toMatchObject({ label: "Earlier record", record: { answerLabel: "Taken up" } });
    void e1;
  });
});

describe("Documents waiting reads both sources, with Waiting for me (PW-11)", () => {
  it("lists what waits on the organisation from both, for the S.O. office or the approver it waits for; counts the same; leaves out a contract that shuts the workspace", async () => {
    const before = await documentsWaitingCount(db, organisationId);
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    // The staff act's clock is to the second, the contractor's to the millisecond: the staff document is made first, so the order is certain.
    const withApprover = await as(p.so, async () => createProjectDocument({ ok: false }, form({ contractId, title: "W2 for approval", note: "", mode: "upload", firstNote: "", stagedVersionId: [await stage({ person: p.so })], approverPersonId: [p.so2] })));
    expect(withApprover.ok).toBe(true);
    const received = await sendKind(c, contractId, "MATERIALS_ON_SITE", "W1 materials list");
    const old = await earlier(c, contractId, { title: "W3 earlier", at: at(-5) });
    const shared = await as(p.so, async () => createProjectDocument({ ok: false }, form({ contractId, title: "W4 shared", note: "", mode: "upload", firstNote: "", stagedVersionId: [await stage({ person: p.so })] })));
    expect(shared.ok).toBe(true);
    // A received kind on a closed contract waits on nobody who can act: it is not listed.
    const closed = await contract(c.supplierId);
    await sendKind(c, closed, "WORK_PROGRAMME", "W5 on a closed contract");
    await db.contract.update({ where: { id: closed }, data: { status: "CLOSED" } });

    const org = { id: organisationId, code: orgCode, name: ORG_NAME };
    const today = dayOf(new Date(), "Asia/Kuala_Lumpur");
    const all = await loadDocumentsWaiting(db, { org, viewerPersonId: p.so, today });
    const mine = (who: string) => loadDocumentsWaiting(db, { org, viewerPersonId: who, today, filter: "MINE" }).then((x) => x.rows.map((r) => r.title).filter((t) => t.startsWith("W")));
    expect(all.rows.map((r) => r.title).filter((t) => t.startsWith("W"))).toEqual(["W1 materials list", "W2 for approval", "W3 earlier"]);
    expect(all.rows.find((r) => r.id === old.id)).toMatchObject({ earlier: { label: "Earlier record" }, contractNumber: expect.stringContaining("PWK/CON/") });
    expect(all.rows.find((r) => r.id === received.documentId)).toMatchObject({ stateLabel: "Received", href: `/projects/${contractId}/documents/${received.documentId}` });
    // The S.O. holder: the received kind and the earlier record (nobody named decides them), not the version waiting on its approver.
    expect(await mine(p.so)).toEqual(["W1 materials list", "W3 earlier"]);
    // The approver, who also holds the office: the version waiting on them too.
    expect(await mine(p.so2)).toEqual(["W1 materials list", "W2 for approval", "W3 earlier"]);
    // Someone who holds nothing: nothing.
    expect(await mine(p.stranger)).toEqual([]);
    expect(await documentsWaitingCount(db, organisationId)).toBe(before + 3);
    expect(await documentsWaitingCount(db, organisationId, contractId)).toBe(3);
  });

  it("the portal overview counts both sources, as the contractor may know them", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const r1 = await earlier(c, contractId, { title: "Earlier returned", at: at(-4) });
    await answerEarlier(r1.id, "RETURNED", "Redo it.");
    await earlier(c, contractId, { title: "Earlier waiting", at: at(-3) });
    const kind = await sendKind(c, contractId, "INTERIM_CLAIM", "Claim 5");
    await mark(p.so, contractId, kind.documentId, await latestVersionOf(kind.documentId), "RETURNED", "Add the back-up.");
    await sendKind(c, contractId, "DELAY_NOTICE", "Delay");
    // An organisation document waiting for its approvers is the organisation's own working: never counted for the contractor (PW-28).
    await as(p.so, async () => createProjectDocument({ ok: false }, form({ contractId, title: "Our draft", note: "", mode: "upload", firstNote: "", stagedVersionId: [await stage({ person: p.so })], approverPersonId: [p.so2] })));
    const o = await overviewTab(db, c.actor, (await loadProjectContext(db, c.actor, contractId))!);
    expect(o.counts).toMatchObject({ returned: 2, waiting: 2 });
  });
});
