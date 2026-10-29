import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadAttributions } from "@/lib/auth/attribution-read";
import { AttributionRefused } from "@/lib/auth/attribution-store";
import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { readSupplierSession } from "@/lib/auth/supplier-session-store";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import type { CertificateKind } from "@/lib/certificate/types";
import { db } from "@/lib/db";
import { facts, makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { contractDocumentFacts } from "@/lib/certificate/register";
import { dayPlus, dayToDate, todayIn } from "@/lib/dates";
import { parseCreateBody } from "@/lib/project-docs/portal-api";
import { contractorCreate, contractorVersion } from "@/lib/project-docs/portal-acts";
import type { PortalOutcome } from "@/lib/project-docs/portal-upload";
import { loadPortalRegister } from "@/lib/project-docs/portal-read";
import { loadRegister } from "@/lib/project-docs/register";
import { loadWorkspaceStart } from "@/lib/project-docs/page-store";
import { loadContract } from "@/lib/contract/repo";
import { documentsWaitingCount } from "@/lib/project-docs/waiting-read";

import { loadBoard } from "./announcement-store";
import { signContractorBlock } from "./certificate-store";
import { loadProjectContext } from "./context-store";
import { attestDiaryAsAgent, disputeDiaryAsAgent } from "./diary-store";
import { loadMyContracts } from "./list-store";
import { loadReviewQueue, reviewCounts } from "./review-store";
import { ProjectRefused } from "./types";
import { certificatesTab, diaryTab, overviewTab, submissionsTab } from "./workspace-store";

/**
 * My Projects against a real database (Phase 4e): a contractor holds only the contracts whose award names it; the six kinds are sent from the Documents list as the session's account, the
 * S.O. office told; a statutory declaration, the agent's attestation and the contractor's block on a certificate are each signed with the password asked again (a stale or missing entry
 * writes nothing); a disagreement escalates the entry; what is not the contractor's reads as not found, alike for an id that exists nowhere; and the announcements board shows the standing
 * announcements in order.
 *
 * REWRITTEN FOR PLAN STEP 6 (PW-11: the old portal send path closed when the six kinds moved into the Project workspace; PW-23). Every guarantee of the old `sendSubmission` tests that
 * still applies keeps a test, now on the new path (`contractorCreate` / `contractorVersion`, the store behind `POST /supplier/projects/documents/create` and `/version`, after the route
 * has asked the password); the earlier rows (`ContractorSubmission`) are seeded directly, read-only, and keep their own tests. Old -> new:
 * - another organisation's contract is not found                 -> the same, refused 404 by the create act.
 * - written as the session's supplier with the server's day,      -> a document of one of the six kinds written as the session's account with the server's day AND time (a delay
 *   routed to the S.O. office, holders told, audited                  notice, FR-EOT-001), the S.O. office told (PROJECT_DOCUMENT_FROM_CONTRACTOR), audited; both lists show it.
 * - the due day from the service level as set; a claim's amount  -> VOID by PW-4, PW-10, PW-27 (no due day, no figure). Replaced by: a kind takes no figure and no due day, and the
 *                                                                     old setting is not read even where it is set.
 * - routed to nobody where the contract has no S.O.               -> received all the same, and nobody is told.
 * - refused on another's contract, a cancelled one, bad fields    -> the same: 404, the act x status row (PROJECT_WORKSPACE), a blank title, and a figure is a field the body refuses.
 * - a declaration needs the password; stale writes nothing;       -> the same on the new path: unsigned refused, stale refused 403 with nothing written, signed writes the
 *   the attribution names the submission                              version's SIGNED attribution naming the version; every later version is signed too.
 * - the organisation's switch, then the contact's mark; the       -> the same four refusals, the switch asked first, a non-declaration untouched, the designation in the reason.
 *   designation in the reason
 * - a barred supplier's standing                                  -> the same, refused in words with nothing written.
 * - bounded per account (SUBMISSIONS_PER_WINDOW)                   -> PW-32's window bounds the files every kind needs (held in `project-docs/portal.db.test.ts`); here, a kind
 *                                                                     cannot be sent without a staged file, so it cannot pass the window.
 * - the queue's counts and scope; what was sent is frozen          -> kept on directly seeded earlier rows; the counts now read both sources (a received kind is waiting too).
 * Added: an earlier declaration's attribution still resolves (`loadAttributions`), and the earlier rows sit in both Documents lists as earlier records.
 */

let organisationId: string;
let orgCode: string;
/// The project class set for this file's run (the Project workspace refuses every upload while it is unset), and what the shared organisation had before, to put back.
let projectClassId = "";
let classBefore: string | null | undefined;
let counter = 0;
let officerId: string;
let soRole: string;
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date | string) => new Date(`${typeof d === "string" ? d : d.toISOString().slice(0, 10)}T00:00:00.000Z`);
let today: string;

interface Holder {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
  loginName: string;
  password: string;
}

/// A supplier with a live account, signed in, as the actor the portal reads from its session.
async function supplier(): Promise<Holder> {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  // Decisions log, 2026-10-09, ruling on 1928(3): a contact signs for the company only once an officer has marked it so. The signed acts below are the authorised signatory's; the case that
  // follows ("who signs for the company") clears the mark and is refused. Updated to match the ruled decision, not weakened: the organisation's switch is still asked first.
  if (s.account) await db.supplierContact.update({ where: { id: s.account.contactId }, data: { authorisedToSignForContractor: true } });
  const signedIn = await authenticateSupplier({ loginName: s.loginName, password: s.password }, facts(), null);
  if (!signedIn.ok) throw new Error("sign-in failed");
  const read = await readSupplierSession(signedIn.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session failed");
  return { actor: read.actor, supplierId: s.supplier.id, accountId: s.account!.id, loginName: s.loginName, password: s.password };
}

/// The password asked again for this act, as the handler asks it, and the moment that signs.
async function stepUp(h: Holder): Promise<Date> {
  const asked = await confirmSupplierPassword(h.actor, h.password, facts());
  if (!asked.ok) throw new Error(`step-up failed: ${asked.kind}`);
  return asked.at;
}

/// A contract whose award names the supplier (or nobody), with its S.O. assignment, as the office records one.
async function contract(o: { vendorId: string | null; awardStatus?: "ISSUED" | "ACCEPTED" | "DRAFT" | "CANCELLED"; status?: "ACTIVE" | "CANCELLED" | "STAMPED"; so?: boolean }) {
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PRJ/RQ/${run}`, requestingUnitCode: "PRJ_DEPT", requestingPersonId: officerId, title: "Project requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PRJ_CC", accountCode: "PRJ_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PRJ/EX/${run}`, requisitionId: requisition.id, title: `Pipe replacement ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "PRJ_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `PRJ/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: o.awardStatus ?? "ISSUED", vendorId: o.vendorId } });
  const c = await db.contract.create({ data: { organisationId, number: `PRJ/CON/${run}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status: o.status ?? "ACTIVE" } });
  if (o.so !== false) {
    await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  }
  return { id: c.id, awardId: award.id, exerciseId: exercise.id };
}

const refusedWith = async (p: Promise<unknown>, code: string, status?: number) => {
  const e = await p.then(() => null, (x) => x);
  expect(e, `expected a refusal with ${code}`).toBeInstanceOf(ProjectRefused);
  expect((e as ProjectRefused).faults.map((f) => f.code), code).toContain(code);
  if (status) expect((e as ProjectRefused).status).toBe(status);
};

beforeAll(async () => {
  const org = await testOrganisation();
  organisationId = org.id;
  orgCode = org.code;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
  today = todayIn(new Date(), "Asia/Kuala_Lumpur")!;
  officerId = (await makePerson(organisationId, `S.O. ${randomId()}`)).id;
  soRole = `PRJ_SO_${randomId()}`;
  await db.roleAssignment.create({ data: { personId: officerId, roleCode: soRole, effectiveFrom: D("2020-01-01") } });
  // 4e review fix: whether a contractor signs from its portal account is the organisation's switch, shipped unset (unset refuses). The signed acts below run with it decided
  // yes; "who may bind the contractor" below clears it and is refused.
  await portalSigning(true);
  void orgCode;
  // Plan step 6: the six kinds are sent as Project workspace documents, whose files take the organisation's project class.
  classBefore = (await db.documentStorePolicy.findUnique({ where: { organisationId }, select: { projectDocumentClassId: true } }))?.projectDocumentClassId;
  projectClassId = (await db.documentClass.create({ data: { organisationId, code: `prj_project_${randomId()}`, nameEn: "Project files", classification: "INTERNAL" } })).id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
});

/// A file staged for a project document by the contractor's account, as the staging upload leaves it.
async function stage(accountId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`%PDF-1.4 projects ${randomId()} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = `notice-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "project-document" } });
  return (await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedBySupplierAccountId: accountId, storedAt: new Date() } })).id;
}

type Kind = "WORK_PROGRAMME" | "INTERIM_CLAIM" | "MATERIALS_ON_SITE" | "DELAY_NOTICE" | "DEFECTS_RECTIFIED" | "STATUTORY_DECLARATION";

/// The contractor sends one of the six kinds from the Documents list: the create act, after the route asked the password (`stepUpAt`) where it is a declaration.
async function send(h: Holder, contractId: string, kind: Kind, o: { title?: string; files?: number; stepUpAt?: Date | null } = {}): Promise<PortalOutcome> {
  const files: string[] = [];
  for (let n = 0; n < (o.files ?? 1); n++) files.push(await stage(h.accountId));
  return contractorCreate(h.actor, { contractId, title: o.title ?? "Notice", note: "", first: { upload: { stagedVersionIds: files, note: "" } }, kind }, o.stepUpAt ?? null);
}

/// A refusal of the new path, as the route answers it: the status, and the words (never a code).
function refused(out: PortalOutcome, status: number, words: RegExp) {
  expect(out.status, JSON.stringify(out.body)).toBe(status);
  expect(out.body.ok).toBe(false);
  expect(String(out.body.message), JSON.stringify(out.body)).toMatch(words);
  expect(JSON.stringify(out.body)).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b(?<!SIGNATURE_REFUSED|NOT_FOUND)/);
}

const documentsOf = (accountId: string) => db.projectDocument.count({ where: { organisationId, createdBySupplierAccountId: accountId } });

/// An earlier submission as the closed send path left it, written directly (it is read-only now): `lines` in the same statement, as the trigger requires.
async function earlier(h: Holder, contractId: string, o: { kind?: Kind; title?: string; dueOn?: string | null; at?: Date; lines?: number; signedAt?: Date } = {}) {
  const when = o.at ?? new Date();
  return db.contractorSubmission.create({
    data: {
      organisationId,
      contractId,
      supplierId: h.supplierId,
      kind: o.kind ?? "WORK_PROGRAMME",
      title: o.title ?? "Revision 1",
      body: "Resequenced.",
      aboutDay: o.kind === "MATERIALS_ON_SITE" ? D(today) : null,
      submittedBySupplierAccountId: h.accountId,
      submittedAt: when,
      submittedOn: D(today),
      signedAt: o.signedAt ?? null,
      routedToRoleCode: soRole,
      routedToRoleLabel: "Superintending Officer (test)",
      serviceLevelDays: o.dueOn ? 1 : null,
      dueOn: o.dueOn ? D(o.dueOn) : null,
      ...(o.lines ? { lines: { create: Array.from({ length: o.lines }, (_, n) => ({ sortOrder: n + 1, description: "Pipe", quantity: "4 m", location: "Site", value: "100.00" })) } } : {}),
    },
  });
}

const portalSigning = (v: boolean | null) =>
  db.postAwardPolicy.upsert({ where: { organisationId }, update: { contractorPortalSigning: v, contractorPortalSigningProvenance: v == null ? null : "ASSUMED" }, create: { organisationId, contractorPortalSigning: v, contractorPortalSigningProvenance: v == null ? null : "ASSUMED" } });

afterAll(async () => {
  // The board test assumes the organisation holds fewer announcements than a page; the scratch organisation is shared across runs, so each run clears what it made.
  await db.announcement.deleteMany({ where: { organisationId } });
  await db.contractorSubmissionSetting.deleteMany({ where: { organisationId } });
  await portalSigning(null);
  if (classBefore !== undefined) await db.documentStorePolicy.update({ where: { organisationId }, data: { projectDocumentClassId: classBefore } });
});

describe("which contracts a contractor holds", () => {
  it("lists the contracts whose award names the supplier and stands, and nothing of another contractor's, a draft award's or a cancelled award's", async () => {
    const mine = await supplier();
    const other = await supplier();
    const held = await contract({ vendorId: mine.supplierId });
    const theirs = await contract({ vendorId: other.supplierId });
    const draft = await contract({ vendorId: mine.supplierId, awardStatus: "DRAFT" });
    const cancelled = await contract({ vendorId: mine.supplierId, awardStatus: "CANCELLED", status: "CANCELLED" });
    const unlinked = await contract({ vendorId: null });
    const ids = (await loadMyContracts(db, mine.actor)).map((r) => r.id);
    expect(ids).toContain(held.id);
    for (const id of [theirs.id, draft.id, cancelled.id, unlinked.id]) expect(ids).not.toContain(id);
    expect(await loadProjectContext(db, mine.actor, held.id)).toMatchObject({ contract: { id: held.id } });
    for (const id of [theirs.id, draft.id, unlinked.id, "nonexistent-id-0001"]) expect(await loadProjectContext(db, mine.actor, id), id).toBeNull();
  });

  it("another organisation's contract reads as not found", async () => {
    const mine = await supplier();
    const other = await db.organisation.create({ data: { code: `OTHER_${randomId()}`, name: "Another organisation" } });
    const p = await makePerson(other.id);
    const rq = await db.requisition.create({ data: { organisationId: other.id, reference: `OTH/R/${randomId()}`, requestingUnitCode: "X", requestingPersonId: p.id, title: "x", justification: "x", needStatement: "x", costCentreCode: "X", accountCode: "X", placeOfDelivery: "x", dateRequired: D(at(10)), estimatedValue: "1.00", raisedOn: D(at(-1)) } });
    const ex = await db.sourcingExercise.create({ data: { organisationId: other.id, reference: `OTH/${randomId()}`, requisitionId: rq.id, title: "Theirs", estimatedValue: "1.00", sourcingMethodCode: "X", status: "EVALUATED" } });
    const aw = await db.award.create({ data: { organisationId: other.id, reference: `OTH/AW/${randomId()}`, exerciseId: ex.id, instrumentKind: "WORK_INDENT", awardeeName: "x", awardedValue: "1.00", completionPeriod: 1, completionUnit: "DAYS", status: "ISSUED", vendorId: mine.supplierId } });
    const c = await db.contract.create({ data: { organisationId: other.id, number: `OTH/CON/${randomId()}`, numberSource: "SERIES", numberedOn: D(at(-1)), awardId: aw.id, contractSum: "1.00", status: "ACTIVE" } });
    expect(await loadProjectContext(db, mine.actor, c.id)).toBeNull();
    // Rewritten for PW-11: the create act that replaced the send path answers the same 404, and writes nothing.
    refused(await send(mine, c.id, "WORK_PROGRAMME"), 404, /not something you can open/);
    expect(await documentsOf(mine.accountId)).toBe(0);
  });
});

describe("a contractor's notice of one of the six kinds, sent from the Documents list (rewritten for PW-11)", () => {
  it("is written as the session's account with the server's day and time (a delay notice, FR-EOT-001), the S.O. office told, audited, and listed on both sides; it carries no due day", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const before = new Date(Math.floor(Date.now() / 1000) * 1000 - 1000);
    const sent = await send(h, c.id, "DELAY_NOTICE", { title: "  Delay at the culvert " });
    const after = new Date(Date.now() + 1000);
    expect(sent, JSON.stringify(sent)).toMatchObject({ status: 201, body: { ok: true } });
    const doc = await db.projectDocument.findUniqueOrThrow({ where: { id: sent.body.documentId as string }, include: { versions: true } });
    expect(doc).toMatchObject({ side: "CONTRACTOR", kind: "DELAY_NOTICE", title: "Delay at the culvert", createdBySupplierAccountId: h.accountId, createdByPersonId: null });
    const v = doc.versions[0]!;
    expect(v).toMatchObject({ number: 1, uploadedBySupplierAccountId: h.accountId, uploadedByPersonId: null });
    // The server's moment, never one the request named, and the organisation's day of it.
    expect(v.uploadedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(v.uploadedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(v.uploadedOn.toISOString().slice(0, 10)).toBe(today);
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "ProjectDocumentVersion", entityId: v.id } });
    expect(audit).toMatchObject({ action: "CREATE", actorSupplierAccountId: h.accountId });
    expect(JSON.stringify(audit.changes)).toMatch(/received/i);
    // The S.O. office's holder is told once, in the inbox, with no figure.
    const notices = await db.staffNotice.findMany({ where: { organisationId, subjectId: v.id } });
    expect(notices.map((n) => [n.recipientPersonId, n.kind])).toEqual([[officerId, "PROJECT_DOCUMENT_FROM_CONTRACTOR"]]);
    // Both lists show it received, waiting on the organisation; the organisation's own list says so in its configured name.
    const staffList = await loadRegister(db, { organisationId, contractId: c.id, orgName: "Org" });
    expect(staffList.rows[0]).toMatchObject({ id: doc.id, kindLabel: "Notice of a cause of delay", stateLabel: "Received", waitsOn: "ORGANISATION" });
    const portalList = (await loadPortalRegister(db, h.actor, c.id))!;
    expect(portalList.rows[0]).toMatchObject({ id: doc.id, stateLabel: "Received", waitsOnYou: false });
    expect(JSON.stringify(portalList.rows[0])).not.toMatch(/due|overdue/i);
  });

  it("takes no figure and no due day (PW-4, PW-10): an amount or a day is a field the body refuses, and the old service-level setting is not read even where it is set (PW-27)", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    for (const extra of [{ amount: "12500.50" }, { aboutDay: today }, { lines: [{ description: "Pipe" }] }]) {
      const parsed = parseCreateBody({ contractId: c.id, title: "Claim 1", mode: "upload", versionIds: ["version_00001"], kind: "INTERIM_CLAIM", ...extra });
      expect(parsed, JSON.stringify(extra)).toMatchObject({ ok: false, status: 400, errors: { [Object.keys(extra)[0]!]: expect.any(String) } });
    }
    await db.contractorSubmissionSetting.upsert({ where: { organisationId_kind: { organisationId, kind: "INTERIM_CLAIM" } }, update: { serviceLevelDays: 7, provenance: "ASSUMED" }, create: { organisationId, kind: "INTERIM_CLAIM", serviceLevelDays: 7, provenance: "ASSUMED" } });
    try {
      const sent = await send(h, c.id, "INTERIM_CLAIM", { title: "Claim 1" });
      expect(sent.status).toBe(201);
      const page = (await loadPortalRegister(db, h.actor, c.id))!.rows.find((r) => r.id === sent.body.documentId)!;
      expect(JSON.stringify(page)).not.toMatch(/due|7 days|overdue/i);
      const audits = await db.auditEntry.findMany({ where: { organisationId, entityId: { in: [sent.body.documentId as string, sent.body.versionId as string] } } });
      expect(JSON.stringify(audits.map((a) => a.changes))).not.toMatch(/due|service level/i);
    } finally {
      await db.contractorSubmissionSetting.update({ where: { organisationId_kind: { organisationId, kind: "INTERIM_CLAIM" } }, data: { serviceLevelDays: null, provenance: null } });
    }
  });

  it("is received all the same where the contract has no Superintending Officer, and nobody is told; the staff Documents card is told so (PW-48)", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId, so: false });
    const sent = await send(h, c.id, "DEFECTS_RECTIFIED", { title: "Defects made good" });
    expect(sent.status).toBe(201);
    expect(await db.staffNotice.count({ where: { organisationId, subjectId: sent.body.versionId as string } })).toBe(0);
    expect((await overviewTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!)).facts.soOffice).toBeNull();
    // PW-48: the fact the staff Documents card shows its warning from: no S.O. resolved today. With one resolved, the fact is false.
    const viewer = { kind: "STAFF", personId: officerId, organisationId, isAdministrator: false, permissions: new Set() } as unknown as StaffActor;
    expect((await loadWorkspaceStart(db, (await loadContract(organisationId, c.id))!, viewer)).noSoResolved).toBe(true);
    const resolved = await contract({ vendorId: h.supplierId });
    expect((await loadWorkspaceStart(db, (await loadContract(organisationId, resolved.id))!, viewer)).noSoResolved).toBe(false);
  });

  it("is refused, with nothing written, on another contractor's contract, on a cancelled one, with no title, and with no file", async () => {
    const h = await supplier();
    const other = await supplier();
    const theirs = await contract({ vendorId: other.supplierId });
    const cancelled = await contract({ vendorId: h.supplierId, status: "CANCELLED" });
    const mine = await contract({ vendorId: h.supplierId });
    refused(await send(h, theirs.id, "WORK_PROGRAMME"), 404, /not something you can open/);
    refused(await send(h, cancelled.id, "WORK_PROGRAMME"), 422, /cancel/i);
    refused(await send(h, mine.id, "WORK_PROGRAMME", { title: " " }), 422, /title/);
    // The old per-account bound (SUBMISSIONS_PER_WINDOW) is PW-32's window now, on the files every kind needs (`project-docs/portal.db.test.ts`): no file, no kind.
    refused(await send(h, mine.id, "WORK_PROGRAMME", { files: 0 }), 422, /at least one file/);
    expect(await documentsOf(h.accountId)).toBe(0);
    expect(await db.staffNotice.count({ where: { organisationId, kind: "PROJECT_DOCUMENT_FROM_CONTRACTOR", body: { contains: mine.id } } })).toBe(0);
  });

  it("a statutory declaration is signed with the password asked again: without it nothing is written, a stale one writes nothing, and the attribution names the version signed; every later version is signed too", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    refused(await send(h, c.id, "STATUTORY_DECLARATION"), 422, /signed with your password/);
    // A stale moment (not the session's) is refused by the attribution, and the document rolls back with it.
    refused(await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: new Date(Date.now() - 60_000) }), 403, /./);
    expect(await documentsOf(h.accountId)).toBe(0);
    const at1 = await stepUp(h);
    const sent = await send(h, c.id, "STATUTORY_DECLARATION", { title: "Declaration lodged", stepUpAt: at1 });
    expect(sent, JSON.stringify(sent)).toMatchObject({ status: 201 });
    const v1 = sent.body.versionId as string;
    // PW-44 (restored): the version itself carries the moment the password was asked again.
    expect((await db.projectDocumentVersion.findUniqueOrThrow({ where: { id: v1 } })).signedAt?.getTime()).toBe(at1.getTime());
    const a1 = await db.actAttribution.findFirstOrThrow({ where: { entity: "ProjectDocumentVersion", entityId: v1, slot: "uploadedBySupplierAccount" } });
    expect(a1).toMatchObject({ subjectSupplierAccountId: h.accountId, mode: "SIGNED", documentEntity: "ProjectDocumentVersion", documentId: v1 });
    expect(a1.stepUpAt?.getTime()).toBe(at1.getTime());
    // One password entry signs one act: the document itself carries no attribution.
    expect(await db.actAttribution.count({ where: { entity: "ProjectDocument", entityId: sent.body.documentId as string } })).toBe(0);
    // Version 2 of a declaration is signed too: refused without, signed with.
    const documentId = sent.body.documentId as string;
    refused(await contractorVersion(h.actor, { contractId: c.id, documentId, stagedVersionIds: [await stage(h.accountId)], note: "", kind: null }, null), 422, /signed with your password/);
    const at2 = await stepUp(h);
    const v2 = await contractorVersion(h.actor, { contractId: c.id, documentId, stagedVersionIds: [await stage(h.accountId)], note: "Corrected.", kind: null }, at2);
    expect(v2, JSON.stringify(v2)).toMatchObject({ status: 201, body: { number: 2 } });
    expect((await db.actAttribution.findFirstOrThrow({ where: { entity: "ProjectDocumentVersion", entityId: v2.body.versionId as string } })).stepUpAt?.getTime()).toBe(at2.getTime());
    expect((await db.projectDocumentVersion.findUniqueOrThrow({ where: { id: v2.body.versionId as string } })).signedAt?.getTime()).toBe(at2.getTime());
    // An ordinary kind's version writes no attribution and no signature moment: it is an upload, which signs nothing.
    const programme = await send(h, c.id, "WORK_PROGRAMME", { title: "Programme" });
    expect(await db.actAttribution.count({ where: { entity: "ProjectDocumentVersion", entityId: programme.body.versionId as string } })).toBe(0);
    expect((await db.projectDocumentVersion.findUniqueOrThrow({ where: { id: programme.body.versionId as string } })).signedAt).toBeNull();
  });

  it("an earlier declaration's signed attribution still resolves (PW-11): the slot stays, and the reader says who signed", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const at1 = await stepUp(h);
    const row = await earlier(h, c.id, { kind: "STATUTORY_DECLARATION", title: "Declaration lodged", signedAt: at1 });
    await attributeSupplierAct(db, { actor: h.actor, entity: "ContractorSubmission", entityId: row.id, slot: "submittedBy", stepUpAt: at1, document: { entity: "ContractorSubmission", id: row.id }, reason: "Signed with the password (earlier record)." });
    const index = await loadAttributions(db, organisationId, [{ entity: "ContractorSubmission", ids: [row.id], slot: "submittedBy" }]);
    const read = index.read({ entity: "ContractorSubmission", id: row.id, slot: "submittedBy" }, h.actor.displayName);
    expect(read.state).toBe("SIGNED");
    expect(read.en).toContain(h.actor.displayName);
  });
});

describe("the site diary (FR-SUP-007)", () => {
  const entry = (contractId: string, day: string) => db.siteDiaryEntry.create({ data: { organisationId, contractId, day: D(day), weather: "Fine", entry: "Pipe laying, chainage 1+200 to 1+260.", officerPersonId: officerId, officerAttestedOn: D(day), recordedAt: new Date(), recordedOn: D(day) } });

  it("the agent attests with the password asked again, once, from the portal; a stale moment writes nothing", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const e = await entry(c.id, today);
    await expect(attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: null })).rejects.toBeInstanceOf(AttributionRefused);
    expect((await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: e.id } })).agentAttestedOn).toBeNull();
    const at = await stepUp(h);
    const done = await attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: at });
    expect(done.day).toBe(today);
    const row = await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({ agentName: h.actor.displayName, agentAttestedBySupplierAccountId: h.accountId });
    expect(row.agentAttestedOn?.toISOString().slice(0, 10)).toBe(today);
    expect(row.agentAttestedAt).not.toBeNull();
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "SiteDiaryEntry", entityId: e.id, slot: "agentAttestedBy" } });
    expect(attribution).toMatchObject({ subjectSupplierAccountId: h.accountId, mode: "SIGNED", documentEntity: "SiteDiaryEntry", documentId: e.id });
    // Once: a second attestation is refused, however fresh the password.
    await refusedWith(attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: await stepUp(h) }), "ALREADY_ATTESTED");
    const tab = await diaryTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.rows.find((r) => r.id === e.id)).toMatchObject({ state: "COMPLETE", signedFromPortal: true, canAttest: false });
    // The list counts no entry left to attest.
    expect((await loadMyContracts(db, h.actor)).find((r) => r.id === c.id)?.toAttest).toBe(0);
  });

  it("a disagreement is recorded once, escalates the entry to the S.O. and names the account; an entry of another contractor's contract is not found", async () => {
    const h = await supplier();
    const other = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const theirs = await contract({ vendorId: other.supplierId });
    const e = await entry(c.id, dayPlus(today, -1));
    const foreign = await entry(theirs.id, today);
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: " " }), "DISAGREEMENT_REQUIRED");
    await disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: "Work stopped at noon for rain, not at three." });
    const row = await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({ disagreement: "Work stopped at noon for rain, not at three.", disputedBySupplierAccountId: h.accountId });
    expect(row.escalatedOn?.toISOString().slice(0, 10)).toBe(today);
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: "Again." }), "ALREADY_DISPUTED");
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: theirs.id, entryId: foreign.id, disagreement: "x" }), "NOT_FOUND", 404);
    await refusedWith(disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: foreign.id, disagreement: "x" }), "ENTRY_NOT_FOUND", 404);
    await refusedWith(attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: "nonexistent-id-0001", stepUpAt: await stepUp(h) }), "ENTRY_NOT_FOUND", 404);
    expect((await db.siteDiaryEntry.findUniqueOrThrow({ where: { id: foreign.id } })).disagreement).toBe("");
  });
});

describe("the contractor's block on a certificate (FR-VAR-022)", () => {
  const BLOCKS = [
    { blockOrder: 1, blockKind: "RECOMMENDING", labelEn: "Recommending officer", labelMs: null, datesCertificate: false, officeRule: "NAMED_OFFICE", officeCode: "PRJ_RO", delegable: false, carriesDecision: false, refusalAllowed: false },
    { blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Contractor", labelMs: null, datesCertificate: false, officeRule: "CONTRACTOR", officeCode: null, delegable: false, carriesDecision: false, refusalAllowed: true },
    { blockOrder: 3, blockKind: "WITNESS", labelEn: "Witness", labelMs: null, datesCertificate: false, officeRule: "WITNESS", officeCode: null, delegable: false, carriesDecision: false, refusalAllowed: false },
  ];
  let issued = 0;
  async function certificate(contractId: string, o: { kind?: CertificateKind; firstSigned?: boolean; status?: "IN_ROUTING" | "SIGNING" | "ISSUED"; blocks?: typeof BLOCKS } = {}) {
    const baseline = (await db.contractBaseline.findFirst({ where: { contractId, version: 1 }, select: { id: true } })) ?? (await db.contractBaseline.create({ data: { organisationId, contractId, version: 1, reason: "EXECUTED", contractSum: "100000.00", completionPeriod: 90, completionUnit: "DAYS", entered: {}, snapshot: {}, recordedAt: at(-10), recordedOn: D(at(-10)) }, select: { id: true } }));
    const template = await db.documentTemplate.create({ data: { organisationId, code: `PRJ_FORM_${randomId()}`, nameEn: "Variation Order Certificate (test)", formCode: "VO-660" } });
    const revision = { templateId: template.id, code: template.code, nameEn: template.nameEn, nameMs: null, formCode: "VO-660", revisionDate: null, bodyVersion: 1, bodyEn: "Body", bodyMs: null, blocks: o.blocks ?? BLOCKS, distribution: [], pinnedOn: dayPlus(today, -2) };
    const cert = await db.certificate.create({ data: { organisationId, contractId, kind: o.kind ?? "VARIATION", status: o.status ?? "SIGNING", templateId: template.id, templateRevision: revision, pinnedAt: at(-2), baselineId: baseline.id, openedAt: at(-3), openedOn: D(at(-3)), ...(o.status === "ISSUED" ? { number: `PRJ/CERT/${randomId()}`, sequence: ++issued, issuedAt: at(-1), issueSnapshot: {} } : {}) } });
    if (o.firstSigned !== false) await db.certificateSignature.create({ data: { organisationId, certificateId: cert.id, blockOrder: 1, blockKind: "RECOMMENDING", blockLabel: "Recommending officer", personId: officerId, name: "The officer", signedOn: D(at(-1)), recordedAt: at(-1) } });
    return cert.id;
  }

  it("is signed with the password asked again, from the portal, and named on the signature and its attribution", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const certId = await certificate(c.id);
    await expect(signContractorBlock(h.actor, { contractId: c.id, certificateId: certId, action: "sign", note: "", stepUpAt: null })).rejects.toBeInstanceOf(AttributionRefused);
    expect(await db.certificateSignature.count({ where: { certificateId: certId, blockOrder: 2 } })).toBe(0);
    const done = await signContractorBlock(h.actor, { contractId: c.id, certificateId: certId, action: "sign", note: "", stepUpAt: await stepUp(h) });
    expect(done.blockOrder).toBe(2);
    const sig = await db.certificateSignature.findFirstOrThrow({ where: { certificateId: certId, blockOrder: 2 } });
    expect(sig).toMatchObject({ name: h.actor.displayName, refused: false, signedBySupplierAccountId: h.accountId, personId: null });
    expect(sig.signedOn.toISOString().slice(0, 10)).toBe(today);
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "CertificateSignature", entityId: sig.id, slot: "signedBySupplierAccount" } });
    expect(attribution).toMatchObject({ subjectSupplierAccountId: h.accountId, mode: "SIGNED", documentEntity: "Certificate", documentId: certId });
    // The witness block is still open: the certificate is not issued by the contractor's signature.
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certId } })).status).toBe("SIGNING");
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: certId, action: "sign", note: "", stepUpAt: await stepUp(h) }), "BLOCK_SIGNED");
    const tab = await certificatesTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.rows.find((r) => r.id === certId)).toMatchObject({ recorded: { fromPortal: true, refused: false }, block: { state: "NOT_OFFERED", why: "SIGNED" } });
  });

  // Close-out stage C (CO-9; FR-FIN-009): the contractor accepts the final account by signing the final certificate's CONTRACTOR block from the portal.
  it("signs the final certificate's contractor block from the portal, once making good is complete", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    await db.contract.update({ where: { id: c.id }, data: { status: "MAKING_GOOD_COMPLETE" } });
    const certId = await certificate(c.id, { kind: "FINAL" });
    const done = await signContractorBlock(h.actor, { contractId: c.id, certificateId: certId, action: "sign", note: "", stepUpAt: await stepUp(h) });
    expect(done.blockOrder).toBe(2);
    expect(await db.certificateSignature.findFirstOrThrow({ where: { certificateId: certId, blockOrder: 2 } })).toMatchObject({ signedBySupplierAccountId: h.accountId, refused: false });
  });

  it("a dispute is the refusal the form allows, with its reason; the block is offered only in order, on the two kinds, and only on the contractor's own contract", async () => {
    const h = await supplier();
    const other = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const theirs = await contract({ vendorId: other.supplierId });
    const disputed = await certificate(c.id, { kind: "SUM_ADJUSTMENT" });
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: disputed, action: "dispute", note: "", stepUpAt: await stepUp(h) }), "REFUSAL_NOTE_REQUIRED");
    await signContractorBlock(h.actor, { contractId: c.id, certificateId: disputed, action: "dispute", note: "The omission is overstated.", stepUpAt: await stepUp(h) });
    expect(await db.certificateSignature.findFirstOrThrow({ where: { certificateId: disputed, blockOrder: 2 } })).toMatchObject({ refused: true, refusalNote: "The omission is overstated.", signedBySupplierAccountId: h.accountId });
    const notNext = await certificate(c.id, { firstSigned: false });
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: notNext, action: "sign", note: "", stepUpAt: await stepUp(h) }), "BLOCK_NOT_NEXT");
    const interim = await certificate(c.id, { kind: "INTERIM_PAYMENT" });
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: interim, action: "sign", note: "", stepUpAt: await stepUp(h) }), "NO_CONTRACTOR_BLOCK");
    const foreign = await certificate(theirs.id);
    await refusedWith(signContractorBlock(h.actor, { contractId: theirs.id, certificateId: foreign, action: "sign", note: "", stepUpAt: await stepUp(h) }), "NOT_FOUND", 404);
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: foreign, action: "sign", note: "", stepUpAt: await stepUp(h) }), "NOT_FOUND", 404);
    await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: "nonexistent-id-0001", action: "sign", note: "", stepUpAt: await stepUp(h) }), "NOT_FOUND", 404);
    expect(await db.certificateSignature.count({ where: { certificateId: { in: [notNext, interim, foreign] }, blockOrder: 2 } })).toBe(0);
    // The list counts the one certificate whose block is next.
    const row = (await loadMyContracts(db, h.actor)).find((r) => r.id === c.id)!;
    expect(row.toSign).toBe(0);
  });

  it("the tab lists what is the contractor's: never a certificate the office is still deliberating, nor an internal letter (4e review fix)", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const intent = await certificate(c.id, { kind: "TERMINATION_INTENT", status: "IN_ROUTING", firstSigned: false });
    const letter = await certificate(c.id, { kind: "DELEGATION_LETTER" });
    const letterIssued = await certificate(c.id, { kind: "DELEGATION_LETTER", status: "ISSUED" });
    const nonCompletion = await certificate(c.id, { kind: "NON_COMPLETION" });
    const vo = await certificate(c.id);
    const interim = await certificate(c.id, { kind: "INTERIM_PAYMENT", status: "ISSUED" });
    const tab = await certificatesTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    const ids = tab.rows.map((r) => r.id);
    for (const id of [intent, letter, letterIssued, nonCompletion]) expect(ids).not.toContain(id);
    expect(ids).toContain(vo);
    expect(ids).toContain(interim);
    expect(tab.total).toBe(2);
  });

  it("is not offered, and is refused signed or disputed, where it is the last block to record: recording it would issue the certificate under the contractor's account (4e review fix, OPEN I)", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const last = await certificate(c.id, { blocks: BLOCKS.filter((b) => b.blockKind !== "WITNESS") });
    for (const action of ["sign", "dispute"] as const) await refusedWith(signContractorBlock(h.actor, { contractId: c.id, certificateId: last, action, note: "The omission is overstated.", stepUpAt: await stepUp(h) }), "BLOCK_IS_LAST");
    expect(await db.certificateSignature.count({ where: { certificateId: last, blockOrder: 2 } })).toBe(0);
    const cert = await db.certificate.findUniqueOrThrow({ where: { id: last } });
    expect(cert.status).toBe("SIGNING");
    expect(cert.number).toBeNull();
    expect(await db.auditEntry.count({ where: { entity: { in: ["Certificate", "CertificateSignature"] }, actorSupplierAccountId: h.accountId } })).toBe(0);
    const tab = await certificatesTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.rows.find((r) => r.id === last)).toMatchObject({ block: { state: "NOT_OFFERED", why: "LAST" } });
  });
});

describe("the announcements board", () => {
  it("shows the standing announcements pinned first, then newest first, and never a withdrawn one; the officers' register shows all", async () => {
    const h = await supplier();
    const publisher = await makePerson(organisationId, `Publisher ${randomId()}`);
    const mk = (title: string, o: { pinned?: boolean; withdrawn?: boolean; daysAgo: number }) =>
      db.announcement.create({ data: { organisationId, category: "NOTICE", title, body: "Body.", pinned: o.pinned ?? false, publishedOn: D(at(-o.daysAgo)), publishedAt: at(-o.daysAgo), publishedByPersonId: publisher.id, ...(o.withdrawn ? { withdrawnAt: new Date(), withdrawnByPersonId: publisher.id, withdrawReason: "Superseded." } : {}) } });
    const run = randomId();
    const old = await mk(`Old ${run}`, { daysAgo: 30 });
    const pinned = await mk(`Pinned ${run}`, { pinned: true, daysAgo: 40 });
    const fresh = await mk(`Fresh ${run}`, { daysAgo: 1 });
    const gone = await mk(`Gone ${run}`, { withdrawn: true, daysAgo: 2 });
    // 4e review fix: the board is one page with its total (paged in the database); this organisation has fewer than a page, so every one is on the first.
    const page = await loadBoard(db, h.actor.organisationId, "Asia/Kuala_Lumpur");
    const board = page.items.filter((a) => a.title.endsWith(run)).map((a) => a.id);
    expect(board).toEqual([pinned.id, fresh.id, old.id]);
    expect(page.total).toBe(page.items.length);
    const all = (await loadBoard(db, organisationId, "Asia/Kuala_Lumpur", { withdrawn: true })).items.map((a) => a.id);
    expect(all).toContain(gone.id);
    // Withdrawn whole, by CHECK: an instant without the person is refused.
    await expect(db.announcement.update({ where: { id: old.id }, data: { withdrawnAt: new Date() } })).rejects.toThrow(/Announcement_withdrawn_whole|constraint/i);
  });
});

describe("who may bind the contractor from the portal (4e review fix; rewritten for PW-11)", () => {
  it("unset, the statutory declaration and the certificate block are refused in words and nothing is written; decided no, the same; the attribution names the signatory's designation", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    try {
      await portalSigning(null);
      refused(await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: await stepUp(h) }), 422, /not yet decided whether a contractor may sign/);
      await portalSigning(false);
      refused(await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: await stepUp(h) }), 422, /on paper only/);
      expect(await documentsOf(h.accountId)).toBe(0);
      // A kind that signs nothing is not touched by the switch.
      expect((await send(h, c.id, "WORK_PROGRAMME", { title: "Revision 2" })).status).toBe(201);
      const tab = await submissionsTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
      expect(tab.signing).toMatch(/on paper only/);
    } finally {
      await portalSigning(true);
    }
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { designation: "Director" } });
    const sent = await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: await stepUp(h) });
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "ProjectDocumentVersion", entityId: sent.body.versionId as string, slot: "uploadedBySupplierAccount" } });
    expect(attribution.reason).toContain(`by ${h.actor.displayName} (Director)`);
  });
});

describe("who signs for the company (ruling on 1928(3); rewritten for PW-11)", () => {
  it("a contact an officer has not marked, or marked no, is refused the declaration notice, naming why; marked yes, it is sent", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { authorisedToSignForContractor: null } });
    refused(await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: await stepUp(h) }), 422, /not recorded that you may sign for your company/);
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { authorisedToSignForContractor: false } });
    refused(await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: await stepUp(h) }), 422, /do not sign for your company/);
    expect(await documentsOf(h.accountId)).toBe(0);
    const tab = await submissionsTab(db, h.actor, (await loadProjectContext(db, h.actor, c.id))!);
    expect(tab.signing).toMatch(/do not sign for your company/);
    // A kind that signs nothing is not touched by the mark.
    expect((await send(h, c.id, "WORK_PROGRAMME", { title: "Revision 3" })).status).toBe(201);
    await db.supplierContact.update({ where: { id: h.actor.contactId }, data: { authorisedToSignForContractor: true } });
    expect((await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: await stepUp(h) })).status).toBe(201);
    expect(await db.projectDocument.count({ where: { organisationId, createdBySupplierAccountId: h.accountId, kind: "STATUTORY_DECLARATION" } })).toBe(1);
  });

  it("the organisation's switch is asked first: off, a marked contact is still refused for the switch", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    try {
      await portalSigning(false);
      refused(await send(h, c.id, "STATUTORY_DECLARATION", { stepUpAt: await stepUp(h) }), 422, /on paper only/);
    } finally {
      await portalSigning(true);
    }
  });
});

describe("a supplier whose standing bars it may read and do nothing else (ruling on 1875(3); rewritten for PW-11)", () => {
  it("a rejected supplier is refused a document, in words, with nothing written, and still reads its contract", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    await db.supplier.update({ where: { id: h.supplierId }, data: { status: "REJECTED" } });
    const out = await send(h, c.id, "WORK_PROGRAMME");
    expect(out.status).toBe(422);
    expect(await documentsOf(h.accountId)).toBe(0);
    expect(await loadMyContracts(db, h.actor)).toBeDefined();
  });

  it("a supplier suspended by hand is refused the same, saying it is suspended; lifted, it is not", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const reason = await db.standingReason.create({ data: { organisationId, code: `T_${randomId()}`, nameEn: "A test reason", appliesTo: "SUSPEND" } });
    const event = await db.standingEvent.create({ data: { organisationId, supplierId: h.supplierId, kind: "SUSPEND", reasonId: reason.id, reasonSnapshot: "Test", effectiveOn: D(at(-1)), flaggedDocumentIds: [], recordedByPersonId: officerId, recordedAt: new Date() } });
    refused(await send(h, c.id, "WORK_PROGRAMME"), 422, /suspended/);
    await db.standingEvent.create({ data: { organisationId, supplierId: h.supplierId, kind: "REINSTATE", reasonSnapshot: "Test", effectiveOn: D(at(0)), flaggedDocumentIds: [], reinstatesEventId: event.id, recordedByPersonId: officerId, recordedAt: new Date() } });
    expect((await send(h, c.id, "WORK_PROGRAMME")).status).toBe(201);
    expect(await documentsOf(h.accountId)).toBe(1);
  });
});

describe("the review queue's counts are the whole register's (4e review fix)", () => {
  it("waiting and overdue are count queries: overdue is waiting past its due day, and due today is not overdue", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const before = await reviewCounts(db, organisationId, today);
    const mk = (dueOn: string | null) => db.contractorSubmission.create({ data: { organisationId, contractId: c.id, supplierId: h.supplierId, kind: "WORK_PROGRAMME", title: "x", body: "x", submittedBySupplierAccountId: h.accountId, submittedAt: at(-10), submittedOn: D(dayPlus(today, -10)), serviceLevelDays: dueOn ? 1 : null, dueOn: dueOn ? D(dueOn) : null } });
    await mk(dayPlus(today, -1));
    await mk(today);
    await mk(null);
    const after = await reviewCounts(db, organisationId, today);
    expect(after.waiting - before.waiting).toBe(3);
    expect(after.overdue - before.overdue).toBe(1);
    expect((await reviewCounts(db, organisationId, null)).overdue).toBe(0);
    // The earlier queue pages the earlier rows alone; its overdue is theirs.
    const q = await loadReviewQueue(db, organisationId, today);
    expect(q.waiting.total).toBe(await db.contractorSubmission.count({ where: { organisationId, outcome: null } }));
    expect(q.overdue).toBe(after.overdue);
    // Plan step 6 (PW-11): waiting reads both sources. A received kind waits on the organisation too, and is never overdue (it has no due day, PW-4).
    expect((await send(h, c.id, "DELAY_NOTICE")).status).toBe(201);
    const both = await reviewCounts(db, organisationId, today);
    expect(both.waiting - after.waiting).toBe(1);
    expect(both.overdue).toBe(after.overdue);
    expect(await documentsWaitingCount(db, organisationId)).toBe(both.waiting);
  });
});

describe("the queue's scope (AC-16, AC-18, AC-19)", () => {
  it("a contract's tab reads only its own submissions, and a restricted exercise's contract submissions stay in the organisation-wide view for the officer who answers them", async () => {
    const h = await supplier();
    const mine = await contract({ vendorId: h.supplierId });
    const restricted = await contract({ vendorId: h.supplierId });
    const mk = (contractId: string) => db.contractorSubmission.create({ data: { organisationId, contractId, supplierId: h.supplierId, kind: "WORK_PROGRAMME", title: "x", body: "x", submittedBySupplierAccountId: h.accountId, submittedAt: new Date(), submittedOn: dayToDate(today), serviceLevelDays: 1, dueOn: dayToDate(dayPlus(today, -1)) } });
    await mk(mine.id);
    await mk(restricted.id);
    const own = await loadReviewQueue(db, organisationId, today, {}, { contractId: mine.id });
    expect(own.waiting.rows.map((r) => r.contractId)).toEqual([mine.id]);
    expect(own.overdue).toBe(1);
    expect((await reviewCounts(db, organisationId, today, { contractId: mine.id })).waiting).toBe(1);
    // AC-18: contract stages stay visible after issue, so the view carries the restricted exercise's contract too, and its own tab counts it.
    const all = await loadReviewQueue(db, organisationId, today, { waiting: "999999" });
    expect(all.waiting.rows.some((r) => r.contractId === restricted.id)).toBe(true);
    expect((await reviewCounts(db, organisationId, today, { contractId: restricted.id })).waiting).toBe(1);
    const tab = await loadReviewQueue(db, organisationId, today, {}, { contractId: restricted.id });
    expect(tab.waiting.rows.map((r) => r.contractId)).toEqual([restricted.id]);
    // Plan step 6: a contract's count reads both sources, its own only.
    expect((await send(h, mine.id, "WORK_PROGRAMME")).status).toBe(201);
    expect((await reviewCounts(db, organisationId, today, { contractId: mine.id })).waiting).toBe(2);
    expect((await reviewCounts(db, organisationId, today, { contractId: restricted.id })).waiting).toBe(1);
  });
});

describe("a contract's Documents tab counts (AC-16)", () => {
  it("a contract with no certificate has no copy unsent and no sheet open, and the tab links to nothing; a zone not set judges no sheet late", async () => {
    const c = await contract({ vendorId: null });
    const facts = await contractDocumentFacts(organisationId, c.id, today);
    expect(facts).toEqual({ notSent: 0, firstUnsentCertificateId: null, sheetsOpen: 0, overTarget: 0, firstOpenCertificateId: null });
    expect((await contractDocumentFacts(organisationId, c.id, null)).overTarget).toBeNull();
  });
});

describe("what the portal sent or signed is frozen in the database (4e review fix)", () => {
  const raw = (sql: string, ...v: unknown[]) => db.$executeRawUnsafe(sql, ...v);

  it("a submission is never changed or removed, its lines are never added to, changed or removed, and it is answered once, whole", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    // Rewritten for PW-11: the row is seeded as the closed send path left it (the triggers guard every earlier row, however it was written).
    const sent = await earlier(h, c.id, { kind: "MATERIALS_ON_SITE", title: "Materials", lines: 1 });
    const id = sent.id;
    await expect(raw(`UPDATE "ContractorSubmission" SET "title" = 'Changed' WHERE id = $1`, id)).rejects.toThrow(/never changes/);
    await expect(raw(`UPDATE "ContractorSubmission" SET "aboutDay" = NULL WHERE id = $1`, id)).rejects.toThrow(/never changes/);
    await expect(raw(`DELETE FROM "ContractorSubmission" WHERE id = $1`, id)).rejects.toThrow(/is kept/);
    await expect(raw(`UPDATE "ContractorSubmissionLine" SET "value" = 1 WHERE "submissionId" = $1`, id)).rejects.toThrow(/frozen as sent/);
    await expect(raw(`DELETE FROM "ContractorSubmissionLine" WHERE "submissionId" = $1`, id)).rejects.toThrow(/frozen as sent/);
    await expect(db.contractorSubmissionLine.create({ data: { submissionId: id, sortOrder: 9, description: "More", quantity: "1", location: "x", value: "1.00" } })).rejects.toThrow(/sent already/);
    await expect(raw(`TRUNCATE "ContractorSubmissionLine"`)).rejects.toThrow(/append-only/);
    // An answer that is not whole is refused; a whole one is taken, once.
    await expect(raw(`UPDATE "ContractorSubmission" SET "outcome" = 'TAKEN_UP' WHERE id = $1`, id)).rejects.toThrow(/together/);
    await raw(`UPDATE "ContractorSubmission" SET "outcome" = 'RETURNED', "outcomeNote" = 'Add the delivery orders.', "decidedByPersonId" = $2, "decidedOn" = $3::date, "decidedAt" = now() WHERE id = $1`, id, officerId, today);
    await expect(raw(`UPDATE "ContractorSubmission" SET "outcomeNote" = 'Changed' WHERE id = $1`, id)).rejects.toThrow(/answered already/);
    // Answered, a line still cannot be added in the answering transaction.
    await expect(db.$transaction(async (tx) => tx.contractorSubmissionLine.create({ data: { submissionId: id, sortOrder: 8, description: "More", quantity: "1", location: "x", value: "1.00" } }))).rejects.toThrow(/sent already/);
    expect(await db.contractorSubmissionLine.count({ where: { submissionId: id } })).toBe(1);
    // The CHECK: a day only on the kinds that carry one.
    await expect(db.contractorSubmission.create({ data: { organisationId, contractId: c.id, supplierId: h.supplierId, kind: "WORK_PROGRAMME", title: "x", body: "x", aboutDay: D(today), submittedBySupplierAccountId: h.accountId, submittedAt: new Date(), submittedOn: D(today) } })).rejects.toThrow(/ContractorSubmission_day_kind|constraint/i);
  });

  it("the agent's attestation and disagreement from the portal, and a certificate block signed from the portal, are kept; the officers' own columns stay theirs", async () => {
    const h = await supplier();
    const c = await contract({ vendorId: h.supplierId });
    const e = await db.siteDiaryEntry.create({ data: { organisationId, contractId: c.id, day: D(today), weather: "Fine", entry: "Work.", officerPersonId: officerId, recordedAt: new Date(), recordedOn: D(today) } });
    await attestDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, stepUpAt: await stepUp(h) });
    await disputeDiaryAsAgent(h.actor, { contractId: c.id, entryId: e.id, disagreement: "Rain from noon." });
    await expect(raw(`UPDATE "SiteDiaryEntry" SET "agentName" = 'Someone else' WHERE id = $1`, e.id)).rejects.toThrow(/signed from the portal/);
    await expect(raw(`UPDATE "SiteDiaryEntry" SET "disagreement" = 'Nothing' WHERE id = $1`, e.id)).rejects.toThrow(/recorded from the portal/);
    await expect(raw(`DELETE FROM "SiteDiaryEntry" WHERE id = $1`, e.id)).rejects.toThrow(/portal account/);
    // The officer's own attestation is still the officer's to record.
    await raw(`UPDATE "SiteDiaryEntry" SET "officerAttestedOn" = $2::date WHERE id = $1`, e.id, today);
    // A paper-recorded entry is untouched by the trigger.
    const paper = await db.siteDiaryEntry.create({ data: { organisationId, contractId: c.id, day: D(dayPlus(today, -1)), weather: "Fine", entry: "Work.", officerPersonId: officerId, recordedAt: new Date(), recordedOn: D(dayPlus(today, -1)), agentAttestedOn: D(dayPlus(today, -1)), agentName: "Paper agent" } });
    await raw(`UPDATE "SiteDiaryEntry" SET "agentName" = 'Paper agent, corrected' WHERE id = $1`, paper.id);

    const s = await db.certificateSignature.create({ data: { organisationId, certificateId: (await db.certificate.findFirstOrThrow({ where: { organisationId }, select: { id: true } })).id, blockOrder: 900 + Math.floor(Math.random() * 90), blockKind: "CONTRACTOR", blockLabel: "Contractor", name: h.actor.displayName, signedOn: D(today), recordedAt: new Date(), signedBySupplierAccountId: h.accountId } });
    await expect(raw(`UPDATE "CertificateSignature" SET "refused" = true WHERE id = $1`, s.id)).rejects.toThrow(/portal account/);
    await expect(raw(`DELETE FROM "CertificateSignature" WHERE id = $1`, s.id)).rejects.toThrow(/portal account/);
  });
});
