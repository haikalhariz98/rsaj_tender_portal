import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * What the database itself holds of the kick-off meeting (ADR 0042 D10, plan step 7 section 8.2, PW-18, PW-29), against migration 20261123000000. The acts
 * judge first; these are the backstops, for every login. Each refusal is told apart by its SQLSTATE: PA001 the trail's append-only refusal, PA045 the
 * meeting's own trigger (and its check at commit), PA046 the attendance's, 23514 a CHECK, 23505 a unique key.
 *
 * Recording a meeting held is one act (PW-29): the minutes document, the held columns and the attendance are written in one transaction, at its top
 * level. The refusals inside that act are tried in savepoints, which the triggers allow because they read the meeting's row as written by the transaction
 * itself, and a savepoint's own writes are rolled back after each try.
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

let organisationId: string;
/// The S.O., who schedules and records; `engineer` attends for the organisation.
let so: string;
let engineer: string;
/// A person of another organisation.
let stranger: string;
/// The awardee's portal account, and another supplier's.
let awardeeAccount: string;
let awardeeSupplier: string;
let otherAccount: string;

function sqlState(error: unknown): string {
  const e = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode) return cause.originalCode;
  // A refusal at COMMIT (a deferred check) reaches the caller as the driver adapter's own error, not wrapped by the client.
  const direct = (error as { name?: string; cause?: { originalCode?: string } }).cause;
  if ((error as { name?: string }).name === "DriverAdapterError" && direct?.originalCode) return direct.originalCode;
  // A unique key refused through the client reads P2002, whatever the driver said.
  if (e.code === "P2002") return "23505";
  return cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}

async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

/// The work, inside a savepoint of the transaction: released when it goes through, rolled back when it is refused. Null, or the SQLSTATE.
async function inSavepoint(tx: Tx, work: () => Promise<unknown>): Promise<string | null> {
  await tx.$executeRawUnsafe(`SAVEPOINT kick_off_try`);
  try {
    await work();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT kick_off_try`);
    return null;
  } catch (error) {
    // Rolled back, then released, so that what follows is written at the transaction's own level again.
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT kick_off_try`);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT kick_off_try`);
    return sqlState(error);
  }
}

const now = () => new Date();
const DAY = new Date("2026-10-23T00:00:00.000Z");
const MEETS = new Date("2026-11-02T01:30:00.000Z");
const LONG = { timeout: 60_000, maxWait: 10_000 };

/// A contract of the test organisation, awarded to the awardee's supplier, executed.
async function newContract(): Promise<string> {
  const run = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `KOM/RQ/${run}`, requestingUnitCode: "KOM_DEPT", requestingPersonId: so, title: "Kick-off requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "KOM_CC", accountCode: "KOM_AC", placeOfDelivery: "Nowhere", dateRequired: DAY, estimatedValue: "100000.00", raisedOn: DAY },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `KOM/EX/${run}`, requisitionId: requisition.id, title: `Road ${run}`, estimatedValue: "100000.00", sourcingMethodCode: "KOM_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `KOM/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId: awardeeSupplier } });
  return (await db.contract.create({ data: { organisationId, number: `KOM/CON/${run}`, numberSource: "SERIES", numberedOn: DAY, awardId: award.id, contractSum: "100000.00", status: "EXECUTED" } })).id;
}

const schedule = (contractId: string, over: { place?: string; onlineLink?: string; agenda?: string; organisationId?: string } = {}) =>
  db.kickOffMeeting.create({
    data: { organisationId: over.organisationId ?? organisationId, contractId, meetsAt: MEETS, place: over.place ?? "Site office", onlineLink: over.onlineLink ?? "", agenda: over.agenda ?? "Introductions. Programme. Safety.", scheduledByPersonId: so, scheduledAt: now() },
  });

/// The minutes: an ORGANISATION document of the contract with its Version 1, shared at once (no approver at upload), made by `tx`.
async function minutes(tx: Tx, contractId: string, o: { side?: "ORGANISATION" | "CONTRACTOR"; version?: boolean; noApproversAtUpload?: boolean } = {}): Promise<string> {
  const side = o.side ?? "ORGANISATION";
  const d = await tx.projectDocument.create({
    data: { organisationId, contractId, title: "Kick-off meeting minutes", side, ...(side === "ORGANISATION" ? { createdByPersonId: so } : { createdBySupplierAccountId: awardeeAccount }), createdAt: now() },
  });
  if (o.version ?? true) {
    await tx.projectDocumentVersion.create({
      data: { organisationId, documentId: d.id, number: 1, ...(side === "ORGANISATION" ? { uploadedByPersonId: so } : { uploadedBySupplierAccountId: awardeeAccount }), uploadedAt: now(), uploadedOn: DAY, noApproversAtUpload: o.noApproversAtUpload ?? true },
    });
  }
  return d.id;
}

const hold = (tx: Tx, meetingId: string, minutesDocumentId: string | null, over: { heldRecordedAt?: Date | null } = {}) =>
  tx.kickOffMeeting.update({
    where: { id: meetingId },
    data: { heldOn: DAY, heldRecordedByPersonId: so, heldRecordedAt: over.heldRecordedAt === undefined ? now() : over.heldRecordedAt, minutesDocumentId },
  });

type Attendee = { side?: "ORGANISATION" | "CONTRACTOR" | null; personId?: string | null; supplierAccountId?: string | null; name?: string; organisationId?: string };
const attend = (tx: Tx | typeof db, meetingId: string, a: Attendee) =>
  tx.kickOffAttendance.create({ data: { organisationId: a.organisationId ?? organisationId, meetingId, side: a.side ?? null, personId: a.personId ?? null, supplierAccountId: a.supplierAccountId ?? null, name: a.name ?? "" } });

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  so = (await makePerson(organisationId, `S.O. ${randomId()}`)).id;
  engineer = (await makePerson(organisationId, `Engineer ${randomId()}`)).id;
  const elsewhere = await db.organisation.upsert({ where: { code: "KOM_OTHER" }, update: {}, create: { code: "KOM_OTHER", name: "Another organisation" } });
  stranger = (await makePerson(elsewhere.id, `Stranger ${randomId()}`)).id;
  const awardee = await makeSupplierAccount(organisationId);
  awardeeAccount = awardee.account!.id;
  awardeeSupplier = awardee.supplier.id;
  otherAccount = (await makeSupplierAccount(organisationId)).account!.id;
});

describe("a contract has one kick-off meeting, scheduled with a place or a link and an agenda", () => {
  it("schedules one, and refuses a second for the same contract (unique key)", async () => {
    const c = await newContract();
    expect(await refusal(schedule(c))).toBeNull();
    expect(await refusal(schedule(c, { place: "Head office" }))).toBe("23505");
  });

  it("refuses a meeting with neither a place nor a link, and one with a blank agenda (CHECK); a link alone is enough", async () => {
    const c = await newContract();
    expect(await refusal(schedule(c, { place: "  ", onlineLink: "" }))).toBe("23514");
    expect(await refusal(schedule(c, { agenda: "   " }))).toBe("23514");
    expect(await refusal(schedule(c, { place: "", onlineLink: "meet.example.test/kick-off" }))).toBeNull();
  });

  it("refuses a meeting filed under another organisation than its contract's, and one inserted already held (PA045)", async () => {
    const c = await newContract();
    const elsewhere = await db.organisation.findUniqueOrThrow({ where: { code: "KOM_OTHER" } });
    expect(await refusal(schedule(c, { organisationId: elsewhere.id }))).toBe("PA045");
    expect(
      await refusal(db.kickOffMeeting.create({ data: { organisationId, contractId: c, meetsAt: MEETS, place: "Site office", agenda: "A", scheduledByPersonId: so, scheduledAt: now(), heldOn: DAY, heldRecordedByPersonId: so, heldRecordedAt: now() } })),
    ).toBe("PA045");
  });
});

describe("before it is held, only when, where and the agenda change; it is never deleted", () => {
  it("changes when, where, the link and the agenda, and refuses a change of who scheduled it, when, or its contract (PA045)", async () => {
    const c = await newContract();
    const m = await schedule(c);
    expect(await refusal(db.kickOffMeeting.update({ where: { id: m.id }, data: { meetsAt: new Date("2026-11-03T01:30:00.000Z"), place: "Hall", onlineLink: "meet.example.test/x", agenda: "Revised." } }))).toBeNull();
    expect(await refusal(db.kickOffMeeting.update({ where: { id: m.id }, data: { scheduledByPersonId: engineer } }))).toBe("PA045");
    expect(await refusal(db.kickOffMeeting.update({ where: { id: m.id }, data: { scheduledAt: now() } }))).toBe("PA045");
    expect(await refusal(db.kickOffMeeting.update({ where: { id: m.id }, data: { contractId: await newContract() } }))).toBe("PA045");
    // A change that also sets a held column is neither a change nor the held record.
    expect(await refusal(db.kickOffMeeting.update({ where: { id: m.id }, data: { place: "Annex", heldRecordedByPersonId: so } }))).toBe("PA045");
  });

  it("refuses DELETE (PA045) and TRUNCATE (PA001)", async () => {
    const m = await schedule(await newContract());
    expect(await refusal(db.kickOffMeeting.delete({ where: { id: m.id } }))).toBe("PA045");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "KickOffMeeting" CASCADE`))).toBe("PA001");
    expect(await db.kickOffMeeting.findUnique({ where: { id: m.id } })).not.toBeNull();
  });
});

describe("recording it held is one act: the minutes, the four held columns and the attendance together (PW-29)", () => {
  it("records it held with minutes and attendance from both sides and another name; then nothing changes, and it is never deleted", async () => {
    const c = await newContract();
    const m = await schedule(c);
    await db.$transaction(async (tx) => {
      const doc = await minutes(tx, c);
      await hold(tx, m.id, doc);
      await attend(tx, m.id, { side: "ORGANISATION", personId: so });
      await attend(tx, m.id, { side: "ORGANISATION", personId: engineer });
      await attend(tx, m.id, { side: "CONTRACTOR", supplierAccountId: awardeeAccount });
      await attend(tx, m.id, { name: "Consultant's engineer" });
    }, LONG);
    const held = await db.kickOffMeeting.findUniqueOrThrow({ where: { id: m.id }, include: { attendance: true } });
    expect(held.heldOn).toEqual(DAY);
    expect(held.attendance).toHaveLength(4);
    // Frozen: a change of place, a correction of the day, a no-op and a delete are all refused.
    expect(await refusal(db.kickOffMeeting.update({ where: { id: m.id }, data: { place: "Hall" } }))).toBe("PA045");
    expect(await refusal(db.kickOffMeeting.update({ where: { id: m.id }, data: { heldOn: new Date("2026-10-22T00:00:00.000Z") } }))).toBe("PA045");
    expect(await refusal(db.$executeRawUnsafe(`UPDATE "KickOffMeeting" SET "place" = "place" WHERE "id" = $1`, m.id))).toBe("PA045");
    expect(await refusal(db.kickOffMeeting.delete({ where: { id: m.id } }))).toBe("PA045");
    // Attendance is append-only, and is not added later, outside the act that recorded the meeting held.
    const row = held.attendance.find((a) => a.name === "Consultant's engineer")!;
    expect(await refusal(db.kickOffAttendance.update({ where: { id: row.id }, data: { name: "Someone else" } }))).toBe("PA001");
    expect(await refusal(db.kickOffAttendance.delete({ where: { id: row.id } }))).toBe("PA001");
    expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "KickOffAttendance"`))).toBe("PA001");
    expect(await refusal(attend(db, m.id, { name: "Late arrival" }))).toBe("PA046");
  });

  it("refuses the held columns set in part (CHECK), and minutes that are not this contract's organisation document made in this act, with a version shared at once (PA045)", async () => {
    const c = await newContract();
    const m = await schedule(c);
    const earlier = await db.$transaction((tx) => minutes(tx, c), LONG);
    const elsewhere = await newContract();
    await db.$transaction(async (tx) => {
      const doc = await minutes(tx, c);
      // Three of the four held columns.
      expect(await inSavepoint(tx, () => hold(tx, m.id, doc, { heldRecordedAt: null }))).toBe("23514");
      // A held column without the day is not the held record.
      expect(await inSavepoint(tx, () => tx.kickOffMeeting.update({ where: { id: m.id }, data: { heldRecordedByPersonId: so } }))).toBe("PA045");
      // No minutes.
      expect(await inSavepoint(tx, () => hold(tx, m.id, null))).toBe("PA045");
      // Minutes made before this act.
      expect(await inSavepoint(tx, () => hold(tx, m.id, earlier))).toBe("PA045");
      // Another contract's document, a contractor's document, one with no version, one whose version waited on approvers, one with a live approver.
      expect(await inSavepoint(tx, async () => hold(tx, m.id, await minutes(tx, elsewhere)))).toBe("PA045");
      const theirs = await minutes(tx, c, { side: "CONTRACTOR" });
      expect(await inSavepoint(tx, () => hold(tx, m.id, theirs))).toBe("PA045");
      const empty = await minutes(tx, c, { version: false });
      expect(await inSavepoint(tx, () => hold(tx, m.id, empty))).toBe("PA045");
      const withheld = await minutes(tx, c, { noApproversAtUpload: false });
      expect(await inSavepoint(tx, () => hold(tx, m.id, withheld))).toBe("PA045");
      await tx.projectDocumentApprover.create({ data: { organisationId, documentId: doc, personId: engineer, addedByPersonId: so, addedAt: now() } });
      expect(await inSavepoint(tx, () => hold(tx, m.id, doc))).toBe("PA045");
    }, LONG);
    expect((await db.kickOffMeeting.findUniqueOrThrow({ where: { id: m.id } })).heldOn).toBeNull();
  });

  it("refuses, at commit, a meeting recorded held with nobody attending (PA045)", async () => {
    const c = await newContract();
    const m = await schedule(c);
    const committed = refusal(
      db.$transaction(async (tx) => {
        await hold(tx, m.id, await minutes(tx, c));
      }, LONG),
    );
    expect(await committed).toBe("PA045");
    expect((await db.kickOffMeeting.findUniqueOrThrow({ where: { id: m.id } })).heldOn).toBeNull();
  });
});

describe("an attendee is a person on the organisation's side, an awardee's account on the contractor's, or another name", () => {
  it("holds the attendance rules (CHECK, PA046, unique key), inside the act that records the meeting held", async () => {
    const c = await newContract();
    const m = await schedule(c);
    await db.$transaction(async (tx) => {
      // Before the meeting is held, no attendance.
      expect(await inSavepoint(tx, () => attend(tx, m.id, { name: "Too early" }))).toBe("PA046");
      const doc = await minutes(tx, c);
      // A held record written inside a savepoint is not this transaction's own row version: its attendance is refused (the act writes at the top level).
      await tx.$executeRawUnsafe(`SAVEPOINT nested_hold`);
      await hold(tx, m.id, doc);
      expect(await inSavepoint(tx, () => attend(tx, m.id, { name: "Visitor" }))).toBe("PA046");
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT nested_hold`);
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT nested_hold`);
      await hold(tx, m.id, doc);

      // CHECKs: a person on the contractor's side, an account on the organisation's, both at once, a side with nobody, and nobody with no name.
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "CONTRACTOR", personId: engineer }))).toBe("23514");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "ORGANISATION", supplierAccountId: awardeeAccount }))).toBe("23514");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "ORGANISATION", personId: engineer, supplierAccountId: awardeeAccount }))).toBe("23514");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "ORGANISATION", name: "Named" }))).toBe("23514");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { name: "  " }))).toBe("23514");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { personId: engineer }))).toBe("23514");

      // PA046: another organisation's person, another supplier's account, a row filed under another organisation.
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "ORGANISATION", personId: stranger }))).toBe("PA046");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "CONTRACTOR", supplierAccountId: otherAccount }))).toBe("PA046");
      const elsewhere = await tx.organisation.findUniqueOrThrow({ where: { code: "KOM_OTHER" } });
      expect(await inSavepoint(tx, () => attend(tx, m.id, { name: "Stray", organisationId: elsewhere.id }))).toBe("PA046");

      // A person or an account is ticked once; two other names may read the same.
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "ORGANISATION", personId: engineer }))).toBeNull();
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "ORGANISATION", personId: engineer }))).toBe("23505");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "CONTRACTOR", supplierAccountId: awardeeAccount }))).toBeNull();
      expect(await inSavepoint(tx, () => attend(tx, m.id, { side: "CONTRACTOR", supplierAccountId: awardeeAccount }))).toBe("23505");
      expect(await inSavepoint(tx, () => attend(tx, m.id, { name: "Surveyor" }))).toBeNull();
      expect(await inSavepoint(tx, () => attend(tx, m.id, { name: "Surveyor" }))).toBeNull();
    }, LONG);
    const rows = await db.kickOffAttendance.findMany({ where: { meetingId: m.id } });
    expect(rows).toHaveLength(4);
  });
});

describe("the triggers fire for every login, and the window count has its index", () => {
  it("every kick-off trigger is ENABLE ALWAYS", async () => {
    const rows = await db.$queryRawUnsafe<{ name: string; enabled: string }[]>(
      `SELECT t.tgname::text AS name, t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('KickOffMeeting', 'KickOffAttendance') ORDER BY 1`,
    );
    expect(rows.map((r) => r.name)).toEqual(["KickOffAttendance_append_only", "KickOffAttendance_insert", "KickOffAttendance_no_truncate", "KickOffMeeting_guard", "KickOffMeeting_held_has_attendance", "KickOffMeeting_no_truncate"]);
    expect(rows.every((r) => r.enabled === "A")).toBe(true);
  });

  it("DocumentVersion has the (recordedBySupplierAccountId, storedAt) index the portal upload's window reads (PW-32)", async () => {
    const rows = await db.$queryRawUnsafe<{ def: string }[]>(`SELECT indexdef AS def FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'DocumentVersion' AND indexname = 'DocumentVersion_recordedBySupplierAccountId_storedAt_idx'`);
    expect(rows.map((r) => r.def)).toEqual([`CREATE INDEX "DocumentVersion_recordedBySupplierAccountId_storedAt_idx" ON public."DocumentVersion" USING btree ("recordedBySupplierAccountId", "storedAt")`]);
  });
});
