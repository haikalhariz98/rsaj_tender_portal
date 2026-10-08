import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { sulitGates } from "@/app/_auth/sulit";
import { documentBytesAccess, sulitAttachRefused } from "@/lib/documents/entitlement";
import { documentOrg, logAccess, storeUpload } from "@/lib/documents/service";
import { bqTab } from "@/lib/scope/read";
import { sulitWithheld } from "@/lib/auth/sulit-access";
import { sulitWriteRefusal, type SulitReader } from "@/lib/auth/sulit-store";
import { BQ_FIELDS } from "@/lib/scope/bq-fields";
import { routeModule } from "@/lib/test-support/staff";
import type { PermissionKey, StaffActor } from "@/lib/auth/types";
import { makePerson, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * The SULIT rule across the modules, against the scratch database (Phase 3b; ADR 0034 D14, OD-2, NFR-AUD-004), as three readers: one named on the record, one the
 * organisation has entitled (it holds `sulit.read.organisation`), and one who is neither; and an administrator and a loader run, who are never entitled.
 *
 * - A SULIT document's bytes are opened by the named person and the entitled one, refused to the others, and every judgement is logged against the record with the actor.
 * - A download that is refused answers 403, and writes a document access event that names who asked.
 * - Adding a version to a SULIT document by someone who may not open it reads as a document that is not there, and its log row survives (C-6).
 * - The write rule logs in the act's own transaction, so a refusal an act returns is kept.
 * - The rule for a requisition, contract or supplier (no list of who is named) is the permission alone, per record, with the actor.
 * - A bill of quantities read for a reader it is withheld from carries no rate, amount or total anywhere in what is returned.
 */

let route: StaffActor | null = null;
vi.mock("@/app/_auth/route", async () => ({
  staffRoute: async () => ({ ok: true as const, actor: route! }),
  refusalResponse: (code: string, message?: string) => Response.json({ ok: false, code, message: message ?? code }, { status: 403 }),
}));
void routeModule;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId = "";
let exerciseId = "";
let reference = "";
let requisitionId = "";
const who = { named: "", entitled: "", neither: "", admin: "" };

const reader = (personId: string, over: Partial<SulitReader> & { permissions?: ReadonlySet<PermissionKey> } = {}): SulitReader & StaffActor => ({
  kind: "STAFF",
  accountId: `acct_${randomId()}`,
  sessionId: `sess_${randomId()}`,
  personId,
  personName: "Reader",
  jobTitle: null,
  isAdministrator: false,
  organisationId,
  organisationCode: "AUTH_TEST",
  organisationTimeZone: "Asia/Kuala_Lumpur",
  offices: [],
  permissions: new Set<PermissionKey>(),
  stepUpAt: null,
  sessionCreatedAt: new Date(),
  sourceAddress: "198.51.100.7",
  mustChangePassword: false,
  ...over,
});
const named = () => reader(who.named);
const entitled = () => reader(who.entitled, { permissions: new Set<PermissionKey>(["sulit.read.organisation"]) });
const neither = () => reader(who.neither);
const admin = () => reader(who.admin, { isAdministrator: true, permissions: new Set<PermissionKey>(["sulit.read.organisation"]) });
const loader = () => ({ ...reader(""), personId: "", system: { label: "demo loader" } });

async function sulitDocument(attachTo: "exercise" | "nothing") {
  const cls = await db.documentClass.create({ data: { organisationId, code: `SR_C_${randomId()}`, nameEn: "SULIT class", classification: "SULIT" } });
  const doc = await db.document.create({ data: { organisationId, title: `SULIT paper ${randomId()}`, documentClassId: cls.id, classificationSnapshot: "SULIT", retentionSnapshot: {} } });
  const bytes = new TextEncoder().encode(`secret ${randomId()}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.upsert({ where: { organisationId_sha256: { organisationId, sha256: sha } }, create: { organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes: Buffer.from(bytes) }, update: {} });
  const version = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "text/plain", originalFilename: "paper.txt", recordedByPersonId: who.named } });
  if (attachTo === "exercise") await db.documentAttachment.create({ data: { organisationId, purpose: "DOSSIER_EVIDENCE", versionId: version.id, exerciseId } });
  return { doc, version, bytes, sha };
}

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  for (const k of Object.keys(who) as (keyof typeof who)[]) who[k] = (await makePerson(organisationId, `Rollout ${k} ${randomId()}`)).id;
  requisitionId = (
    await db.requisition.create({
      data: {
        organisationId, reference: `SR/REQ/${randomId()}`, requestingUnitCode: "SR_DEPT", requestingPersonId: who.named, title: "Rollout requisition", justification: "Tests.", needStatement: "None.",
        costCentreCode: "SR_CC", accountCode: "SR_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
      },
    })
  ).id;
  reference = `SR/EX/${randomId()}`;
  exerciseId = (await db.sourcingExercise.create({ data: { organisationId, reference, requisitionId, title: "Rollout exercise", estimatedValue: "1000.00", sourcingMethodCode: "SR_METHOD" } })).id;
  await db.exerciseParticipant.create({ data: { exerciseId, personId: who.named } });
});

describe("the bytes of a SULIT document (OD-2)", () => {
  it("are opened by the person named on the exercise it hangs on and by the one the organisation has entitled, and logged for each", async () => {
    const { doc } = await sulitDocument("exercise");
    const a = await documentBytesAccess(db, named(), doc.id);
    expect(a).toMatchObject({ entitled: true, decision: { state: "GRANTED", basis: "NAMED_ON_RECORD" }, refusal: null });
    const b = await documentBytesAccess(db, entitled(), doc.id);
    expect(b).toMatchObject({ entitled: true, decision: { state: "GRANTED", basis: "ORGANISATION_PERMISSION" } });
    const events = await db.sulitAccessEvent.findMany({ where: { entityId: exerciseId, fields: { has: "documentBytes" } }, orderBy: { at: "asc" } });
    expect(events.filter((e) => e.actorPersonId === who.named).at(-1)).toMatchObject({ outcome: "GRANTED", basis: "NAMED_ON_RECORD", scope: "exercise", entity: "SourcingExercise", entityLabel: reference });
    expect(events.filter((e) => e.actorPersonId === who.entitled).at(-1)).toMatchObject({ outcome: "GRANTED", basis: "ORGANISATION_PERMISSION" });
  });
  it("are refused to a reader who is neither, with the reason in words, and the refusal is logged with who asked and from where", async () => {
    const { doc } = await sulitDocument("exercise");
    const r = await documentBytesAccess(db, neither(), doc.id);
    expect(r.entitled).toBe(false);
    expect(r.refusal).toMatch(/not named on this exercise/i);
    const e = await db.sulitAccessEvent.findFirstOrThrow({ where: { entityId: exerciseId, actorPersonId: who.neither, fields: { has: "documentBytes" } }, orderBy: { at: "desc" } });
    expect(e).toMatchObject({ outcome: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED", sourceAddress: "198.51.100.7" });
    expect(e.actorSessionId).toMatch(/^sess_/);
  });
  it("are refused to an administrator, even one who holds the permission and is named, and to a loader run", async () => {
    const { doc } = await sulitDocument("exercise");
    await db.exerciseParticipant.upsert({ where: { exerciseId_personId: { exerciseId, personId: who.admin } }, create: { exerciseId, personId: who.admin }, update: {} });
    expect((await documentBytesAccess(db, admin(), doc.id)).decision).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
    expect((await documentBytesAccess(db, loader(), doc.id, { logRead: false })).decision).toEqual({ state: "WITHHELD", basis: "NOT_A_PERSON" });
  });
  it("a document on no record is judged as one that keeps no list: the permission alone opens it", async () => {
    const { doc } = await sulitDocument("nothing");
    expect((await documentBytesAccess(db, named(), doc.id)).entitled).toBe(false);
    expect((await documentBytesAccess(db, entitled(), doc.id)).entitled).toBe(true);
  });
  it("showing a link reads nothing: logRead false writes no row", async () => {
    const { doc } = await sulitDocument("exercise");
    const before = await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.named } });
    await documentBytesAccess(db, named(), doc.id, { logRead: false });
    expect(await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.named } })).toBe(before);
  });
});

describe("a download (OD-2, NFR-AUD-004)", () => {
  it("that is refused answers 403, and writes a document access event naming who asked and a SULIT access event for the record", async () => {
    const { version } = await sulitDocument("exercise");
    const { GET } = await import("@/app/api/documents/versions/[id]/route");
    route = neither();
    const before = await db.documentAccessEvent.count({ where: { versionId: version.id } });
    const res = await GET(new Request("http://localhost/api/documents/versions/x", { headers: { "sec-fetch-site": "same-origin" } }) as never, { params: Promise.resolve({ id: version.id }) } as never);
    expect(res.status).toBe(403);
    expect(await res.text()).toMatch(/SULIT/);
    const events = await db.documentAccessEvent.findMany({ where: { versionId: version.id }, orderBy: { at: "asc" } });
    expect(events.length).toBe(before + 1);
    expect(events.at(-1)).toMatchObject({ kind: "REFUSED", reasonCode: "SULIT", actorPersonId: who.neither, sourceAddress: "198.51.100.7" });
    const sulitEvent = await db.sulitAccessEvent.findFirstOrThrow({ where: { actorPersonId: who.neither, fields: { has: "documentBytes" }, outcome: "WITHHELD" }, orderBy: { at: "desc" } });
    expect(sulitEvent.entityId).toBe(exerciseId);
  });
  it("logAccess records a person, or a loader by its label, and never both", async () => {
    const { version } = await sulitDocument("nothing");
    await logAccess({ organisationId, kind: "DOWNLOADED", versionId: version.id, actor: named() });
    await logAccess({ organisationId, kind: "VERIFIED", versionId: version.id, actor: loader() });
    await logAccess({ organisationId, kind: "REFUSED", reasonCode: "X", versionId: version.id });
    const rows = await db.documentAccessEvent.findMany({ where: { versionId: version.id }, orderBy: { at: "asc" } });
    expect(rows[0]).toMatchObject({ actorPersonId: who.named, actorSystemLabel: null });
    expect(rows[1]).toMatchObject({ actorPersonId: null, actorSystemLabel: "demo loader" });
    expect(rows[2]).toMatchObject({ actorPersonId: null, actorSystemLabel: null });
    await expect(db.documentAccessEvent.create({ data: { organisationId, kind: "DOWNLOADED", versionId: version.id, actorPersonId: who.named, actorSystemLabel: "x" } })).rejects.toThrow();
  });
});

describe("C-6 against per-person access: adding a version to a SULIT document", () => {
  it("by someone who may not open it reads as a document that is not there, whatever the file, and the log of the attempt survives", async () => {
    const { doc, bytes } = await sulitDocument("exercise");
    const org = await documentOrg(organisationId);
    const store = { transactional: true, put: async (tx: typeof db, o: string, sha256: string, b: Uint8Array) => { await tx.blobContent.upsert({ where: { organisationId_sha256: { organisationId: o, sha256 } }, create: { organisationId: o, sha256, byteSize: BigInt(b.length), bytes: Buffer.from(b) }, update: {} }); } } as never;
    const upload = (b: Uint8Array, as: SulitReader & StaffActor) =>
      storeUpload({ kind: "STAFF", personId: as.personId, sessionId: null, offices: [], sourceAddress: as.sourceAddress }, { org: org!, store, bytes: b, sha256: createHash("sha256").update(b).digest("hex"), mediaType: "text/plain", originalFilename: "x.txt", title: "", documentClassId: null, documentId: doc.id, recordedByPersonId: as.personId, reader: as, receivedOn: null, note: "" });
    const before = await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.neither } });
    const refusals = await Promise.all([upload(bytes, neither()), upload(new TextEncoder().encode("another"), neither())].map((p) => p.catch((e) => e)));
    for (const e of refusals) expect(e).toMatchObject({ status: 404, finding: { code: "DOCUMENT_UNKNOWN" } });
    expect(await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.neither } })).toBe(before + 2);
    // Someone who may open it is told the file is already there: the same file is a 409, a different one is a new version.
    await expect(upload(bytes, named())).rejects.toMatchObject({ status: 409, finding: { code: "IDENTICAL_TO_VERSION_N" } });
    const next = await upload(new TextEncoder().encode(`new ${randomId()}`), named());
    expect(next).toBeTruthy();
  });
});

describe("attaching a SULIT document to a record you are named on (OD-2, review of Phase 3b)", () => {
  it("is refused to someone who may not already open it, is allowed to one who may, and a document on no record is the uploader's alone to attach", async () => {
    const { doc } = await sulitDocument("exercise");
    expect(await sulitAttachRefused(db, neither(), doc.id)).toBe(true);
    expect(await sulitAttachRefused(db, named(), doc.id)).toBe(false);
    expect(await sulitAttachRefused(db, entitled(), doc.id)).toBe(false);
    // A fresh upload that hangs on no record is the uploader's to attach (the helper files it as the "named" person), and nobody else's: a version's id is listed to other officers.
    const fresh = await sulitDocument("nothing");
    expect(await sulitAttachRefused(db, named(), fresh.doc.id)).toBe(false);
    expect(await sulitAttachRefused(db, neither(), fresh.doc.id)).toBe(true);
    expect(await sulitAttachRefused(db, entitled(), fresh.doc.id)).toBe(false);
  });
  it("a document that is not SULIT is never refused by it", async () => {
    const { doc } = await sulitDocument("exercise");
    await db.document.update({ where: { id: doc.id }, data: { classificationSnapshot: "INTERNAL" } });
    expect(await sulitAttachRefused(db, neither(), doc.id)).toBe(false);
  });
  it("a detached attachment judges nothing: a grant by a record the document was taken off does not stand", async () => {
    const { doc, version } = await sulitDocument("nothing");
    // The exploit the refusal closes: the reader is named on another exercise, and the document is put on it.
    const other = await db.sourcingExercise.create({ data: { organisationId, reference: `SR/EX/${randomId()}`, requisitionId, title: "Another exercise", estimatedValue: "1000.00", sourcingMethodCode: "SR_METHOD" } });
    await db.exerciseParticipant.create({ data: { exerciseId: other.id, personId: who.neither } });
    const attachment = await db.documentAttachment.create({ data: { organisationId, purpose: "DOSSIER_EVIDENCE", versionId: version.id, exerciseId: other.id } });
    expect((await documentBytesAccess(db, neither(), doc.id, { logRead: false })).entitled).toBe(true);
    await db.documentAttachment.update({ where: { id: attachment.id }, data: { detachedAt: new Date(), detachReason: "Taken off again" } });
    expect((await documentBytesAccess(db, neither(), doc.id, { logRead: false })).entitled).toBe(false);
  });
});

describe("the write rule (a person who may not read what an act changes may not change it)", () => {
  it("is logged in the act's own transaction: a refusal the act returns is kept, and so is the allowed access of a reader who may", async () => {
    const before = await db.sulitAccessEvent.count({ where: { actorPersonId: who.neither, entityId: requisitionId } });
    const refusal = await db.$transaction((tx) => sulitWriteRefusal(tx, neither(), { scope: "requisition", entity: "Requisition", id: requisitionId, label: "SR req" }, ["estimatedValue"]));
    expect(refusal).toMatch(/not yet decided which roles/);
    expect(await db.sulitAccessEvent.count({ where: { actorPersonId: who.neither, entityId: requisitionId } })).toBe(before + 1);
    const ok = await db.$transaction((tx) => sulitWriteRefusal(tx, entitled(), { scope: "requisition", entity: "Requisition", id: requisitionId, label: "SR req" }, ["estimatedValue"]));
    expect(ok).toBeNull();
    expect(await db.sulitAccessEvent.findFirstOrThrow({ where: { actorPersonId: who.entitled, entityId: requisitionId }, orderBy: { at: "desc" } })).toMatchObject({ outcome: "GRANTED", scope: "requisition", entity: "Requisition" });
  });
  it("refuses an exercise's evaluation to someone not named on it, names it for one who is, and lets a loader through without a row", async () => {
    const asked = ["score", "scores"];
    expect(await db.$transaction((tx) => sulitWriteRefusal(tx, neither(), { scope: "evaluation", exerciseId }, asked))).toMatch(/not named on this exercise/i);
    expect(await db.$transaction((tx) => sulitWriteRefusal(tx, named(), { scope: "evaluation", exerciseId }, asked))).toBeNull();
    const rows = await db.sulitAccessEvent.count({ where: { actorSystemLabel: "demo loader", fields: { has: "score" } } });
    expect(await db.$transaction((tx) => sulitWriteRefusal(tx, loader(), { scope: "evaluation", exerciseId }, asked))).toBeNull();
    expect(await db.sulitAccessEvent.count({ where: { actorSystemLabel: "demo loader", fields: { has: "score" } } })).toBe(rows);
  });
});

describe("a record that keeps no list of who is named (requisition, contract, supplier)", () => {
  it("is opened by the permission alone, judged and logged for each record with the actor, and the named person is not enough", async () => {
    const subjects = [
      { scope: "requisition" as const, entity: "Requisition", id: `r_${randomId()}`, label: "SR req" },
      { scope: "contract" as const, entity: "Contract", id: `c_${randomId()}`, label: "SR contract" },
      { scope: "supplier" as const, entity: "Supplier", id: `s_${randomId()}`, label: "SR supplier" },
    ];
    const fieldsFor = { requisition: ["estimatedValue"], contract: ["estimateRate"], supplier: ["contactName"] } as const;
    for (const s of subjects) {
      const by = await sulitGates(named(), [s], fieldsFor[s.scope]);
      expect(by.get(s.id)).toMatchObject({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
      const yes = await sulitGates(entitled(), [s], fieldsFor[s.scope]);
      expect(yes.get(s.id)).toMatchObject({ state: "GRANTED", basis: "ORGANISATION_PERMISSION" });
      const logged = await db.sulitAccessEvent.findMany({ where: { entityId: s.id }, orderBy: { at: "asc" } });
      expect(logged.map((e) => [e.actorPersonId, e.outcome, e.scope, e.entity])).toEqual([[who.named, "WITHHELD", s.scope, s.entity], [who.entitled, "GRANTED", s.scope, s.entity]]);
      expect(logged[1].sourceAddress).toBe("198.51.100.7");
    }
  });
});

describe("a bill of quantities read for a reader it is withheld from", () => {
  it("carries no rate, no line amount and no total anywhere in what is returned; for a reader it is open to it carries them", async () => {
    const v = await db.bqVersion.create({ data: { organisationId, exerciseId, versionNo: 1, status: "DRAFT" } });
    const s = await db.bqSection.create({ data: { organisationId, versionId: v.id, number: "1", title: "Earthworks" } });
    await db.bqItem.create({ data: { organisationId, sectionId: s.id, itemRef: "1.1", description: "Excavate", unit: "m3", kind: "MEASURED", quantity: "100.000", rate: "123.45", amount: "12345.00" } });
    const open = await bqTab(organisationId, exerciseId, { state: "GRANTED", value: true, basis: "NAMED_ON_RECORD" });
    expect(JSON.stringify(open)).toContain("123.45");
    expect(JSON.stringify(open)).toContain("12,345.00");
    const shut = await bqTab(organisationId, exerciseId, sulitWithheld<true>("NOT_NAMED_PERMISSION_UNDECIDED", "exercise"));
    const json = JSON.stringify(shut);
    for (const leak of ["123.45", "12345", "12,345", "12345.00"]) expect(json, leak).not.toContain(leak);
    expect(json).toContain("Excavate");
    expect(shut!.actions.edit).toMatchObject({ allowed: false });
    expect(shut!.actions.finalise).toMatchObject({ allowed: false });
    expect(BQ_FIELDS).toEqual(["bqRate", "bqAmount", "bqTotals"]);
  });
});

describe("the sealed company estimate's columns are unreadable to the application's client (ADR 0012, F10)", () => {
  it("the figure and the amendment reason come back from no query the app makes, including a read through the estimate and an include", async () => {
    const est = await db.companyEstimate.create({ data: { organisationId, exerciseId, preparerPersonId: who.named, state: "LODGED", currentVersionNo: 1 } });
    await db.companyEstimateVersion.create({ data: { organisationId, estimateId: est.id, versionNo: 1, value: "987654.32", reason: "a reason", preparedOn: day("2026-10-01"), preparerPersonId: who.named }, select: { id: true } });
    const direct = await db.companyEstimateVersion.findFirstOrThrow({ where: { estimateId: est.id } });
    expect(Object.keys(direct)).not.toContain("value");
    expect(Object.keys(direct)).not.toContain("reason");
    const through = await db.companyEstimate.findUniqueOrThrow({ where: { id: est.id }, include: { versions: true } });
    expect(JSON.stringify(through)).not.toContain("987654");
    expect(JSON.stringify(through)).not.toContain("a reason");
    expect(JSON.stringify(await db.companyEstimateVersion.findMany({ where: { estimateId: est.id } }))).not.toContain("987654");
  });
});
