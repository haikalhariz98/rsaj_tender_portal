import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { approvalRouteNotHidden, decisionFor, exerciseAccessFacts, hiddenExerciseIds, namingOthersRefusal, namingRefusal, refuseHiddenExercise, type Reader } from "@/lib/auth/sulit-store";
import { hiddenDecisionIds } from "@/lib/committee/hidden";
import { exerciseOfOwner } from "@/lib/documents/hidden";
import { attachTargetsOf } from "@/lib/documents/read";
import { documentOrg, storeUpload } from "@/lib/documents/service";
import { OWNER_KINDS } from "@/lib/documents/types";
import { withLockedRequisitionForSourcing } from "@/lib/method/repo";
import { estimateAccessFor, loggedEstimateAccess } from "@/lib/scope/estimate-access";
import { loadWaiting } from "@/lib/committee/waiting-load";
import { libraryCount, libraryPage } from "@/lib/certificate/register";
import { loadDashboard } from "@/lib/dashboard";
import { dependencyIsHidden, exerciseByTabledReference } from "@/lib/committee/tabled-exercise";
import { makePerson, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * The restricted exercise and the company estimate's custody, against the scratch database (FR-MTD-007, FR-EST-008; ADR 0034 D14; Phase 3a): a write
 * is refused for someone not named on the exercise and the refusal is logged; the queues and matters of a hidden exercise are left out; the disclosed
 * estimate is read by its preparer and the offices that hold its copies and audit it, for the unit that asked for it, and by nobody before disclosure.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId = "";
let requisitionId = "";
let exerciseId = "";
let openExerciseId = "";
const who = { named: "", outsider: "", admin: "", custodian: "", otherDeptHolder: "", auditor: "", preparer: "" };
const reader = (personId: string, over: Partial<Reader & { organisationTimeZone: string | null }> = {}): Reader & { organisationTimeZone: string | null } => ({
  organisationId,
  organisationCode: "AUTH_TEST",
  personId,
  isAdministrator: false,
  sessionId: `sess_${randomId()}`,
  sourceAddress: "198.51.100.9",
  organisationTimeZone: "Asia/Kuala_Lumpur",
  ...over,
});
const CUSTODIAN = `ROLE_CUST_${randomId()}`;
const AUDIT = `ROLE_AUD_${randomId()}`;
const DEPT = `DEPT_${randomId()}`;
const OTHER_DEPT = `DEPT_${randomId()}`;
let estimateId = "";

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  for (const k of Object.keys(who) as (keyof typeof who)[]) who[k] = (await makePerson(organisationId, `Restricted ${k} ${randomId()}`)).id;
  requisitionId = (
    await db.requisition.create({
      data: {
        organisationId, reference: `RX/REQ/${randomId()}`, requestingUnitCode: DEPT, requestingPersonId: who.named, title: "Restricted test requisition", justification: "Tests.", needStatement: "None.",
        costCentreCode: "RX_CC", accountCode: "RX_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
      },
    })
  ).id;
  const make = (restricted: boolean) => db.sourcingExercise.create({ data: { organisationId, reference: `RX/EX/${randomId()}`, requisitionId, title: "Restricted test exercise", estimatedValue: "1000.00", sourcingMethodCode: "RX_METHOD", restricted } });
  exerciseId = (await make(true)).id;
  openExerciseId = (await make(false)).id;
  await db.exerciseParticipant.create({ data: { exerciseId, personId: who.named } });
  // The unit and a sibling, so that "held for a department" has somewhere to be.
  for (const code of [DEPT, OTHER_DEPT]) await db.orgUnit.create({ data: { organisationId, code, nameEn: code, kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") } });
  await db.scopePolicy.upsert({ where: { organisationId }, create: { organisationId }, update: { estimateCustodianRoleCode: null, estimateAuditRoleCode: null } });
  const est = await db.companyEstimate.create({ data: { organisationId, exerciseId, preparerPersonId: who.preparer, state: "LODGED", currentVersionNo: 1 } });
  estimateId = est.id;
});

describe("a write on a restricted exercise (FR-MTD-007)", () => {
  it("runs for a person named on it, and logs the access (FR-MTD-007: every access, allowed or refused)", async () => {
    const out = await withLockedRequisitionForSourcing(reader(who.named), requisitionId, exerciseId, async (_tx, l) => l.ex?.id ?? null);
    expect(out).toBe(exerciseId);
    const e = await db.sulitAccessEvent.findFirstOrThrow({ where: { entityId: exerciseId, actorPersonId: who.named }, orderBy: { at: "desc" } });
    expect(e).toMatchObject({ outcome: "GRANTED", basis: "NAMED_ON_RECORD", fields: ["record"], scope: "exercise" });
  });
  it("writes nothing for an exercise that is not restricted: it is no SULIT record", async () => {
    const before = await db.sulitAccessEvent.count({ where: { entityId: openExerciseId } });
    await withLockedRequisitionForSourcing(reader(who.named), requisitionId, openExerciseId, async (_tx, l) => l.ex?.id ?? null);
    expect(await db.sulitAccessEvent.count({ where: { entityId: openExerciseId } })).toBe(before);
  });
  it("answers 'gone' for a person who is not named, runs nothing, and logs the refusal against the exercise", async () => {
    let ran = false;
    const out = await withLockedRequisitionForSourcing(reader(who.outsider), requisitionId, exerciseId, async () => {
      ran = true;
      return "ran";
    });
    expect(out).toBeNull();
    expect(ran).toBe(false);
    const e = await db.sulitAccessEvent.findFirstOrThrow({ where: { entityId: exerciseId, actorPersonId: who.outsider }, orderBy: { at: "desc" } });
    expect(e).toMatchObject({ outcome: "WITHHELD", basis: "RESTRICTED_NOT_NAMED", fields: ["record"], scope: "exercise" });
  });
  it("answers 'gone' for an administrator account, even one named on it, and logs it as an administrator", async () => {
    await db.exerciseParticipant.create({ data: { exerciseId, personId: who.admin } });
    const out = await withLockedRequisitionForSourcing(reader(who.admin, { isAdministrator: true }), requisitionId, exerciseId, async () => "ran");
    expect(out).toBeNull();
    const e = await db.sulitAccessEvent.findFirstOrThrow({ where: { entityId: exerciseId, actorPersonId: who.admin }, orderBy: { at: "desc" } });
    expect(e.basis).toBe("ADMINISTRATOR");
  });
  it("is not refused for an unrestricted exercise, whoever asks", async () => {
    expect(await withLockedRequisitionForSourcing(reader(who.outsider), requisitionId, openExerciseId, async (_tx, l) => l.ex?.id ?? null)).toBe(openExerciseId);
  });
  it("is not refused for a loader run, and writes no refusal", async () => {
    const before = await db.sulitAccessEvent.count({ where: { entityId: exerciseId } });
    const out = await withLockedRequisitionForSourcing(reader("", { system: { label: "demo loader" } }), requisitionId, exerciseId, async (_tx, l) => l.ex?.id ?? null);
    expect(out).toBe(exerciseId);
    expect(await db.sulitAccessEvent.count({ where: { entityId: exerciseId } })).toBe(before);
  });
  it("refuseHiddenExercise says false for an exercise that does not exist, and writes nothing", async () => {
    expect(await refuseHiddenExercise(db, reader(who.outsider), "no_such_exercise")).toBe(false);
  });
});

describe("the queues and matters of a hidden exercise are left out", () => {
  let routeOnHidden = "";
  let routeOnRequisition = "";
  let decisionOnHidden = "";
  let decisionOnOpen = "";
  beforeAll(async () => {
    routeOnHidden = (await db.approvalInstance.create({ data: { organisationId, matterKind: "EXERCISE", domain: "name_approval", exerciseId, openedAt: new Date("2026-10-03T02:00:00Z") } })).id;
    routeOnRequisition = (await db.approvalInstance.create({ data: { organisationId, matterKind: "REQUISITION", domain: "requisition", requisitionId, openedAt: new Date("2026-10-03T02:00:00Z") } })).id;
    const committee = await db.committee.create({ data: { organisationId, code: `RX_${randomId()}`, nameEn: "Restricted test committee", mandate: "Tests.", governingSource: "None." } });
    const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: `RX/MT/${randomId()}`, meetingDate: day("2026-10-05") } });
    decisionOnHidden = (await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "name_approval", subject: "Restricted matter", exerciseId } })).id;
    decisionOnOpen = (await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "name_approval", subject: "Open matter", exerciseId: openExerciseId } })).id;
  });

  it("an approval route on a hidden exercise is not in a queue that leaves it out, and one on a requisition is (a NOT of a NULL would drop it)", async () => {
    const hidden = await hiddenExerciseIds(db, { ...reader(who.outsider) });
    expect(hidden).toContain(exerciseId);
    const rows = await db.approvalInstance.findMany({ where: { organisationId, id: { in: [routeOnHidden, routeOnRequisition] }, ...approvalRouteNotHidden(hidden) }, select: { id: true } });
    expect(rows.map((r) => r.id)).toEqual([routeOnRequisition]);
  });
  it("with nothing hidden the queue is whole", async () => {
    const rows = await db.approvalInstance.findMany({ where: { organisationId, id: { in: [routeOnHidden, routeOnRequisition] }, ...approvalRouteNotHidden([]) }, select: { id: true } });
    expect(rows.map((r) => r.id).sort()).toEqual([routeOnHidden, routeOnRequisition].sort());
  });
  it("the waiting-to-be-tabled list leaves a hidden exercise's route out", async () => {
    const hidden = await hiddenExerciseIds(db, reader(who.outsider));
    const waiting = await loadWaiting(organisationId, hidden);
    expect(waiting?.entries.every((e) => e.href !== `/sourcing/${exerciseId}`)).toBe(true);
  });
  it("a tabled matter is a hidden exercise's however it names it; an open exercise's is not", async () => {
    const hidden = await hiddenExerciseIds(db, reader(who.outsider));
    const found = await hiddenDecisionIds([decisionOnHidden, decisionOnOpen], hidden);
    expect([...found]).toEqual([decisionOnHidden]);
    expect((await hiddenDecisionIds([decisionOnHidden], [])).size).toBe(0);
  });
  it("the dashboard leaves out a scope matter of a hidden exercise: it names its exercise only through its bill of quantities version (FR-MTD-007)", async () => {
    const ref = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { reference: true } })).reference;
    const bq = await db.bqVersion.create({ data: { organisationId, exerciseId, versionNo: 1 } });
    const meeting = await db.meeting.findFirstOrThrow({ where: { committee: { organisationId }, decisions: { some: { id: decisionOnHidden } } }, select: { id: true } });
    const scopeMatter = (await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "scope", subject: `Scope of ${ref}`, matterRef: ref, bqVersionId: bq.id, amount: "5000.00" } })).id;
    await db.auditEntry.create({ data: { organisationId, entity: "CommitteeDecision", entityId: scopeMatter, entityLabel: `Scope of ${ref}`, action: "CREATE", changes: [{ field: "subject", before: null, after: `Scope of ${ref}` }] } });

    const outsider = await loadDashboard(organisationId, await hiddenExerciseIds(db, reader(who.outsider)));
    expect(outsider!.queue.some((q) => q.decisionId === scopeMatter)).toBe(false);
    expect(outsider!.queue.some((q) => q.decisionId === decisionOnHidden)).toBe(false);
    expect(outsider!.queue.some((q) => q.decisionId === decisionOnOpen)).toBe(true);
    expect(JSON.stringify(outsider!.activity)).not.toContain(ref);

    const named = await loadDashboard(organisationId, await hiddenExerciseIds(db, reader(who.named)));
    expect(named!.queue.some((q) => q.decisionId === scopeMatter)).toBe(true);
    expect(JSON.stringify(named!.activity)).toContain(ref);

    // Carried, its amount is committed for the reader who may see it and not for the one who may not.
    await db.committeeDecision.update({ where: { id: scopeMatter }, data: { outcome: "CARRIED", domain: "appointment" } });
    // The scratch organisation keeps the matters of earlier runs, hidden from this reader too: only this exercise is let back in.
    const hiddenFromOutsider = await hiddenExerciseIds(db, reader(who.outsider));
    const [a, b] = await Promise.all([loadDashboard(organisationId, hiddenFromOutsider), loadDashboard(organisationId, hiddenFromOutsider.filter((id) => id !== exerciseId))]);
    expect(b!.committedSen - a!.committedSen).toBe(500000n);
  });
  it("tabling by a typed reference finds a hidden exercise as it finds none, for a live one, a cancelled one and an unknown one alike, and logs the attempt (FR-MTD-007)", async () => {
    const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { reference: true } });
    const cancelled = await db.sourcingExercise.create({ data: { organisationId, reference: `RX/EX/${randomId()}`, requisitionId, title: "Restricted and cancelled", estimatedValue: "1000.00", sourcingMethodCode: "RX_METHOD", restricted: true, status: "CANCELLED" } });
    const asOutsider = reader(who.outsider);
    const before = await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.outsider } });
    expect(await exerciseByTabledReference(db, asOutsider, organisationId, ex.reference)).toEqual([]);
    expect(await exerciseByTabledReference(db, asOutsider, organisationId, cancelled.reference)).toEqual([]);
    expect(await exerciseByTabledReference(db, asOutsider, organisationId, "NO/SUCH/REFERENCE")).toEqual([]);
    expect(await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.outsider } })).toBe(before + 1);
    // Named on it, the reader finds it, and an open exercise is found by anyone.
    expect((await exerciseByTabledReference(db, reader(who.named), organisationId, ex.reference)).map((e) => e.id)).toEqual([exerciseId]);
    const open = await db.sourcingExercise.findUniqueOrThrow({ where: { id: openExerciseId }, select: { reference: true } });
    expect((await exerciseByTabledReference(db, asOutsider, organisationId, open.reference)).map((e) => e.id)).toEqual([openExerciseId]);
  });
  it("a dependency on a matter of a hidden exercise reads as a matter that is not there, whichever way it names the exercise", async () => {
    expect(await dependencyIsHidden(db, reader(who.outsider), decisionOnHidden)).toBe(true);
    expect(await dependencyIsHidden(db, reader(who.outsider), decisionOnOpen)).toBe(false);
    expect(await dependencyIsHidden(db, reader(who.named), decisionOnHidden)).toBe(false);
  });
  it("the document attach choice lists nothing that hangs on a hidden exercise, for any kind of record, and lists it for a reader who is named (FR-MTD-007)", async () => {
    const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { reference: true } });
    const party = await db.exerciseParty.create({ data: { organisationId, exerciseId, source: "PURCHASER", name: "Restricted tenderer", registrationNo: `R${randomId()}` } });
    const extension = await db.validityExtension.create({ data: { organisationId, exerciseId, fromExpiry: day("2026-11-01"), toExpiry: day("2026-12-01"), reason: "Tests.", consentPartyId: party.id, consentReceivedOn: day("2026-10-20"), recordedByPersonId: who.named } });
    const hiddenFromOutsider = await hiddenExerciseIds(db, reader(who.outsider));
    const hiddenFromNamed = await hiddenExerciseIds(db, reader(who.named));
    expect(hiddenFromOutsider).toContain(exerciseId);
    for (const kind of OWNER_KINDS) {
      const seen = await attachTargetsOf(organisationId, kind, hiddenFromOutsider);
      expect(JSON.stringify(seen.records), kind).not.toContain(ex.reference);
    }
    const outsiderList = await attachTargetsOf(organisationId, "validityExtension", hiddenFromOutsider);
    const namedList = await attachTargetsOf(organisationId, "validityExtension", hiddenFromNamed);
    expect(JSON.stringify(outsiderList.records)).not.toContain(extension.id);
    expect(JSON.stringify(namedList.records)).toContain(extension.id);
    // The count is the filtered one too: it does not tell how many records there are on the hidden exercises.
    expect(namedList.total - outsiderList.total).toBeGreaterThanOrEqual(1);
  });
  it("the documents Library lists, counts and searches the award documents of a hidden exercise's awards for nobody who may not see it (FR-MTD-007)", async () => {
    const awardee = `Restricted Awardee ${randomId()}`;
    const template = await db.documentTemplate.create({ data: { organisationId, code: `RX_T_${randomId()}`, nameEn: "Restricted letter" } });
    const award = await db.award.create({ data: { organisationId, reference: `RX/AW/${randomId()}`, exerciseId, instrumentKind: "WORK_INDENT", awardeeName: awardee, awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS" } });
    await db.awardDocument.create({ data: { awardId: award.id, kind: "LETTER_OF_ACCEPTANCE", templateId: template.id, templateCode: template.code, templateName: template.nameEn, templateBodyVersion: 1, language: "EN", fields: {}, renderedText: "Tests.", frozenAt: new Date() } });
    const outsider = await hiddenExerciseIds(db, reader(who.outsider));
    const named = await hiddenExerciseIds(db, reader(who.named));
    expect(outsider).toContain(exerciseId);
    expect(named).not.toContain(exerciseId);
    for (const q of ["", awardee]) {
      const seen = await libraryPage(organisationId, q, undefined, "Asia/Kuala_Lumpur", outsider);
      expect(JSON.stringify(seen.rows), q).not.toContain(awardee);
      const mine = await libraryPage(organisationId, q, undefined, "Asia/Kuala_Lumpur", named);
      expect(JSON.stringify(mine.rows), q).toContain(awardee);
      expect(mine.total - seen.total, q).toBeGreaterThanOrEqual(1);
    }
    expect((await libraryCount(organisationId, [], named)) - (await libraryCount(organisationId, [], outsider))).toBeGreaterThanOrEqual(1);
    // Nothing hidden: the whole Library, as before.
    expect(await libraryCount(organisationId, [], [])).toBeGreaterThanOrEqual(await libraryCount(organisationId, [], named));
  });
  it("adding a version to a document of a hidden exercise reads as a document that is not there, before it says whether the file is already held, and logs the attempt (FR-MTD-007)", async () => {
    const cls = await db.documentClass.create({ data: { organisationId, code: `RX_C_${randomId()}`, nameEn: "Restricted class" } });
    const doc = await db.document.create({ data: { organisationId, title: "Restricted document", documentClassId: cls.id, retentionSnapshot: {} } });
    const held = new TextEncoder().encode(`held ${randomId()}`);
    const sha = createHash("sha256").update(held).digest("hex");
    await db.blobContent.create({ data: { organisationId, sha256: sha, byteSize: BigInt(held.length), bytes: Buffer.from(held) } });
    const version = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(held.length), mediaType: "text/plain", originalFilename: "held.txt", recordedByPersonId: who.named } });
    await db.documentAttachment.create({ data: { organisationId, purpose: "DOSSIER_EVIDENCE", versionId: version.id, exerciseId } });
    const org = await documentOrg(organisationId);
    const store = { transactional: true, put: async (tx: typeof db, org: string, sha256: string, bytes: Uint8Array) => { await tx.blobContent.upsert({ where: { organisationId_sha256: { organisationId: org, sha256 } }, create: { organisationId: org, sha256, byteSize: BigInt(bytes.length), bytes: Buffer.from(bytes) }, update: {} }); } } as never;
    const upload = (bytes: Uint8Array, as: Reader) =>
      storeUpload({ kind: "STAFF", personId: as.personId, sessionId: null, offices: [], sourceAddress: as.sourceAddress }, { org: org!, store, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mediaType: "text/plain", originalFilename: "x.txt", title: "", documentClassId: null, documentId: doc.id, recordedByPersonId: as.personId, reader: as, receivedOn: null, note: "" });
    const before = await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.outsider } });
    // The identical file and a different one are refused in the same words, 404: the first would otherwise be a 409 that confirms the content.
    const refusals = await Promise.all([upload(held, reader(who.outsider)), upload(new TextEncoder().encode("another"), reader(who.outsider))].map((p) => p.catch((e) => e)));
    for (const e of refusals) expect(e).toMatchObject({ status: 404, finding: { code: "DOCUMENT_UNKNOWN" } });
    expect(await db.sulitAccessEvent.count({ where: { entityId: exerciseId, actorPersonId: who.outsider } })).toBe(before + 2);
    expect(await db.documentVersion.count({ where: { documentId: doc.id } })).toBe(1);
    // Named on the exercise, the same file is told to be a duplicate (409), and a new one is stored.
    expect(await upload(held, reader(who.named)).catch((e) => e)).toMatchObject({ status: 409 });
    expect(await upload(new TextEncoder().encode(`new ${randomId()}`), reader(who.named))).toMatchObject({ versionNo: 2 });
  });
  it("naming is an authorised act: an unnamed officer cannot name themselves, so the estimate stays withheld from them (Phase 3a review)", async () => {
    const asStaff = (personId: string, permitted = false) => ({ ...reader(personId), permissions: new Set(permitted ? ["sourcing.participants.manage"] : []) }) as never;
    // The open exercise: nobody is named on it, the organisation has decided no permission.
    expect(await namingRefusal(db, asStaff(who.outsider), openExerciseId, [who.outsider])).toMatch(/cannot name yourself/);
    expect(await namingRefusal(db, asStaff(who.outsider), openExerciseId, [who.preparer])).toMatch(/not named on this one/);
    expect(await namingOthersRefusal(db, asStaff(who.outsider), openExerciseId)).not.toBeNull();
    // Named on it, they may name others; and the permission lets a holder name others, never themselves.
    expect(await namingRefusal(db, asStaff(who.named), exerciseId, [who.preparer])).toBeNull();
    expect(await namingRefusal(db, asStaff(who.outsider, true), openExerciseId, [who.preparer])).toBeNull();
    expect(await namingRefusal(db, asStaff(who.outsider, true), openExerciseId, [who.outsider])).toMatch(/cannot name yourself/);
    // The proposal's reviewer is the actor: named, or a holder.
    expect(await namingRefusal(db, asStaff(who.outsider), openExerciseId, [who.outsider], { selfAllowed: true })).toMatch(/not named on this one/);
    // Nothing was granted by being refused: the estimate of the open exercise is still withheld from them, because they are not named and the organisation's permission is undecided.
    const named = (await exerciseAccessFacts(db, organisationId, [openExerciseId])).get(openExerciseId)!.named;
    expect(named.participantIds).not.toContain(who.outsider);
    expect(decisionFor(asStaff(who.outsider), "exercise", "estimatedValue", { restricted: false, named }, { state: "UNDECIDED" }).decision).toMatchObject({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
  });
  it("the owner of documents maps to its exercise", async () => {
    expect(await exerciseOfOwner("exercise", exerciseId)).toBe(exerciseId);
    expect(await exerciseOfOwner("meeting", "anything")).toBeNull();
    expect(await exerciseOfOwner("award", "no_such_award")).toBeNull();
  });
});

describe("the company estimate's custody (FR-EST-008)", () => {
  const holder = (personId: string, roleCode: string, scope: string | null) => db.roleAssignment.create({ data: { personId, roleCode, scope, effectiveFrom: day("2024-01-01") } });
  const decisionOf = async (personId: string, over: Partial<Reader & { organisationTimeZone: string | null }> = {}) => (await estimateAccessFor(db, reader(personId, over), exerciseId))?.decision;

  it("before disclosure nobody reads it: not the preparer, not an office holder, whatever is set", async () => {
    expect(await decisionOf(who.preparer)).toEqual({ state: "WITHHELD", basis: "SEALED" });
    expect(await decisionOf(who.named)).toEqual({ state: "WITHHELD", basis: "SEALED" });
  });
  it("disclosed, with the offices unset, it says so: never 'nobody', never 'everybody'", async () => {
    await db.companyEstimate.update({ where: { id: estimateId }, data: { state: "DISCLOSED", disclosedAt: new Date() } });
    expect(await decisionOf(who.preparer)).toEqual({ state: "WITHHELD", basis: "CUSTODY_NOT_SET" });
  });
  it("with one office set and not the other, it is still not set", async () => {
    await db.scopePolicy.update({ where: { organisationId }, data: { estimateCustodianRoleCode: CUSTODIAN, estimateAuditRoleCode: null } });
    expect(await decisionOf(who.preparer)).toEqual({ state: "WITHHELD", basis: "CUSTODY_NOT_SET" });
  });
  it("with both set, the preparer and the holders of either office read it, and nobody else", async () => {
    await db.scopePolicy.update({ where: { organisationId }, data: { estimateCustodianRoleCode: CUSTODIAN, estimateAuditRoleCode: AUDIT } });
    await holder(who.custodian, CUSTODIAN, null);
    await holder(who.auditor, AUDIT, null);
    expect(await decisionOf(who.preparer)).toEqual({ state: "GRANTED", basis: "IN_CUSTODY" });
    expect(await decisionOf(who.custodian)).toEqual({ state: "GRANTED", basis: "IN_CUSTODY" });
    expect(await decisionOf(who.auditor)).toEqual({ state: "GRANTED", basis: "IN_CUSTODY" });
    expect(await decisionOf(who.outsider)).toEqual({ state: "WITHHELD", basis: "NOT_IN_CUSTODY" });
  });
  it("an office held for another department does not carry this department's estimate", async () => {
    await holder(who.otherDeptHolder, CUSTODIAN, OTHER_DEPT);
    expect(await decisionOf(who.otherDeptHolder)).toEqual({ state: "WITHHELD", basis: "NOT_IN_CUSTODY" });
  });
  it("an office held for the requesting department counts, and when it is held there it is the only holder (the nearest unit wins)", async () => {
    const dept = await makePerson(organisationId, `Restricted dept head ${randomId()}`);
    await holder(dept.id, CUSTODIAN, DEPT);
    expect(await decisionOf(dept.id)).toEqual({ state: "GRANTED", basis: "IN_CUSTODY" });
    // The organisation-wide holder no longer counts for a unit that has a holder of its own.
    expect(await decisionOf(who.custodian)).toEqual({ state: "WITHHELD", basis: "NOT_IN_CUSTODY" });
  });
  it("an administrator account never reads it, whatever the custody", async () => {
    expect(await decisionOf(who.preparer, { isAdministrator: true })).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
  });
  it("with no time zone the organisation's day is not known, and it says so", async () => {
    expect(await decisionOf(who.preparer, { organisationTimeZone: null })).toEqual({ state: "WITHHELD", basis: "CUSTODY_DAY_UNKNOWN" });
  });
  it("the logged read writes the event, shown or refused, against the estimate", async () => {
    const granted = await loggedEstimateAccess(db, reader(who.preparer), exerciseId);
    expect(granted?.decision.state).toBe("GRANTED");
    const refused = await loggedEstimateAccess(db, reader(who.outsider), exerciseId);
    expect(refused?.decision.state).toBe("WITHHELD");
    const events = await db.sulitAccessEvent.findMany({ where: { entity: "CompanyEstimate", entityId: estimateId }, orderBy: { at: "asc" } });
    expect(events.map((e) => e.outcome)).toEqual(expect.arrayContaining(["GRANTED", "WITHHELD"]));
    expect(events.every((e) => e.fields.includes("companyEstimate"))).toBe(true);
  });
  it("an exercise with no estimate that is not void asks nobody and logs nothing", async () => {
    expect(await loggedEstimateAccess(db, reader(who.preparer), openExerciseId)).toBeNull();
  });
  it("a void estimate is not the estimate", async () => {
    await db.companyEstimate.update({ where: { id: estimateId }, data: { state: "VOID", voidedAt: new Date(), voidReason: "test" } });
    expect(await estimateAccessFor(db, reader(who.preparer), exerciseId)).toBeNull();
  });
});
