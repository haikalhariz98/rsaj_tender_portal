import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { applyAppRole } from "../../../scripts/db-role-apply";
import { makePerson, randomId, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { attributeAct, AttributionRefused } from "./attribution-store";
import type { PermissionKey, StaffActor } from "./types";

/**
 * The attribution of acts, the maker records and the two-person change, against the scratch database (ADR 0034 D12, D15; Phase 2a):
 * every CHECK refuses what it is written to refuse (and an unknown refuses rather than passes), the slot is unique, an attribution is evidence that
 * no login can change or remove, and the one writer judges the request and writes nothing when it is refused.
 *
 * Refusals are told apart by SQLSTATE: 23514 a CHECK, 23505 a unique key, PA001 the append-only trigger, 42501 a missing privilege.
 */

const TEST_ROLE = "perolehan_app_test";
type Tx = Prisma.TransactionClient;

function sqlState(error: unknown): string {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}
async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}
const asApp = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${TEST_ROLE}`);
    return fn(tx);
  });

let organisationId = "";
let p1 = "";
let p2 = "";

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  p1 = (await makePerson(organisationId)).id;
  p2 = (await makePerson(organisationId)).id;
  const applied = await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }));
  expect(applied.ok).toBe(true);
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
});

const fresh = () => ({ organisationId, entity: "ApprovalStep", entityId: `step_${randomId()}`, slot: "decidedBy" });
const signedRow = (over: Record<string, unknown> = {}) => ({ ...fresh(), subjectPersonId: p1, recordedByPersonId: p1, mode: "SIGNED" as const, ...over });
const make = (data: Record<string, unknown>) => db.actAttribution.create({ data: data as Prisma.ActAttributionUncheckedCreateInput });

describe("the CHECKs of ActAttribution", () => {
  it("accepts a signed act, an act recorded on someone's behalf, and an act the system recorded", async () => {
    expect(await refusal(make(signedRow()))).toBeNull();
    expect(await refusal(make({ ...fresh(), subjectPersonId: p1, recordedByPersonId: p2, mode: "RECORDED_ON_BEHALF", paperReference: "Minute 4" }))).toBeNull();
    expect(await refusal(make({ ...fresh(), subjectPersonId: p1, recordedBySystemLabel: "demo loader", mode: "RECORDED_ON_BEHALF", reason: "history" }))).toBeNull();
  });

  it("accepts a supplier account as the subject and the recorder, with no foreign key yet", async () => {
    expect(await refusal(make({ ...fresh(), subjectSupplierAccountId: "acct_1", recordedBySupplierAccountId: "acct_1", mode: "SIGNED" }))).toBeNull();
  });

  it("refuses no subject, two subjects, no recorder and two recorders", async () => {
    expect(await refusal(make(signedRow({ subjectPersonId: null })))).toBe("23514");
    expect(await refusal(make(signedRow({ subjectSupplierAccountId: "acct_1" })))).toBe("23514");
    expect(await refusal(make(signedRow({ recordedByPersonId: null })))).toBe("23514");
    expect(await refusal(make(signedRow({ recordedBySystemLabel: "demo loader" })))).toBe("23514");
    expect(await refusal(make(signedRow({ recordedBySupplierAccountId: "acct_1" })))).toBe("23514");
  });

  it("refuses a signature by someone other than the subject, in the person pair and in the supplier pair, and by the system", async () => {
    expect(await refusal(make(signedRow({ recordedByPersonId: p2 })))).toBe("23514");
    expect(await refusal(make({ ...fresh(), subjectSupplierAccountId: "a1", recordedBySupplierAccountId: "a2", mode: "SIGNED" }))).toBe("23514");
    expect(await refusal(make({ ...fresh(), subjectPersonId: p1, recordedBySystemLabel: "demo loader", mode: "SIGNED" }))).toBe("23514");
    // A person and a supplier account that share an id are not the same party.
    expect(await refusal(make({ ...fresh(), subjectSupplierAccountId: p1, recordedByPersonId: p1, mode: "SIGNED" }))).toBe("23514");
  });

  it("refuses an act recorded on someone's behalf with neither the paper nor a reason, blank ones included", async () => {
    const base = { ...fresh(), subjectPersonId: p1, recordedByPersonId: p2, mode: "RECORDED_ON_BEHALF" as const };
    expect(await refusal(make(base))).toBe("23514");
    expect(await refusal(make({ ...base, paperReference: "   ", reason: " " }))).toBe("23514");
    expect(await refusal(make({ ...base, reason: "Away on leave" }))).toBeNull();
  });

  it("refuses a system recorder with a session or a password stamp or no label", async () => {
    const base = { ...fresh(), subjectPersonId: p1, recordedBySystemLabel: "demo loader", mode: "RECORDED_ON_BEHALF" as const, reason: "history" };
    expect(await refusal(make({ ...base, sessionId: "s1" }))).toBe("23514");
    expect(await refusal(make({ ...base, stepUpAt: new Date() }))).toBe("23514");
    expect(await refusal(make({ ...base, recordedBySystemLabel: "  " }))).toBe("23514");
  });

  it("holds an act's person slot once: a second attribution of the same slot is refused", async () => {
    const row = signedRow();
    expect(await refusal(make(row))).toBeNull();
    expect(await refusal(make({ ...row, recordedByPersonId: p1 }))).toBe("23505");
    expect(await refusal(make({ ...row, slot: "declaredBy" }))).toBeNull();
  });
});

describe("an attribution is evidence", () => {
  let id = "";
  beforeAll(async () => {
    id = (await make(signedRow())).id;
  });

  it("is refused every UPDATE, DELETE and TRUNCATE by the table's trigger, for the owner, even with triggers set to replica", async () => {
    expect(await refusal(db.$transaction((tx) => tx.$executeRawUnsafe(`UPDATE "ActAttribution" SET "reason" = 'rewritten' WHERE "id" = $1`, id)))).toBe("PA001");
    expect(await refusal(db.$transaction((tx) => tx.$executeRawUnsafe(`DELETE FROM "ActAttribution" WHERE "id" = $1`, id)))).toBe("PA001");
    expect(await refusal(db.$transaction((tx) => tx.$executeRawUnsafe(`TRUNCATE "ActAttribution"`)))).toBe("PA001");
    const replica = (sql: string) =>
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
        return tx.$executeRawUnsafe(sql, id);
      });
    expect(await refusal(replica(`DELETE FROM "ActAttribution" WHERE "id" = $1`))).toBe("PA001");
    expect(await db.actAttribution.count({ where: { id } })).toBe(1);
  });

  it("is refused UPDATE, DELETE and TRUNCATE to the app's own login for want of the privilege, while it can still add and read", async () => {
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "ActAttribution" SET "reason" = 'x' WHERE "id" = $1`, id)))).toBe("42501");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "ActAttribution" WHERE "id" = $1`, id)))).toBe("42501");
    expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`TRUNCATE "ActAttribution" CASCADE`)))).toBe("42501");
    expect(await refusal(asApp((tx) => tx.actAttribution.findFirst({ where: { id } })))).toBeNull();
    expect(await refusal(asApp((tx) => tx.actAttribution.create({ data: signedRow() })))).toBeNull();
  });

  it("is a foreign key to the person: a person who recorded or was recorded for cannot be deleted", async () => {
    expect(await refusal(db.person.delete({ where: { id: p1 } }))).toBe("23503");
  });
});

describe("the one writer", () => {
  const actor = (over: Partial<StaffActor> = {}): StaffActor => ({
    kind: "STAFF",
    accountId: "acc",
    sessionId: "sess_1",
    personId: p1,
    personName: "Test",
    jobTitle: null,
    isAdministrator: false,
    organisationId,
    organisationCode: "AUTH_TEST",
    organisationTimeZone: "Asia/Kuala_Lumpur",
    offices: [],
    permissions: new Set<PermissionKey>(),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: null,
    mustChangePassword: false,
    ...over,
  });
  const base = () => ({ entity: "ApprovalStep", entityId: `step_${randomId()}`, slot: "decidedBy" });

  it("writes a signed act with the session and the password stamp, and nothing else is guessed", async () => {
    const at = new Date();
    const input = { ...base(), actor: actor(), subject: { kind: "PERSON" as const, personId: p1 }, mode: "SIGNED" as const, stepUpAt: at };
    const row = await db.$transaction((tx) => attributeAct(tx, input));
    expect(row).toMatchObject({ organisationId, subjectPersonId: p1, recordedByPersonId: p1, recordedBySystemLabel: null, mode: "SIGNED", sessionId: "sess_1" });
    expect(row.stepUpAt?.getTime()).toBe(at.getTime());
  });

  it("refuses a signature-class act signed without the password again, and writes nothing", async () => {
    const input = { ...base(), actor: actor(), subject: { kind: "PERSON" as const, personId: p1 }, mode: "SIGNED" as const };
    await expect(db.$transaction((tx) => attributeAct(tx, input))).rejects.toBeInstanceOf(AttributionRefused);
    expect(await db.actAttribution.count({ where: { entityId: input.entityId } })).toBe(0);
  });

  it("refuses a person of another organisation, as the subject or as the recorder, and writes nothing", async () => {
    const other = await db.organisation.upsert({ where: { code: "AUTH_TEST_OTHER" }, update: {}, create: { code: "AUTH_TEST_OTHER", name: "Another organisation", timeZone: "Asia/Kuala_Lumpur" } });
    const stranger = await makePerson(other.id);
    // A slot that is not signature-class, so the only fault is the Person.
    const record = { entity: "Requisition", entityId: `rq_${randomId()}`, slot: "requestingPerson", mode: "RECORDED_ON_BEHALF" as const, reason: "the form named someone of another organisation" };
    const asSubject = { ...record, actor: actor(), subject: { kind: "PERSON" as const, personId: stranger.id } };
    await expect(db.$transaction((tx) => attributeAct(tx, asSubject))).rejects.toMatchObject({ faults: [{ code: "NO_SUCH_PERSON" }] });
    const asRecorder = { ...record, actor: actor({ personId: stranger.id }), subject: { kind: "PERSON" as const, personId: p2 } };
    await expect(db.$transaction((tx) => attributeAct(tx, asRecorder))).rejects.toMatchObject({ faults: [{ code: "NO_SUCH_PERSON" }] });
    expect(await db.actAttribution.count({ where: { entityId: record.entityId } })).toBe(0);
  });

  it("refuses to sign for another person: the F1 hole, closed at the writer", async () => {
    const input = { ...base(), actor: actor(), subject: { kind: "PERSON" as const, personId: p2 }, mode: "SIGNED" as const, stepUpAt: new Date() };
    await expect(db.$transaction((tx) => attributeAct(tx, input))).rejects.toMatchObject({ faults: [{ code: "SIGNED_BY_ANOTHER" }] });
    expect(await db.actAttribution.count({ where: { entityId: input.entityId } })).toBe(0);
  });

  it("refuses a paper decision while the organisation's switch is unset, says so, and allows it once the switch is on and the officer holds the permission", async () => {
    const input = { ...base(), actor: actor({ permissions: new Set<PermissionKey>(["acts.recordOnBehalf"]) }), subject: { kind: "PERSON" as const, personId: p2 }, mode: "RECORDED_ON_BEHALF" as const, paperReference: "Minute 9/2026" };
    await expect(db.$transaction((tx) => attributeAct(tx, input))).rejects.toMatchObject({ faults: [{ code: "PAPER_SWITCH_NOT_SET" }] });
    await setPolicy(organisationId, { ...SETTINGS, paperSignatureRecording: "ALLOWED" });
    const row = await db.$transaction((tx) => attributeAct(tx, input));
    expect(row).toMatchObject({ subjectPersonId: p2, recordedByPersonId: p1, mode: "RECORDED_ON_BEHALF", paperReference: "Minute 9/2026" });
    await setPolicy(organisationId, { ...SETTINGS, paperSignatureRecording: "REFUSED" });
    await expect(db.$transaction((tx) => attributeAct(tx, { ...input, entityId: `step_${randomId()}` }))).rejects.toMatchObject({ faults: [{ code: "PAPER_REFUSED" }] });
  });

  it("refuses a paper decision from an officer who does not hold the permission to record one", async () => {
    await setPolicy(organisationId, { ...SETTINGS, paperSignatureRecording: "ALLOWED" });
    const input = { ...base(), actor: actor(), subject: { kind: "PERSON" as const, personId: p2 }, mode: "RECORDED_ON_BEHALF" as const, paperReference: "Minute 9/2026" };
    await expect(db.$transaction((tx) => attributeAct(tx, input))).rejects.toMatchObject({ faults: [{ code: "NOT_PERMITTED_TO_RECORD" }] });
  });

  it("writes a loader run's act as the system by its label, never as the loader's empty person", async () => {
    const loader = actor({ personId: "", sessionId: "", system: { label: "demo loader" } });
    const input = { ...base(), actor: loader, subject: { kind: "PERSON" as const, personId: p2 }, mode: "RECORDED_ON_BEHALF" as const, reason: "history made by the demo loader" };
    const row = await db.$transaction((tx) => attributeAct(tx, input));
    expect(row).toMatchObject({ subjectPersonId: p2, recordedByPersonId: null, recordedBySystemLabel: "demo loader", sessionId: null, stepUpAt: null });
  });

  it("is written with the act's own transaction: when the act is rolled back, so is its attribution", async () => {
    const input = { ...base(), actor: actor(), subject: { kind: "PERSON" as const, personId: p1 }, mode: "SIGNED" as const, stepUpAt: new Date() };
    await expect(
      db.$transaction(async (tx) => {
        await attributeAct(tx, input);
        throw new Error("the act failed after its attribution was written");
      }),
    ).rejects.toThrow(/the act failed/);
    expect(await db.actAttribution.count({ where: { entityId: input.entityId } })).toBe(0);
  });

  it("refuses a slot the registry does not know", async () => {
    const input = { ...base(), slot: "nobody", actor: actor(), subject: { kind: "PERSON" as const, personId: p1 }, mode: "SIGNED" as const, stepUpAt: new Date() };
    await expect(db.$transaction((tx) => attributeAct(tx, input))).rejects.toMatchObject({ faults: [{ code: "UNKNOWN_SLOT" }] });
  });
});

describe("the maker records and the issuer of a matrix", () => {
  async function draft() {
    const label = `draft ${randomId()}`;
    return db.authorityMatrix.create({
      data: { organisationId, label, effectiveFrom: new Date("2030-01-01"), boundaryValue: 1, quotationFloor: 1, tenderFloor: 1, requisitionBoundary: 1 },
    });
  }

  it("a new draft is not marked as having unknown makers: only the drafts that existed at landing were", async () => {
    const d = await draft();
    expect(d.makersUnknownAtLanding).toBe(false);
    expect(d.issuedByPersonId).toBeNull();
  });

  it("holds a person once as a maker of a draft", async () => {
    const d = await draft();
    expect(await refusal(db.authorityMatrixMaker.create({ data: { matrixId: d.id, personId: p1 } }))).toBeNull();
    expect(await refusal(db.authorityMatrixMaker.create({ data: { matrixId: d.id, personId: p1 } }))).toBe("23505");
    expect(await refusal(db.authorityMatrixMaker.create({ data: { matrixId: d.id, personId: p2 } }))).toBeNull();
  });

  it("names an issuer only on an issued matrix", async () => {
    const d = await draft();
    expect(await refusal(db.authorityMatrix.update({ where: { id: d.id }, data: { issuedByPersonId: p1 } }))).toBe("23514");
    expect(await refusal(db.authorityMatrix.update({ where: { id: d.id }, data: { issuedAt: new Date(), issuedByPersonId: p1 } }))).toBeNull();
  });
});

describe("a role's permission decision", () => {
  it("is held once per permission and role, and names both", async () => {
    const role = `R_${randomId()}`;
    expect(await refusal(db.rolePermission.create({ data: { organisationId, permissionKey: "audit.read", roleCode: role, decision: "GRANTED" } }))).toBeNull();
    expect(await refusal(db.rolePermission.create({ data: { organisationId, permissionKey: "audit.read", roleCode: role, decision: "WITHHELD" } }))).toBe("23505");
    expect(await refusal(db.rolePermission.create({ data: { organisationId, permissionKey: " ", roleCode: role, decision: "GRANTED" } }))).toBe("23514");
  });
});

describe("a two-person configuration change", () => {
  const change = (over: Record<string, unknown> = {}) => ({ organisationId, kind: "SECURITY_POLICY" as const, payload: { changes: {} }, before: {}, proposedByPersonId: p1, ...over });
  const make2 = (data: Record<string, unknown>) => db.configurationChange.create({ data: data as Prisma.ConfigurationChangeUncheckedCreateInput });

  it("starts proposed, with nobody having decided", async () => {
    const row = await make2(change());
    expect(row).toMatchObject({ status: "PROPOSED", decidedByPersonId: null, decidedAt: null });
  });

  it("is decided by a different Person: the proposer cannot apply, decline or stale it, in the database too", async () => {
    for (const status of ["APPLIED", "DECLINED", "STALE"]) {
      expect(await refusal(make2(change({ status, decidedByPersonId: p1, decidedAt: new Date() }))), status).toBe("23514");
      expect(await refusal(make2(change({ status, decidedByPersonId: p2, decidedAt: new Date() }))), status).toBeNull();
    }
  });

  it("is withdrawn only by the proposer", async () => {
    expect(await refusal(make2(change({ status: "WITHDRAWN", decidedByPersonId: p2, decidedAt: new Date() })))).toBe("23514");
    expect(await refusal(make2(change({ status: "WITHDRAWN", decidedByPersonId: p1, decidedAt: new Date() })))).toBeNull();
  });

  it("names and dates a decision exactly when the change is no longer proposed", async () => {
    expect(await refusal(make2(change({ status: "APPLIED" })))).toBe("23514");
    expect(await refusal(make2(change({ decidedByPersonId: p2, decidedAt: new Date() })))).toBe("23514");
    expect(await refusal(make2(change({ status: "APPLIED", decidedByPersonId: p2 })))).toBe("23514");
  });

  it("carries its payload and its snapshot as objects", async () => {
    expect(await refusal(make2(change({ payload: [] })))).toBe("23514");
    expect(await refusal(make2(change({ before: "x" })))).toBe("23514");
  });
});
