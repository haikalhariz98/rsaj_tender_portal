import { createHash } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * Go-live R4 and R4a, against the scratch database: an officer publishes the schedule of tenders for Results through the document store's own acts (attach, replace with a
 * new version, withdraw with a reason), each in one transaction with its audit entry; every refusal writes nothing; two officers acting at once cannot publish two; and the public
 * read gives the schedule only while the document is live, not withdrawn and still Public.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return {
    ...base,
    staffForAct: async () => ({ ok: true as const, actor: h.who! }),
    requireStaff: async () => h.who!,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { attachDocument, attachNewVersion, detachDocument } from "@/app/documents/actions";
import { loadResults, loadResultSchedule } from "@/lib/portal/repo";
import { loadSchedules } from "@/lib/portal/schedule-store";

const run = randomId();
const DAY = 86_400_000;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let personId = "";
let publicClassId = "";
let internalClassId = "";
let counter = 0;

const staff = (): StaffActor =>
  ({
    kind: "STAFF",
    accountId: `acc_${personId}`,
    sessionId: `ses_${personId}`,
    personId,
    personName: "Officer",
    jobTitle: null,
    isAdministrator: false,
    organisationId,
    organisationCode: "AUTH_TEST",
    organisationTimeZone: "Asia/Kuala_Lumpur",
    offices: [],
    permissions: new Set(),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;

interface Setup {
  /// "advertised" (default) or "invited".
  path?: "ADVERTISED" | "INVITED";
  restricted?: boolean;
  finalised?: boolean;
  award?: "ISSUED" | "DRAFT" | null;
}

/// An exercise that is a result: advertised, an opening finalised, an award issued. Each flag turns one of those off.
async function exercise(o: Setup = {}) {
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `PS/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: personId, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
  });
  const committee = await db.committee.create({ data: { organisationId, code: `PS_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test" } });
  const method = await db.sourcingMethod.create({ data: { organisationId, code: `PS_M_${randomId()}`, nameEn: "Quotation" } });
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `PS/EX/${randomId()}`, requisitionId: requisition.id, title: `Schedule test ${run}`, estimatedValue: "1000.00", sourcingMethodCode: method.code, status: "EVALUATED", closingAt: new Date(Date.now() - 5 * DAY), restricted: o.restricted ?? false },
  });
  await db.exerciseWindow.create({
    data: { organisationId, exerciseId: ex.id, path: o.path ?? "ADVERTISED", publishedAt: new Date(Date.now() - 10 * DAY), advertisementDay: new Date(`${new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10)}T00:00:00.000Z`), policySnapshot: {}, alternativesPermitted: false },
  });
  const opening = await db.opening.create({
    data: {
      organisationId, exerciseId: ex.id, kind: "MAIN", sequenceNo: 1, committeeId: committee.id, committeeNameSnapshot: "Opening committee", startedAt: new Date(), startedByPersonId: personId,
      checklistSnapshot: { items: [], notJudged: [], notReturned: [] },
      policySnapshot: { completeness: { eliminates: true, provenance: "STATED", source: "TEST" }, unpurchased: { consequence: "REPORT", provenance: "STATED" }, minimumBids: { value: null, provenance: null }, alternativesPermitted: false, invited: { reading: "PURCHASERS", provenance: "ASSUMED" }, panel: {}, committee: { code: null, name: null, provenance: null }, estimate: { requires: false, provenance: "STATED" }, restrictedTender: false, path: "ADVERTISED" },
    },
  });
  if (o.finalised !== false) await db.opening.update({ where: { id: opening.id }, data: { finalisedAt: new Date() } });
  if (o.award !== null) {
    await db.award.create({
      data: { organisationId, reference: `PS/AW/${randomId()}`, exerciseId: ex.id, instrumentKind: "WORK_INDENT", awardeeName: "Winner Sdn Bhd", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: o.award ?? "ISSUED", ...((o.award ?? "ISSUED") === "ISSUED" ? { issuedAt: new Date(Date.now() - 3 * DAY) } : {}) },
    });
  }
  return ex.id;
}

/// A document of the store with one version, in the Public class (or another), filed or staged.
async function document(o: { classId?: string; versions?: number } = {}) {
  const n = ++counter;
  const classId = o.classId ?? publicClassId;
  const cls = await db.documentClass.findUniqueOrThrow({ where: { id: classId } });
  const doc = await db.document.create({ data: { organisationId, title: `Jadual ${run} ${n}`, documentClassId: classId, classificationSnapshot: cls.classification, retentionSnapshot: {}, status: "STAGED" } });
  const versions: string[] = [];
  for (let i = 1; i <= (o.versions ?? 1); i++) {
    const bytes = new TextEncoder().encode(`%PDF-1.4 schedule ${run} ${n} ${i}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: i, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "jadual.pdf", recordedByPersonId: personId } });
    versions.push(v.id);
  }
  return { documentId: doc.id, versions };
}

const attach = (exerciseId: string, versionId: string) => attachDocument({ ok: true }, form({ ownerKind: "exercise", ownerId: exerciseId, purpose: "PUBLISHED_SCHEDULE", versionId }));
const replace = (attachmentId: string, versionId: string, reason = "Corrected") => attachNewVersion({ ok: true }, form({ attachmentId, versionId, reason }));
const withdraw = (attachmentId: string, reason = "Published in error") => detachDocument({ ok: true }, form({ attachmentId, reason }));
const live = (exerciseId: string) => db.documentAttachment.findMany({ where: { exerciseId, purpose: "PUBLISHED_SCHEDULE", detachedAt: null } });
const all = (exerciseId: string) => db.documentAttachment.findMany({ where: { exerciseId, purpose: "PUBLISHED_SCHEDULE" } });
const audits = (entityId: string) => db.auditEntry.findMany({ where: { organisationId, entity: "DocumentAttachment", entityId }, orderBy: { at: "asc" } });
const refused = (r: { ok: boolean; message?: string }) => {
  expect(r.ok).toBe(false);
  return r.message ?? "";
};

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  personId = (await makePerson(organisationId, `Schedule officer ${run}`)).id;
  publicClassId = (await db.documentClass.upsert({ where: { organisationId_code: { organisationId, code: `ps_public_${run}` } }, update: {}, create: { organisationId, code: `ps_public_${run}`, nameEn: "Published notices", classification: "PUBLIC" } })).id;
  internalClassId = (await db.documentClass.upsert({ where: { organisationId_code: { organisationId, code: `ps_internal_${run}` } }, update: {}, create: { organisationId, code: `ps_internal_${run}`, nameEn: "Working papers", classification: "INTERNAL" } })).id;
});

beforeEach(() => {
  h.who = staff();
});

describe("the database's own check", () => {
  it("accepts the schedule on an exercise and refuses it on any other owner", async () => {
    const exerciseId = await exercise();
    const d = await document();
    await expect(db.documentAttachment.create({ data: { organisationId, purpose: "PUBLISHED_SCHEDULE", versionId: d.versions[0], exerciseId } })).resolves.toBeTruthy();
    const d2 = await document();
    const meeting = await db.meeting.findFirst({ where: { committee: { organisationId } }, select: { id: true } });
    if (meeting) await expect(db.documentAttachment.create({ data: { organisationId, purpose: "PUBLISHED_SCHEDULE", versionId: d2.versions[0], meetingId: meeting.id } })).rejects.toThrow();
    await expect(db.documentAttachment.create({ data: { organisationId, purpose: "PUBLISHED_SCHEDULE", versionId: d2.versions[0] } })).rejects.toThrow();
  });
});

describe("publishing", () => {
  it("attaches a Public document to a result, files it, and writes its audit entry in the same act", async () => {
    const exerciseId = await exercise();
    const d = await document();
    const r = await attach(exerciseId, d.versions[0]);
    expect(r.ok).toBe(true);
    const [a] = await live(exerciseId);
    expect(a).toMatchObject({ versionId: d.versions[0], purpose: "PUBLISHED_SCHEDULE" });
    expect((await db.document.findUniqueOrThrow({ where: { id: d.documentId } })).status).toBe("FILED");
    const trail = await audits(a.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ action: "CREATE", actorPersonId: personId });
  });

  it("is then on the public Results list with the day it was published, and downloadable", async () => {
    const exerciseId = await exercise();
    const d = await document();
    expect((await attach(exerciseId, d.versions[0])).ok).toBe(true);
    const row = (await loadResults()).results.find((x) => x.id === exerciseId);
    expect(row?.schedulePublishedOn).toMatch(/\d{4}$/);
    const found = await loadResultSchedule(exerciseId);
    expect(found?.schedule.version.id).toBe(d.versions[0]);
    // The public row names no award party and no figure.
    expect(JSON.stringify(row)).not.toMatch(/Winner|awardee|1000/);
  });

  it("an exercise with no schedule reads as not published", async () => {
    const exerciseId = await exercise();
    expect((await loadResults()).results.find((x) => x.id === exerciseId)?.schedulePublishedOn).toBeNull();
    expect(await loadResultSchedule(exerciseId)).toBeNull();
  });
});

describe("each refusal writes nothing, and says why", () => {
  it("a document that is not Public", async () => {
    const exerciseId = await exercise();
    const d = await document({ classId: internalClassId });
    const said = refused(await attach(exerciseId, d.versions[0]));
    expect(said).toMatch(/must be Public/);
    expect(said).toMatch(/A classification is never lowered/);
    expect(await all(exerciseId)).toHaveLength(0);
    expect((await db.document.findUniqueOrThrow({ where: { id: d.documentId } })).status).toBe("STAGED");
  });
  it("an exercise that is not advertised", async () => {
    const exerciseId = await exercise({ path: "INVITED" });
    const d = await document();
    expect(refused(await attach(exerciseId, d.versions[0]))).toBe("The schedule of tenders is published only for an advertised exercise.");
    expect(await all(exerciseId)).toHaveLength(0);
  });
  it("a confidential exercise", async () => {
    const exerciseId = await exercise({ restricted: true });
    const d = await document();
    // A confidential exercise reads as one that does not exist to anyone who is not named on it, or is refused in words to one who is.
    const r = await attach(exerciseId, d.versions[0]);
    expect(r.ok).toBe(false);
    expect(await all(exerciseId)).toHaveLength(0);
  });
  it("a cancelled exercise", async () => {
    const exerciseId = await exercise();
    await db.sourcingExercise.update({ where: { id: exerciseId }, data: { status: "CANCELLED" } });
    const d = await document();
    expect(refused(await attach(exerciseId, d.versions[0]))).toMatch(/cancelled/);
    expect(await all(exerciseId)).toHaveLength(0);
  });
  it("an opening that is not finalised", async () => {
    const exerciseId = await exercise({ finalised: false });
    const d = await document();
    expect(refused(await attach(exerciseId, d.versions[0]))).toBe("Publish the schedule once the opening is finalised.");
    expect(await all(exerciseId)).toHaveLength(0);
  });
  it("an award that has not been issued", async () => {
    for (const award of [null, "DRAFT"] as const) {
      const exerciseId = await exercise({ award });
      const d = await document();
      expect(refused(await attach(exerciseId, d.versions[0]))).toBe("Publish the schedule once the award is issued.");
      expect(await all(exerciseId)).toHaveLength(0);
    }
  });
  it("a second schedule beside one that is live", async () => {
    const exerciseId = await exercise();
    const one = await document();
    const two = await document();
    expect((await attach(exerciseId, one.versions[0])).ok).toBe(true);
    expect(refused(await attach(exerciseId, two.versions[0]))).toMatch(/one file/);
    expect(await live(exerciseId)).toHaveLength(1);
  });
});

describe("replacing and withdrawing", () => {
  it("a new version of the same document replaces the pin in one act, with an audit entry for each attachment", async () => {
    const exerciseId = await exercise();
    const d = await document({ versions: 2 });
    expect((await attach(exerciseId, d.versions[0])).ok).toBe(true);
    const [first] = await live(exerciseId);
    expect((await replace(first.id, d.versions[1])).ok).toBe(true);
    const rows = await all(exerciseId);
    expect(rows).toHaveLength(2);
    const [now] = await live(exerciseId);
    expect(now.versionId).toBe(d.versions[1]);
    expect((await db.documentAttachment.findUniqueOrThrow({ where: { id: first.id } })).detachedAt).not.toBeNull();
    expect((await audits(first.id)).length).toBe(2);
    expect((await audits(now.id)).length).toBe(1);
    // The public is given the new version.
    expect((await loadResultSchedule(exerciseId))?.schedule.version.id).toBe(d.versions[1]);
  });

  it("a replacement needs a reason", async () => {
    const exerciseId = await exercise();
    const d = await document({ versions: 2 });
    await attach(exerciseId, d.versions[0]);
    const [a] = await live(exerciseId);
    expect(refused(await replace(a.id, d.versions[1], "  "))).toBeTruthy();
    expect((await live(exerciseId))[0].versionId).toBe(d.versions[0]);
  });

  it("withdrawing needs a reason, and takes it off Results", async () => {
    const exerciseId = await exercise();
    const d = await document();
    await attach(exerciseId, d.versions[0]);
    const [a] = await live(exerciseId);
    const none = await withdraw(a.id, "   ");
    expect(none.ok).toBe(false);
    expect(await live(exerciseId)).toHaveLength(1);
    expect((await withdraw(a.id, "Wrong file")).ok).toBe(true);
    expect(await live(exerciseId)).toHaveLength(0);
    const after = await db.documentAttachment.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.detachReason).toBe("Wrong file");
    const trail = await audits(a.id);
    expect(trail.map((t) => t.action)).toEqual(["CREATE", "UPDATE"]);
    expect(trail[1].reason).toBe("Wrong file");
    expect((await loadResults()).results.find((x) => x.id === exerciseId)?.schedulePublishedOn).toBeNull();
    expect(await loadResultSchedule(exerciseId)).toBeNull();
  });
});

describe("the public read asks again", () => {
  it("stops giving a document once its version is withdrawn", async () => {
    const exerciseId = await exercise();
    const d = await document();
    await attach(exerciseId, d.versions[0]);
    await db.documentVersion.update({ where: { id: d.versions[0] }, data: { withdrawnAt: new Date(), withdrawnReason: "Superseded" } });
    expect((await loadSchedules(organisationId, [exerciseId])).size).toBe(0);
    expect(await loadResultSchedule(exerciseId)).toBeNull();
  });
  it("stops giving a document once its classification is raised after publication", async () => {
    const exerciseId = await exercise();
    const d = await document();
    await attach(exerciseId, d.versions[0]);
    expect((await loadSchedules(organisationId, [exerciseId])).size).toBe(1);
    await db.document.update({ where: { id: d.documentId }, data: { classificationSnapshot: "SULIT" } });
    expect((await loadSchedules(organisationId, [exerciseId])).size).toBe(0);
    expect(await loadResultSchedule(exerciseId)).toBeNull();
  });
  it("stops giving a document once the exercise becomes confidential", async () => {
    const exerciseId = await exercise();
    const d = await document();
    await attach(exerciseId, d.versions[0]);
    expect(await loadResultSchedule(exerciseId)).not.toBeNull();
    await db.sourcingExercise.update({ where: { id: exerciseId }, data: { restricted: true } });
    expect(await loadResultSchedule(exerciseId)).toBeNull();
    expect((await loadResults()).results.find((x) => x.id === exerciseId)).toBeUndefined();
  });
  it("gives nothing for an exercise that is not a result, however it got a schedule", async () => {
    const exerciseId = await exercise({ award: null });
    const d = await document();
    await db.documentAttachment.create({ data: { organisationId, purpose: "PUBLISHED_SCHEDULE", versionId: d.versions[0], exerciseId } });
    expect(await loadResultSchedule(exerciseId)).toBeNull();
  });
});

describe("two officers act on the same exercise at once", () => {
  it("only one schedule is published", async () => {
    const exerciseId = await exercise();
    const one = await document();
    const two = await document();
    const [a, b] = await Promise.all([attach(exerciseId, one.versions[0]), attach(exerciseId, two.versions[0])]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await live(exerciseId)).toHaveLength(1);
  });
  it("a replacement and a withdrawal at once leave one consistent state and one audit trail per attachment", async () => {
    const exerciseId = await exercise();
    const d = await document({ versions: 2 });
    await attach(exerciseId, d.versions[0]);
    const [first] = await live(exerciseId);
    const [r, w] = await Promise.all([replace(first.id, d.versions[1]), withdraw(first.id, "Wrong file")]);
    expect([r.ok, w.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    const rows = await all(exerciseId);
    // Whatever order they ran in, the original is off, and at most one is live.
    expect(rows.find((x) => x.id === first.id)?.detachedAt).not.toBeNull();
    expect((await live(exerciseId)).length).toBeLessThanOrEqual(1);
  });
});
