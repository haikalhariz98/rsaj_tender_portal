import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { dayOf, dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { makePerson, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";

/**
 * Ruling PW-52 (code review CONSIDER 3): the kick-off meeting's held record and a Project document's creation, run with the REAL act module (`@/app/_auth/act`:
 * `beginAct`, then `attributeAct` writing `ActAttribution`), never the recording stand-in the other workspace and kick-off suites use. Only who is signed in is
 * stood in for (sign-in is not under test). Each act commits, and the person is the same on the meeting's "Recorded by", the minutes' "Raised by" and their
 * version's "Sent by": the attribution adds no UPDATE of the meeting after it is set held (trigger PA045) and opens no savepoint (the minutes' `xmin`).
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { createProjectDocument } from "@/app/projects/[id]/document-actions";
import { recordKickOffHeld, scheduleKickOff } from "@/app/projects/[id]/kick-off-actions";

const run = randomId();
const TZ = "Asia/Kuala_Lumpur";
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date | string) => new Date(`${typeof d === "string" ? d : d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const TODAY = dayOf(new Date(), TZ)!;
const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

let organisationId = "";
let soRole = "";
let projectClassId = "";
let so = "";
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
    organisationCode: `KRA_${run}`,
    organisationTimeZone: TZ,
    offices: [],
    permissions: new Set(),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;

async function contract() {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `KRA/RQ/${r}`, requestingUnitCode: "KRA_DEPT", requestingPersonId: so, title: "Real act requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "KRA_CC", accountCode: "KRA_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `KRA/EX/${r}`, requisitionId: requisition.id, title: `Bridge ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "KRA_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `KRA/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId: null } });
  const c = await db.contract.create({ data: { organisationId, number: `KRA/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status: "EXECUTED" } });
  await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  return c.id;
}

async function stage(person: string) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 real act ${run} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = `minutes-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "project-document" } });
  return (await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: person, storedAt: new Date() } })).id;
}

const attributed = (entity: string, entityId: string, slot: string) => db.actAttribution.findMany({ where: { entity, entityId, slot }, select: { subjectPersonId: true, mode: true } });

beforeAll(async () => {
  organisationId = (await db.organisation.create({ data: { code: `KRA_${run}`, name: `Jabatan Sebenar ${run}`, timeZone: TZ } })).id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  so = (await makePerson(organisationId, `Real act S.O. ${run}`)).id;
  soRole = `KRA_SO_${run}`;
  await db.roleAssignment.create({ data: { personId: so, roleCode: soRole, effectiveFrom: D("2020-01-01") } });
  projectClassId = (await db.documentClass.create({ data: { organisationId, code: "kra_project", nameEn: "Project files", classification: "INTERNAL" } })).id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
  h.who = staff(so);
});

describe("PW-52: the kick-off held record and a document's creation, with the real act module", () => {
  it("recordKickOffHeld commits, and the same person is the meeting's Recorded by, the minutes' Raised by and their version's Sent by, on the rows and in the attributions", async () => {
    const contractId = await contract();
    expect(await scheduleKickOff({ ok: false }, form({ contractId, meetsOn: dayPlus(TODAY, -1), meetsTime: "09:30", place: "Site office", onlineLink: "", agenda: "Introductions." }))).toMatchObject({ ok: true });
    const held = await recordKickOffHeld({ ok: false }, form({ contractId, heldOn: dayPlus(TODAY, -1), attendeePersonId: [so], attendeeAccountId: [], otherName: ["Consultant's engineer"], stagedVersionId: [await stage(so)] }));
    expect(held, JSON.stringify(held)).toMatchObject({ ok: true });

    const meeting = await db.kickOffMeeting.findUniqueOrThrow({ where: { contractId } });
    expect(meeting.heldRecordedByPersonId).toBe(so);
    const minutes = await db.projectDocument.findUniqueOrThrow({ where: { id: meeting.minutesDocumentId! }, include: { versions: true } });
    expect(minutes.createdByPersonId).toBe(so);
    expect(minutes.versions.map((v) => v.uploadedByPersonId)).toEqual([so]);

    // The real attributions, one each, all the same person, the officer's own act.
    expect(await attributed("KickOffMeeting", meeting.id, "heldRecordedBy")).toEqual([{ subjectPersonId: so, mode: expect.any(String) }]);
    expect(await attributed("ProjectDocument", minutes.id, "createdByPerson")).toEqual([{ subjectPersonId: so, mode: expect.any(String) }]);
    expect(await attributed("ProjectDocumentVersion", minutes.versions[0]!.id, "uploadedByPerson")).toEqual([{ subjectPersonId: so, mode: expect.any(String) }]);
    // Never the meeting's slot against the document.
    expect(await db.actAttribution.count({ where: { entity: "ProjectDocument", entityId: minutes.id, slot: "heldRecordedBy" } })).toBe(0);
  });

  it("createProjectDocument commits with its real attributions: Raised by on the document, Sent by on its version, the same person", async () => {
    const contractId = await contract();
    const made = await createProjectDocument({ ok: false }, form({ contractId, title: "Drainage layout", note: "", mode: "upload", firstNote: "", stagedVersionId: [await stage(so)] }));
    expect(made, JSON.stringify(made)).toMatchObject({ ok: true });
    const doc = await db.projectDocument.findFirstOrThrow({ where: { contractId, title: "Drainage layout" }, include: { versions: true } });
    expect(doc.createdByPersonId).toBe(so);
    expect(doc.versions.map((v) => v.uploadedByPersonId)).toEqual([so]);
    expect((await attributed("ProjectDocument", doc.id, "createdByPerson")).map((a) => a.subjectPersonId)).toEqual([so]);
    expect((await attributed("ProjectDocumentVersion", doc.versions[0]!.id, "uploadedByPerson")).map((a) => a.subjectPersonId)).toEqual([so]);
  });
});
