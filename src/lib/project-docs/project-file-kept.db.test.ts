import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { inHeldContract } from "@/lib/portal/projects/submission-store";
import { makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";

/**
 * A project file is kept (ruling PW-33, audit M1 and L7; tests T2 of PW-43), against a real database. A store version held by a live Project workspace attachment
 * is never withdrawn by the generic document store: the pure `withdrawFault` refuses it in its words, under the store document's lock, before trigger PA047; the
 * document drawer draws no Withdraw on it. The generic detach and repin (`detachDocument`, `attachNewVersion`) leave it as it was. After a stranger's refused
 * withdrawal the contractor's portal still lists the file and serves its download.
 *
 * No earlier test withdrew a pinned project file (checked when PW-33 was built): there was none to rewrite.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => (await import("@/lib/test-support/staff")).actModule().module);
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { attachNewVersion, detachDocument, loadDocumentDrawer, withdrawVersion } from "@/app/documents/actions";
import { findProjectFile } from "./portal-file";
import { loadPortalDocumentPage } from "./portal-read";
import { createDocument } from "./store";

const run = randomId();
const TZ = "Asia/Kuala_Lumpur";
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let soRole = "";
let projectClassId = "";
/// `so` holds the S.O. office; `stranger` holds nothing (PW-5: reads only), and is the one who tries the generic store's acts.
const p = { so: "", stranger: "" };
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
    organisationCode: `PFK_${run}`,
    organisationTimeZone: TZ,
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

async function contractor() {
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
    organisationTimeZone: TZ,
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.9",
    mustChangePassword: false,
    resetNoticePending: false,
  };
  return { actor, supplierId: s.supplier.id, accountId: s.account!.id };
}

async function contract(vendorId: string) {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PFK/RQ/${r}`, requestingUnitCode: "PFK_DEPT", requestingPersonId: p.so, title: "Kept file requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "PFK_CC", accountCode: "PFK_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `PFK/EX/${r}`, requisitionId: requisition.id, title: `Culvert ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "PFK_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `PFK/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId } });
  const c = await db.contract.create({ data: { organisationId, number: `PFK/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status: "ACTIVE" } });
  await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  return c.id;
}

/// A file staged for a project document by a portal account.
async function stage(accountId: string) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 kept ${run} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = `delay-notice-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "project-document" } });
  return (await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedBySupplierAccountId: accountId, storedAt: new Date() } })).id;
}

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `PFK_${run}`, name: `Jabatan Fail ${run}`, timeZone: TZ } })).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Kept ${k} ${run}`)).id;
  soRole = `PFK_SO_${run}`;
  await db.roleAssignment.create({ data: { personId: p.so, roleCode: soRole, effectiveFrom: D(new Date("2020-01-01")) } });
  projectClassId = (await db.documentClass.create({ data: { organisationId, code: "pfk_project", nameEn: "Project files", classification: "INTERNAL" } })).id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
});

/// The contractor's delay notice, sent with one staged file: the project file, its store version and its pin.
async function sentNotice() {
  const c = await contractor();
  const contractId = await contract(c.supplierId);
  const file = await stage(c.accountId);
  const made = await inHeldContract(c.actor, contractId, (tx, l, today) =>
    createDocument({ tx, l, now: new Date(), today }, { kind: "SUPPLIER", actor: c.actor }, { title: "Delay at the culvert", note: "", first: { upload: { stagedVersionIds: [file], note: "" } }, approverPersonIds: [], kind: "DELAY_NOTICE" }, null),
  );
  const pin = await db.documentAttachment.findFirstOrThrow({ where: { versionId: file, purpose: "PROJECT_DOCUMENT_FILE" } });
  const storeDocumentId = (await db.documentVersion.findUniqueOrThrow({ where: { id: file }, select: { documentId: true } })).documentId;
  return { c, contractId, file, pin, storeDocumentId, documentId: made.documentId };
}

const portalServes = async (n: Awaited<ReturnType<typeof sentNotice>>) => {
  const page = await loadPortalDocumentPage(db, n.c.actor, n.contractId, n.documentId);
  const found = await findProjectFile(db, n.c.actor, n.pin.id);
  return { files: page?.versions.flatMap((v) => v.files.map((f) => f.attachmentId)) ?? [], served: found.ok };
};

describe("PW-33: a project file is kept from the generic document store", () => {
  it("withdrawing a pinned project file is refused in its own words, by anyone, and nothing changes; the portal still lists and serves it (T2)", async () => {
    const n = await sentNotice();
    expect(await portalServes(n)).toEqual({ files: [n.pin.id], served: true });
    for (const who of [p.stranger, p.so]) {
      const r = await as(who, () => withdrawVersion({ ok: false }, form({ versionId: n.file, reason: "Uploaded to the wrong record" })));
      expect(r.ok, who).toBe(false);
      expect(r.message, who).toMatch(/This file is kept: a project document or an award return sent online holds it\./);
    }
    // A blank reason is refused the same way: the file is kept, whatever is said.
    const blank = await as(p.stranger, () => withdrawVersion({ ok: false }, form({ versionId: n.file, reason: " " })));
    expect(blank.message).toMatch(/This file is kept/);
    expect((await db.documentVersion.findUniqueOrThrow({ where: { id: n.file } })).withdrawnAt).toBeNull();
    expect(await db.auditEntry.count({ where: { organisationId, entity: "DocumentVersion", entityId: n.file, action: "UPDATE" } })).toBe(0);
    expect(await portalServes(n)).toEqual({ files: [n.pin.id], served: true });
  });

  it("the document drawer draws no Withdraw on a project file: its version reads as kept; a version no project file holds still may be withdrawn", async () => {
    const n = await sentNotice();
    const drawer = await as(p.stranger, () => loadDocumentDrawer(n.storeDocumentId));
    expect(drawer?.versions.map((v) => [v.versionNo, v.keptAsProjectFile])).toEqual([[1, true]]);
    // A store document of another purpose: nothing keeps it.
    const loose = await db.document.create({ data: { organisationId, title: "Loose scan", documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {} } });
    const bytes = new TextEncoder().encode(`%PDF-1.4 loose ${run}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const v = await db.documentVersion.create({ data: { organisationId, documentId: loose.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "loose.pdf", recordedByPersonId: p.so, storedAt: new Date() } });
    expect((await as(p.stranger, () => loadDocumentDrawer(loose.id)))?.versions.map((x) => x.keptAsProjectFile)).toEqual([false]);
    expect(await as(p.stranger, () => withdrawVersion({ ok: false }, form({ versionId: v.id, reason: "Wrong scan" })))).toMatchObject({ ok: true });
  });

  it("T2: the generic detach and repin leave a project file as it was: refused, the pin live, its version unchanged, and the portal still serves it", async () => {
    const n = await sentNotice();
    const detached = await as(p.stranger, () => detachDocument({ ok: false }, form({ attachmentId: n.pin.id, reason: "Not needed" })));
    expect(detached.ok).toBe(false);
    // A newer version of the same store document exists; the generic repin still cannot move the project file to it.
    const bytes = new TextEncoder().encode(`%PDF-1.4 newer ${run}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const newer = await db.documentVersion.create({ data: { organisationId, documentId: n.storeDocumentId, versionNo: 2, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "newer.pdf", recordedByPersonId: p.stranger, storedAt: new Date() } });
    const repinned = await as(p.stranger, () => attachNewVersion({ ok: false }, form({ attachmentId: n.pin.id, versionId: newer.id, reason: "A better scan" })));
    expect(repinned.ok).toBe(false);
    const pin = await db.documentAttachment.findUniqueOrThrow({ where: { id: n.pin.id } });
    expect(pin).toMatchObject({ versionId: n.file, detachedAt: null, projectDocumentVersionId: n.pin.projectDocumentVersionId });
    expect(await db.documentAttachment.count({ where: { versionId: newer.id } })).toBe(0);
    expect(await portalServes(n)).toEqual({ files: [n.pin.id], served: true });
  });
});
