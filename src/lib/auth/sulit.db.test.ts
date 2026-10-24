import { beforeAll, describe, expect, it } from "vitest";

import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/lib/db";
import { applyAppRole } from "../../../scripts/db-role-apply";
import { makePerson, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { exerciseAccessFacts, exerciseHiddenFrom, hiddenExerciseIds, writeSulitEvents, type Viewer } from "./sulit-store";
import { SULIT_GRANT_BASES, SULIT_REFUSAL_BASES, NEVER_STORED_BASES } from "./sulit-access";
import type { StaffActor } from "./types";

/**
 * The SULIT access log and the restricted exercise, against the scratch database (ADR 0034 D14; Phase 3a): the table refuses what its CHECKs are
 * written to refuse, no login can change or remove an event, and the store judges who is named on an exercise from the rows themselves.
 *
 * Refusals are told apart by SQLSTATE: 23514 a CHECK, 23503 a foreign key, PA001 the append-only trigger, 42501 a missing privilege.
 */

const TEST_ROLE = "perolehan_app_test";

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

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
let organisationId = "";
let requisitionId = "";
const people: Record<"inCharge" | "participant" | "reviewer" | "team" | "panel" | "outsider" | "administrator", string> = { inCharge: "", participant: "", reviewer: "", team: "", panel: "", outsider: "", administrator: "" };
let openExerciseId = "";
let restrictedExerciseId = "";

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  for (const k of Object.keys(people) as (keyof typeof people)[]) people[k] = (await makePerson(organisationId, `SULIT ${k} ${randomId()}`)).id;
  const applied = await db.$transaction((tx) => applyAppRole(tx, { role: TEST_ROLE, password: null }));
  expect(applied.ok).toBe(true);

  const requestingPersonId = people.inCharge;
  requisitionId = (
    await db.requisition.create({
      data: {
        organisationId, reference: `SU/REQ/${randomId()}`, requestingUnitCode: "SU_UNIT", requestingPersonId, title: "SULIT test requisition", justification: "For the SULIT suite.", needStatement: "None.",
        costCentreCode: "SU_CC", accountCode: "SU_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
      },
    })
  ).id;
  const exercise = (restricted: boolean) =>
    db.sourcingExercise.create({
      data: {
        organisationId, reference: `SU/EX/${randomId()}`, requisitionId, title: "SULIT test exercise", estimatedValue: "1000.00", sourcingMethodCode: "SU_METHOD", restricted,
        personInChargeId: people.inCharge, proposalReviewerPersonId: people.reviewer,
      },
    });
  openExerciseId = (await exercise(false)).id;
  restrictedExerciseId = (await exercise(true)).id;
  await db.exerciseParticipant.create({ data: { exerciseId: restrictedExerciseId, personId: people.participant } });
});

const viewer = (personId: string, over: Partial<Viewer> = {}): Viewer => ({ organisationId, organisationCode: "AUTH_TEST", personId, isAdministrator: false, ...over });

describe("who is named on an exercise, read from its rows", () => {
  it("reads participants, the person in charge and the reviewer", async () => {
    const f = (await exerciseAccessFacts(db, organisationId, [restrictedExerciseId])).get(restrictedExerciseId)!;
    expect(f.restricted).toBe(true);
    expect(f.named.participantIds).toEqual([people.participant]);
    expect(f.named.personInChargeId).toBe(people.inCharge);
    expect(f.named.proposalReviewerId).toBe(people.reviewer);
  });
  it("another organisation's exercise is absent, so it reads as gone", async () => {
    const other = await db.organisation.upsert({ where: { code: "SULIT_OTHER" }, update: {}, create: { code: "SULIT_OTHER", name: "Other organisation" } });
    expect((await exerciseAccessFacts(db, other.id, [restrictedExerciseId])).size).toBe(0);
  });
});

describe("a restricted exercise is hidden from everyone not named on it (FR-MTD-007)", () => {
  it("the named are not hidden from it, in each of the ways of being named", async () => {
    for (const who of [people.participant, people.inCharge, people.reviewer]) {
      expect(await hiddenExerciseIds(db, viewer(who)), who).not.toContain(restrictedExerciseId);
      expect(await exerciseHiddenFrom(db, viewer(who), restrictedExerciseId)).toBe(false);
    }
  });
  it("someone not named is hidden from it, and from nothing else", async () => {
    expect(await hiddenExerciseIds(db, viewer(people.outsider))).toContain(restrictedExerciseId);
    expect(await hiddenExerciseIds(db, viewer(people.outsider))).not.toContain(openExerciseId);
    expect(await exerciseHiddenFrom(db, viewer(people.outsider), restrictedExerciseId)).toBe(true);
    expect(await exerciseHiddenFrom(db, viewer(people.outsider), openExerciseId)).toBe(false);
  });
  it("an administrator is hidden from it even when named", async () => {
    await db.exerciseParticipant.create({ data: { exerciseId: restrictedExerciseId, personId: people.administrator } });
    expect(await exerciseHiddenFrom(db, viewer(people.administrator, { isAdministrator: true }), restrictedExerciseId)).toBe(true);
    expect(await hiddenExerciseIds(db, viewer(people.administrator, { isAdministrator: true }))).toContain(restrictedExerciseId);
  });
  it("a loader run is hidden from nothing", async () => {
    expect(await hiddenExerciseIds(db, viewer("", { system: { label: "demo loader" } }))).toEqual([]);
  });
  it("an exercise that does not exist is not hidden: the caller's own not-found speaks", async () => {
    expect(await exerciseHiddenFrom(db, viewer(people.outsider), "no_such_exercise")).toBe(false);
  });
  it("naming the person later takes effect on the next read", async () => {
    expect(await exerciseHiddenFrom(db, viewer(people.team), restrictedExerciseId)).toBe(true);
    const evaluation = await db.evaluation.findFirst({ where: { exerciseId: restrictedExerciseId } });
    expect(evaluation).toBeNull();
    await db.exerciseParticipant.create({ data: { exerciseId: restrictedExerciseId, personId: people.team } });
    expect(await exerciseHiddenFrom(db, viewer(people.team), restrictedExerciseId)).toBe(false);
  });
});

const actorOf = (personId: string): StaffActor =>
  ({ kind: "STAFF", accountId: "a", sessionId: "s_1", personId, personName: "x", jobTitle: null, isAdministrator: false, organisationId, organisationCode: "AUTH_TEST", organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "198.51.100.7", mustChangePassword: false }) as StaffActor;

describe("the access log", () => {
  const row = (over: Record<string, unknown> = {}) => ({ organisationId, actorPersonId: people.outsider, scope: "exercise", entity: "SourcingExercise", entityId: "e1", entityLabel: "SU/EX/1", fields: ["estimatedValue"], outcome: "WITHHELD" as const, basis: "RESTRICTED_NOT_NAMED", ...over });
  const make = (data: Record<string, unknown>) => db.sulitAccessEvent.create({ data: data as Prisma.SulitAccessEventUncheckedCreateInput });

  it("writes an event from the store, with the actor, session and address", async () => {
    await writeSulitEvents(db, actorOf(people.outsider), [{ scope: "exercise", entity: "SourcingExercise", entityId: restrictedExerciseId, entityLabel: "SU/EX/1", fields: ["estimatedValue", "companyEstimate"], decision: { state: "WITHHELD", basis: "RESTRICTED_NOT_NAMED" } }]);
    const e = await db.sulitAccessEvent.findFirstOrThrow({ where: { entityId: restrictedExerciseId, actorPersonId: people.outsider }, orderBy: { at: "desc" } });
    expect(e).toMatchObject({ outcome: "WITHHELD", basis: "RESTRICTED_NOT_NAMED", actorSessionId: "s_1", sourceAddress: "198.51.100.7", fields: ["estimatedValue", "companyEstimate"] });
  });
  it("a loader run is written by its label, with no person", async () => {
    const system = { ...actorOf(""), system: { label: "demo loader" }, sessionId: "" } as StaffActor;
    await writeSulitEvents(db, system, [{ scope: "exercise", entity: "SourcingExercise", entityId: "e_sys", entityLabel: "", fields: ["record"], decision: { state: "WITHHELD", basis: "NOT_A_PERSON" } }]);
    const e = await db.sulitAccessEvent.findFirstOrThrow({ where: { entityId: "e_sys" } });
    expect(e).toMatchObject({ actorPersonId: null, actorSystemLabel: "demo loader", actorSessionId: null });
  });
  it("a list read is logged once for each person, record, kind and day; a single-record read every time", async () => {
    const ev = (entityId: string, over: Record<string, unknown> = {}) => ({ scope: "exercise" as const, entity: "SourcingExercise", entityId, entityLabel: "SU/EX/9", fields: ["estimatedValue"], decision: { state: "WITHHELD" as const, basis: "RESTRICTED_NOT_NAMED" as const }, ...over });
    const count = (entityId: string, personId = people.outsider) => db.sulitAccessEvent.count({ where: { entityId, actorPersonId: personId } });
    // Three visits to a list, one of them in the same batch twice: one row.
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_list")], { list: true });
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_list"), ev("e_list_2")], { list: true });
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_list")], { list: true });
    expect(await count("e_list")).toBe(1);
    expect(await count("e_list_2")).toBe(1);
    // Another person, another outcome or other fields is another kind of read; so is the same record read singly.
    await writeSulitEvents(db, actorOf(people.team), [ev("e_list")], { list: true });
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_list", { fields: ["companyEstimate"] })], { list: true });
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_list", { decision: { state: "WITHHELD", basis: "SEALED" } })], { list: true });
    expect(await count("e_list", people.team)).toBe(1);
    expect(await count("e_list")).toBe(3);
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_single")]);
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_single")]);
    expect(await count("e_single")).toBe(2);
    // A list read after a single read of the same record today is still its own row, and rows written before the day column existed are untouched (listDay null).
    await writeSulitEvents(db, actorOf(people.outsider), [ev("e_single")], { list: true });
    expect(await count("e_single")).toBe(3);
  });
  it("refuses a basis that is never stored, and an event that names no field, before the database", async () => {
    await expect(writeSulitEvents(db, actorOf(people.outsider), [{ scope: "exercise", entity: "X", entityId: "x", entityLabel: "", fields: ["a"], decision: { state: "WITHHELD", basis: "NOT_LOGGED" } }])).rejects.toThrow(/never stored/);
    await expect(writeSulitEvents(db, actorOf(people.outsider), [{ scope: "exercise", entity: "X", entityId: "x", entityLabel: "", fields: [], decision: { state: "WITHHELD", basis: "ADMINISTRATOR" } }])).rejects.toThrow(/names the fields/);
  });

  describe("the CHECKs", () => {
    it("accept every granting basis with GRANTED, and every refusing basis (but the one never stored) with WITHHELD", async () => {
      for (const basis of SULIT_GRANT_BASES) expect(await refusal(make(row({ outcome: "GRANTED", basis }))), basis).toBeNull();
      for (const basis of SULIT_REFUSAL_BASES.filter((b) => !NEVER_STORED_BASES.includes(b))) expect(await refusal(make(row({ basis }))), basis).toBeNull();
    });
    it("refuse a basis paired with the wrong outcome, an unknown basis, and a basis never stored", async () => {
      expect(await refusal(make(row({ outcome: "GRANTED", basis: "ADMINISTRATOR" })))).toBe("23514");
      expect(await refusal(make(row({ outcome: "WITHHELD", basis: "NAMED_ON_RECORD" })))).toBe("23514");
      expect(await refusal(make(row({ basis: "SOMETHING_ELSE" })))).toBe("23514");
      expect(await refusal(make(row({ basis: "NOT_LOGGED" })))).toBe("23514");
    });
    it("refuse an unknown scope and an empty field list", async () => {
      expect(await refusal(make(row({ scope: "everything" })))).toBe("23514");
      expect(await refusal(make(row({ fields: [] })))).toBe("23514");
    });
    it("refuse no actor, and two", async () => {
      expect(await refusal(make(row({ actorPersonId: null })))).toBe("23514");
      expect(await refusal(make(row({ actorSystemLabel: "demo loader" })))).toBe("23514");
    });
    it("refuse a person who is not on record", async () => {
      expect(await refusal(make(row({ actorPersonId: "nobody" })))).toBe("23503");
    });
  });

  describe("evidence", () => {
    it("the owner cannot change or delete an event, or truncate the table (PA001)", async () => {
      const e = await make(row({ entityId: "e_evidence" }));
      expect(await refusal(db.$executeRawUnsafe(`UPDATE "SulitAccessEvent" SET "basis" = 'ADMINISTRATOR' WHERE id = '${e.id}'`))).toBe("PA001");
      expect(await refusal(db.$executeRawUnsafe(`DELETE FROM "SulitAccessEvent" WHERE id = '${e.id}'`))).toBe("PA001");
      expect(await refusal(db.$executeRawUnsafe(`TRUNCATE "SulitAccessEvent"`))).toBe("PA001");
    });
    it("the app's login adds events and reads them, but is refused UPDATE, DELETE and TRUNCATE (42501)", async () => {
      expect(await refusal(asApp((tx) => tx.sulitAccessEvent.create({ data: row({ entityId: "e_app" }) as Prisma.SulitAccessEventUncheckedCreateInput })))).toBeNull();
      expect(await asApp((tx) => tx.sulitAccessEvent.count({ where: { entityId: "e_app" } }))).toBeGreaterThan(0);
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`UPDATE "SulitAccessEvent" SET "basis" = 'ADMINISTRATOR' WHERE "entityId" = 'e_app'`)))).toBe("42501");
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`DELETE FROM "SulitAccessEvent" WHERE "entityId" = 'e_app'`)))).toBe("42501");
      expect(await refusal(asApp((tx) => tx.$executeRawUnsafe(`TRUNCATE "SulitAccessEvent"`)))).toBe("42501");
    });
    it("the log outlives the person: a person with events cannot be deleted (23503)", async () => {
      const p = await makePerson(organisationId, `SULIT mortal ${randomId()}`);
      await make(row({ actorPersonId: p.id, entityId: "e_mortal" }));
      expect(await refusal(db.person.delete({ where: { id: p.id } }))).toBe("23503");
    });
  });
});

