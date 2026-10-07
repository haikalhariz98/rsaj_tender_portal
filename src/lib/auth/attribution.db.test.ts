import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { applyAppRole } from "../../../scripts/db-role-apply";
import { makeAccount, makePerson, randomId, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { latestAttribution } from "./attribution";
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
let accountId = "";

/// A live session that has been asked for the password at `stepUpAt`: what `stepUp` leaves behind, which is all the writer accepts as proof.
async function sessionAskedAt(stepUpAt: Date | null): Promise<string> {
  const now = new Date();
  const row = await db.staffSession.create({
    data: { organisationId, accountId, tokenHash: `tok_${randomId()}${randomId()}`, lastSeenAt: now, absoluteExpiresAt: new Date(now.getTime() + 3_600_000), stepUpAt },
  });
  return row.id;
}

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  accountId = (await makeAccount(organisationId)).account.id;
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

  it("holds an act's person slot once per occurrence: the same occurrence twice is refused, the next is a new row", async () => {
    const row = signedRow();
    expect(await refusal(make(row))).toBeNull();
    expect(await refusal(make({ ...row, recordedByPersonId: p1 }))).toBe("23505");
    expect(await refusal(make({ ...row, slot: "declaredBy" }))).toBeNull();
    expect(await refusal(make({ ...row, occurrence: 2 }))).toBeNull();
    expect(await refusal(make({ ...row, occurrence: 0 }))).toBe("23514");
  });

  it("refuses an act recorded on someone's behalf for the person who recorded it, in the person pair and the supplier pair", async () => {
    const base = () => ({ ...fresh(), mode: "RECORDED_ON_BEHALF" as const, paperReference: "Minute 4" });
    expect(await refusal(make({ ...base(), subjectPersonId: p1, recordedByPersonId: p1 }))).toBe("23514");
    expect(await refusal(make({ ...base(), subjectSupplierAccountId: "a1", recordedBySupplierAccountId: "a1" }))).toBe("23514");
    expect(await refusal(make({ ...base(), subjectSupplierAccountId: "a1", recordedBySupplierAccountId: "a2" }))).toBeNull();
    // A person and a supplier account that share an id are not the same party.
    expect(await refusal(make({ ...base(), subjectSupplierAccountId: p1, recordedByPersonId: p1 }))).toBeNull();
  });

  it("holds one password entry to one act: two rows never share a session and a stamp, while rows with no stamp do", async () => {
    const stamp = new Date();
    expect(await refusal(make(signedRow({ sessionId: "sess_x", stepUpAt: stamp })))).toBeNull();
    expect(await refusal(make(signedRow({ sessionId: "sess_x", stepUpAt: stamp })))).toBe("23505");
    expect(await refusal(make(signedRow({ sessionId: "sess_y", stepUpAt: stamp })))).toBeNull();
    expect(await refusal(make(signedRow({ sessionId: "sess_x" })))).toBeNull();
    expect(await refusal(make(signedRow({ sessionId: "sess_x" })))).toBeNull();
  });
});

describe("the CHECKs of the document, the role and the back-dating (Phase 2b)", () => {
  it("holds the document to its model and its id together, neither blank", async () => {
    expect(await refusal(make(signedRow({ documentEntity: "Requisition", documentId: "rq_1" })))).toBeNull();
    expect(await refusal(make(signedRow({ documentEntity: "Requisition" })))).toBe("23514");
    expect(await refusal(make(signedRow({ documentId: "rq_1" })))).toBe("23514");
    expect(await refusal(make(signedRow({ documentEntity: " ", documentId: "rq_1" })))).toBe("23514");
    expect(await refusal(make(signedRow({ documentEntity: "Requisition", documentId: "" })))).toBe("23514");
  });

  it("holds a role to a code, never blank", async () => {
    expect(await refusal(make(signedRow({ roleCode: "KETUA_JABATAN" })))).toBeNull();
    expect(await refusal(make(signedRow({ roleCode: "  " })))).toBe("23514");
  });

  it("holds a back-dated act to a reason, an authoriser and a day together, on a signed act, the authoriser not the recorder", async () => {
    const dated = { effectiveOn: new Date("2026-09-30"), backdateReason: "Paper found again", backdateAuthorisedByPersonId: p2 };
    expect(await refusal(make(signedRow(dated)))).toBeNull();
    expect(await refusal(make(signedRow({ ...dated, backdateAuthorisedByPersonId: p1 })))).toBe("23514");
    expect(await refusal(make(signedRow({ ...dated, backdateReason: " " })))).toBe("23514");
    expect(await refusal(make(signedRow({ ...dated, backdateAuthorisedByPersonId: null })))).toBe("23514");
    expect(await refusal(make(signedRow({ ...dated, effectiveOn: null })))).toBe("23514");
    expect(await refusal(make({ ...fresh(), subjectPersonId: p1, recordedByPersonId: p2, mode: "RECORDED_ON_BEHALF", paperReference: "Minute 4", ...dated, backdateAuthorisedByPersonId: p1 }))).toBe("23514");
    // A reason with no authoriser is the same hole from the other side.
    expect(await refusal(make(signedRow({ backdateAuthorisedByPersonId: p2 })))).toBe("23514");
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
  // Changed in Phase 2b, to match the ruled decision, not weakened: a signature-class act names the exact document or record it signs (NFR-SIG-001), so the writer
  // tests that sign give it one. What the writer refuses without it is held by "refuses a signature that names no document" below.
  const base = () => ({ entity: "ApprovalStep", entityId: `step_${randomId()}`, slot: "decidedBy", document: { entity: "Requisition", id: `rq_${randomId()}` } });

  // Changed with the review of Phase 2a, to match the fix, not weakened: these tests handed the writer `new Date()` as the password stamp with no
  // `stepUp` ever asked. The writer now takes the stamp only from the session, so each signs in a session that was asked the password at that time.
  const signedWith = async (at: Date) => {
    const sessionId = await sessionAskedAt(at);
    return { ...base(), actor: actor({ sessionId }), subject: { kind: "PERSON" as const, personId: p1 }, mode: "SIGNED" as const, stepUpAt: at };
  };

  it("writes a signed act with the session and the password stamp, and nothing else is guessed", async () => {
    const at = new Date();
    const input = await signedWith(at);
    const row = await db.$transaction((tx) => attributeAct(tx, input));
    expect(row).toMatchObject({ organisationId, subjectPersonId: p1, recordedByPersonId: p1, recordedBySystemLabel: null, mode: "SIGNED", sessionId: input.actor.sessionId, occurrence: 1 });
    expect(row.stepUpAt?.getTime()).toBe(at.getTime());
  });

  it("refuses a stamp that is not the session's now: a stale one, a made-up time, and one for a session never asked", async () => {
    const asked = new Date(Date.now() - 3_600_000);
    const sessionId = await sessionAskedAt(asked);
    const subject = { kind: "PERSON" as const, personId: p1 };
    const stale = { ...base(), actor: actor({ sessionId }), subject, mode: "SIGNED" as const, stepUpAt: new Date(asked.getTime() - 60_000) };
    await expect(db.$transaction((tx) => attributeAct(tx, stale))).rejects.toMatchObject({ faults: [{ code: "STEP_UP_NOT_CURRENT" }] });
    const madeUp = { ...stale, stepUpAt: new Date() };
    await expect(db.$transaction((tx) => attributeAct(tx, madeUp))).rejects.toMatchObject({ faults: [{ code: "STEP_UP_NOT_CURRENT" }] });
    const neverAsked = { ...stale, actor: actor({ sessionId: await sessionAskedAt(null) }), stepUpAt: new Date() };
    await expect(db.$transaction((tx) => attributeAct(tx, neverAsked))).rejects.toMatchObject({ faults: [{ code: "STEP_UP_NOT_CURRENT" }] });
    const noSession = { ...stale, actor: actor({ sessionId: "sess_that_does_not_exist" }), stepUpAt: new Date() };
    await expect(db.$transaction((tx) => attributeAct(tx, noSession))).rejects.toMatchObject({ faults: [{ code: "STEP_UP_NOT_CURRENT" }] });
    for (const i of [stale, madeUp, neverAsked, noSession]) expect(await db.actAttribution.count({ where: { entityId: i.entityId } })).toBe(0);
  });

  it("refuses a stamp from a session that has ended", async () => {
    const input = await signedWith(new Date());
    await db.staffSession.update({ where: { id: input.actor.sessionId }, data: { revokedAt: new Date(), revokedReason: "SIGNED_OUT" } });
    await expect(db.$transaction((tx) => attributeAct(tx, input))).rejects.toMatchObject({ faults: [{ code: "STEP_UP_NOT_CURRENT" }] });
  });

  it("lets one password entry sign one act: the same stamp signs a second act no more", async () => {
    const input = await signedWith(new Date());
    await db.$transaction((tx) => attributeAct(tx, input));
    const second = { ...input, entityId: `step_${randomId()}` };
    await expect(db.$transaction((tx) => attributeAct(tx, second))).rejects.toMatchObject({ faults: [{ code: "STEP_UP_USED" }] });
    expect(await db.actAttribution.count({ where: { entityId: second.entityId } })).toBe(0);
  });

  it("lets two acts racing on one password entry sign one of them, the other refused", async () => {
    const input = await signedWith(new Date());
    const results = await Promise.allSettled([db.$transaction((tx) => attributeAct(tx, input)), db.$transaction((tx) => attributeAct(tx, { ...input, entityId: `step_${randomId()}` }))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(AttributionRefused);
    expect((refused.reason as AttributionRefused).faults[0].code).toBe("STEP_UP_USED");
  });

  it("writes a slot decided again as the next occurrence, keeps the first, and reads the latest as the one in force", async () => {
    const entityId = `var_${randomId()}`;
    const again = async () => {
      const input = { ...(await signedWith(new Date())), entity: "Variation", entityId, slot: "soDecidedBy" };
      return db.$transaction((tx) => attributeAct(tx, input));
    };
    const first = await again();
    const second = await again();
    expect([first.occurrence, second.occurrence]).toEqual([1, 2]);
    const rows = await db.actAttribution.findMany({ where: { entityId } });
    expect(rows).toHaveLength(2);
    expect(latestAttribution(rows)?.id).toBe(second.id);
  });

  it("refuses the second of two people acting on one slot at the same moment, with words, and writes one row", async () => {
    const entityId = `var_${randomId()}`;
    const mk = async () => ({ ...(await signedWith(new Date())), entity: "Variation", entityId, slot: "soDecidedBy" });
    const [a, b] = await Promise.all([mk(), mk()]);
    const results = await Promise.allSettled([db.$transaction((tx) => attributeAct(tx, a)), db.$transaction((tx) => attributeAct(tx, b))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((refused.reason as AttributionRefused).faults[0].code).toBe("ATTRIBUTION_CONFLICT");
    expect(await db.actAttribution.count({ where: { entityId } })).toBe(1);
  });

  it("refuses an act recorded on the recorder's own behalf, and writes nothing", async () => {
    await setPolicy(organisationId, { ...SETTINGS, paperSignatureRecording: "ALLOWED" });
    const input = { ...base(), actor: actor({ permissions: new Set<PermissionKey>(["acts.recordOnBehalf"]) }), subject: { kind: "PERSON" as const, personId: p1 }, mode: "RECORDED_ON_BEHALF" as const, paperReference: "Minute 9/2026" };
    await expect(db.$transaction((tx) => attributeAct(tx, input))).rejects.toMatchObject({ faults: [{ code: "ON_BEHALF_OF_SELF" }] });
    expect(await db.actAttribution.count({ where: { entityId: input.entityId } })).toBe(0);
  });

  it("refuses a signature that names no document, and one that names it blank, and writes nothing", async () => {
    const at = new Date();
    const sessionId = await sessionAskedAt(at);
    const input = { ...base(), actor: actor({ sessionId }), subject: { kind: "PERSON" as const, personId: p1 }, mode: "SIGNED" as const, stepUpAt: at };
    for (const document of [null, undefined, { entity: " ", id: "x" }, { entity: "Requisition", id: "" }]) {
      await expect(db.$transaction((tx) => attributeAct(tx, { ...input, document }))).rejects.toMatchObject({ faults: [{ code: "DOCUMENT_REQUIRED" }] });
    }
    expect(await db.actAttribution.count({ where: { entityId: input.entityId } })).toBe(0);
  });

  it("records the exact document a signature signed and the office the signer held", async () => {
    const at = new Date();
    const input = { ...(await signedWith(at)), roleCode: "KETUA_JABATAN" };
    const row = await db.$transaction((tx) => attributeAct(tx, input));
    expect(row).toMatchObject({ documentEntity: input.document.entity, documentId: input.document.id, roleCode: "KETUA_JABATAN", effectiveOn: null, backdateReason: "", backdateAuthorisedByPersonId: null });
  });

  it("records a back-dated signature as an exception: the day it is dated, why, and an authoriser who is not the recorder", async () => {
    const input = { ...(await signedWith(new Date())), effectiveOn: "2026-09-30", backdate: { reason: "The paper was lost and found again", authorisedByPersonId: p2 } };
    const row = await db.$transaction((tx) => attributeAct(tx, input));
    expect(row).toMatchObject({ mode: "SIGNED", backdateReason: "The paper was lost and found again", backdateAuthorisedByPersonId: p2 });
    expect(row.effectiveOn?.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("refuses back-dating that names the recorder as its authoriser, that has no reason, or that names no day, and writes nothing", async () => {
    const mk = async () => ({ ...(await signedWith(new Date())), effectiveOn: "2026-09-30" as string | null });
    const self = { ...(await mk()), backdate: { reason: "Late", authorisedByPersonId: p1 } };
    await expect(db.$transaction((tx) => attributeAct(tx, self))).rejects.toMatchObject({ faults: [{ code: "BACKDATE_SELF_AUTHORISED" }] });
    const noReason = { ...(await mk()), backdate: { reason: "  ", authorisedByPersonId: p2 } };
    await expect(db.$transaction((tx) => attributeAct(tx, noReason))).rejects.toMatchObject({ faults: [{ code: "BACKDATE_REASON_REQUIRED" }] });
    const noDay = { ...(await mk()), effectiveOn: null, backdate: { reason: "Late", authorisedByPersonId: p2 } };
    await expect(db.$transaction((tx) => attributeAct(tx, noDay))).rejects.toMatchObject({ faults: [{ code: "BACKDATE_NOT_SIGNED" }] });
    for (const i of [self, noReason, noDay]) expect(await db.actAttribution.count({ where: { entityId: i.entityId } })).toBe(0);
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
    const input = await signedWith(new Date());
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
