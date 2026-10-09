import { describe, expect, it } from "vitest";

import { attempt, newAmbient } from "@/lib/ambient/ambient-tx";
import { db, savepointSql } from "@/lib/db";
import { makePerson, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { writeSulitEvents } from "./sulit-store";
import type { StaffActor } from "./types";

/**
 * A rehearsed or refused editor leaves its SULIT access rows (NFR-AUD-004, review of Phase 5), against the scratch database. A proposal runs the editor in a savepoint it always
 * rolls back, and an applied editor that refuses is rolled back too: the record that someone asked for a SULIT field and was told no must stay.
 */

describe("the SULIT access log under a rehearsal", () => {
  it("keeps the rows an editor wrote while it was rolled back, and keeps its own writes out", async () => {
    const org = await testOrganisation();
    const person = (await makePerson(org.id, `Reader ${randomId()}`)).id;
    const actor = { kind: "STAFF", accountId: "a", sessionId: "", personId: person, personName: "x", jobTitle: null, isAdministrator: false, organisationId: org.id, organisationCode: org.code, organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false } as unknown as StaffActor;
    const entityId = `rehearsal_${randomId()}`;
    const row = { scope: "exercise" as const, entity: "SourcingExercise", entityId, entityLabel: "SU/EX/9", fields: ["icNumber"], decision: { state: "WITHHELD" as const, basis: "RESTRICTED_NOT_NAMED" as const } };
    const marker = `Rehearsed ${randomId()}`;
    for (const keep of [false, true]) {
      await db.$transaction(async (tx) => {
        const ambient = newAmbient(tx, savepointSql(tx), keep ? "APPLY" : "REHEARSAL");
        const run = await attempt(ambient, async () => {
          await db.person.update({ where: { id: person }, data: { name: `${marker} ${keep ? "applied" : "rehearsed"}` } });
          // Through the proxy, as the editors and the loaders do.
          await writeSulitEvents(db, actor, [{ ...row, entityId: `${entityId}_${keep ? "kept" : "undone"}` }]);
          return keep;
        }, (result) => result);
        expect(run.kept).toBe(keep);
      });
    }
    expect((await db.person.findUniqueOrThrow({ where: { id: person } })).name).toBe(`${marker} applied`);
    // The editor's own write was undone in the rehearsal and stayed in the applied run; the access rows stayed in both.
    expect(await db.sulitAccessEvent.count({ where: { entityId: `${entityId}_undone`, actorPersonId: person, outcome: "WITHHELD" } })).toBe(1);
    expect(await db.sulitAccessEvent.count({ where: { entityId: `${entityId}_kept`, actorPersonId: person, outcome: "WITHHELD" } })).toBe(1);
  });

  it("keeps the rows of an editor that threw, and writes nothing twice", async () => {
    const org = await testOrganisation();
    const person = (await makePerson(org.id, `Reader ${randomId()}`)).id;
    const actor = { kind: "STAFF", accountId: "a", sessionId: "", personId: person, personName: "x", jobTitle: null, isAdministrator: false, organisationId: org.id, organisationCode: org.code, organisationTimeZone: null, offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false } as unknown as StaffActor;
    const entityId = `threw_${randomId()}`;
    await db.$transaction(async (tx) => {
      const ambient = newAmbient(tx, savepointSql(tx), "REHEARSAL");
      await expect(
        attempt(ambient, async () => {
          await writeSulitEvents(db, actor, [{ scope: "exercise", entity: "SourcingExercise", entityId, entityLabel: "", fields: ["icNumber"], decision: { state: "WITHHELD", basis: "RESTRICTED_NOT_NAMED" } }]);
          throw new Error("the editor failed");
        }, () => false),
      ).rejects.toThrow(/editor failed/);
    });
    expect(await db.sulitAccessEvent.count({ where: { entityId } })).toBe(1);
  });
});
