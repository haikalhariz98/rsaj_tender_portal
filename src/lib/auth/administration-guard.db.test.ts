import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ensureAdministrator, makeAccount, makePerson, randomId, randomPassword, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { assertCanHold, HoldingRefused, holdingsOf, makeAdministratorConflict } from "./administration-guard";
import { bootstrapAdministrator } from "./bootstrap";

/**
 * Administration is kept apart from transactions (NFR-SEC-004, ADR 0034 D9, Phase 2a), against the scratch database: a Person who holds an office, a
 * seat or a delegation is not made an administrator, an administrator's Person is given none of them, and the two cannot both happen at once (the
 * Person's row is locked by each, so whichever takes it first is seen by the other).
 */

let organisationId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date("2026-10-07T04:00:00Z");

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  // The bootstrap command adds a second administrator only where one exists: a fresh scratch database has none until a test makes one.
  await ensureAdministrator(organisationId);
});

const code = () => `R_${randomId()}`;
const office = (personId: string, over: Record<string, unknown> = {}) => db.roleAssignment.create({ data: { personId, roleCode: code(), effectiveFrom: day("2020-01-01"), ...over } });
async function committee() {
  return db.committee.create({ data: { organisationId, code: `C_${randomId()}`, nameEn: "Test committee", mandate: "test", governingSource: "test" } });
}

describe("making a Person an administrator", () => {
  it("counts what the Person holds that has not ended: an office, a seat, a delegation as grantor or delegate", async () => {
    const p = await makePerson(organisationId);
    expect(await db.$transaction((tx) => holdingsOf(tx, p.id, NOW))).toEqual({ offices: 0, seats: 0, delegations: 0 });
    await office(p.id);
    const c = await committee();
    await db.committeeMember.create({ data: { committeeId: c.id, personId: p.id, effectiveFrom: day("2020-01-01") } });
    const other = await makePerson(organisationId);
    await db.delegation.create({ data: { organisationId, fromPersonId: p.id, toPersonId: other.id, roleCode: code(), capabilityCodes: [], effectiveFrom: day("2020-01-01") } });
    await db.delegation.create({ data: { organisationId, fromPersonId: other.id, toPersonId: p.id, roleCode: code(), capabilityCodes: [], effectiveFrom: day("2020-01-01") } });
    expect(await db.$transaction((tx) => holdingsOf(tx, p.id, NOW))).toEqual({ offices: 1, seats: 1, delegations: 2 });
  });

  it("does not count an office that has ended", async () => {
    const p = await makePerson(organisationId);
    await office(p.id, { effectiveTo: day("2021-01-01") });
    expect((await db.$transaction((tx) => holdingsOf(tx, p.id, NOW))).offices).toBe(0);
    expect(await db.$transaction((tx) => makeAdministratorConflict(tx, p.id, NOW))).toBeNull();
  });

  it("is refused for each kind of holding, and allowed for a Person who holds nothing", async () => {
    const clean = await makePerson(organisationId);
    expect(await db.$transaction((tx) => makeAdministratorConflict(tx, clean.id, NOW))).toBeNull();
    const withOffice = await makePerson(organisationId);
    await office(withOffice.id);
    expect((await db.$transaction((tx) => makeAdministratorConflict(tx, withOffice.id, NOW)))?.code).toBe("ADMINISTRATOR_HOLDS_NOTHING");
    const c = await committee();
    const withSeat = await makePerson(organisationId);
    await db.committeeMember.create({ data: { committeeId: c.id, personId: withSeat.id, effectiveFrom: day("2020-01-01") } });
    expect((await db.$transaction((tx) => makeAdministratorConflict(tx, withSeat.id, NOW)))?.code).toBe("ADMINISTRATOR_HOLDS_NOTHING");
  });

  it("is refused by the bootstrap command for a Person who holds an office, with the same words", async () => {
    const p = await makePerson(organisationId);
    await office(p.id);
    const result = await bootstrapAdministrator({
      organisationCode: "AUTH_TEST",
      mode: "ADDITIONAL",
      loginName: `boot.${randomId()}`,
      password: randomPassword(),
      person: { existingPersonId: p.id },
    });
    expect(result).toMatchObject({ ok: false, code: "PERSON_HOLDS_OFFICE" });
    expect(result.ok ? "" : result.message).toMatch(/An administrator holds no office, seat or delegation/);
    expect(await db.staffAccount.count({ where: { personId: p.id } })).toBe(0);
  });
});

describe("giving a holding to a Person whose account is an administrator's", () => {
  it("is refused for an office, a seat and a delegation, and nothing the transaction did is kept", async () => {
    const admin = await makeAccount(organisationId, { admin: true });
    for (const holding of ["OFFICE", "SEAT", "DELEGATION"] as const) {
      const failure = await db
        .$transaction(async (tx) => {
          await assertCanHold(tx, [admin.person.id], holding);
          await tx.roleAssignment.create({ data: { personId: admin.person.id, roleCode: code(), effectiveFrom: day("2020-01-01") } });
        })
        .then(() => null, (e: unknown) => e);
      expect(failure, holding).toBeInstanceOf(HoldingRefused);
      expect((failure as HoldingRefused).fault.code).toBe("ADMINISTRATOR_CANNOT_HOLD");
      expect((failure as HoldingRefused).personId).toBe(admin.person.id);
    }
    expect(await db.roleAssignment.count({ where: { personId: admin.person.id } })).toBe(0);
  });

  it("is refused for the delegate as for the grantor, and names which of the two it was", async () => {
    const admin = await makeAccount(organisationId, { admin: true });
    const plain = await makePerson(organisationId);
    for (const ids of [[plain.id, admin.person.id], [admin.person.id, plain.id]]) {
      const failure = await db.$transaction((tx) => assertCanHold(tx, ids, "DELEGATION")).then(() => null, (e: unknown) => e);
      expect((failure as HoldingRefused).personId).toBe(admin.person.id);
    }
  });

  it("is refused while the administrator's account is disabled: it can be enabled again (an open item, refused by default)", async () => {
    const admin = await makeAccount(organisationId, { admin: true, status: "DISABLED" });
    await expect(db.$transaction((tx) => assertCanHold(tx, [admin.person.id], "OFFICE"))).rejects.toBeInstanceOf(HoldingRefused);
  });

  it("is allowed to anyone else, including a Person with an ordinary account and a Person with none", async () => {
    const ordinary = await makeAccount(organisationId);
    const none = await makePerson(organisationId);
    await expect(db.$transaction((tx) => assertCanHold(tx, [ordinary.person.id, none.id], "OFFICE"))).resolves.toBeUndefined();
  });
});

describe("making an administrator and giving an office at the same moment", () => {
  it("never leaves one Person with both, whichever act wins the Person's lock", async () => {
    const pairs = Array.from({ length: 10 }, () => makePerson(organisationId));
    const people = await Promise.all(pairs);
    const outcomes = await Promise.all(
      people.flatMap((p) => [
        // The administrator grant: lock the Person, count what they hold, make the account.
        db
          .$transaction(async (tx) => {
            const conflict = await makeAdministratorConflict(tx, p.id, new Date());
            if (conflict) return "grant refused" as const;
            const loginName = `race.${randomId()}`;
            await tx.staffAccount.create({
              data: { organisationId, personId: p.id, loginName, loginKey: loginName, passwordHash: "x", passwordChangedAt: new Date(), isAdministrator: true, status: "ACTIVE" },
            });
            return "granted" as const;
          })
          .catch((e) => String(e)),
        // The office: lock the Person, ask whether they are an administrator, give it.
        db
          .$transaction(async (tx) => {
            await assertCanHold(tx, [p.id], "OFFICE");
            await tx.roleAssignment.create({ data: { personId: p.id, roleCode: code(), effectiveFrom: day("2020-01-01") } });
            return "given" as const;
          })
          .catch((e) => (e instanceof HoldingRefused ? ("office refused" as const) : String(e))),
      ]),
    );
    expect(outcomes.filter((o) => !["granted", "grant refused", "given", "office refused"].includes(o))).toEqual([]);
    for (const p of people) {
      const admin = await db.staffAccount.count({ where: { personId: p.id, isAdministrator: true } });
      const offices = await db.roleAssignment.count({ where: { personId: p.id } });
      expect(admin > 0 && offices > 0, `person ${p.id}: administrator ${admin}, offices ${offices}`).toBe(false);
    }
  });
});
