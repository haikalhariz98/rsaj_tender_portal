import { describe, expect, it } from "vitest";

import { demoIsLoaded, demoSignInDependents, demoSignInRefusal } from "../../../prisma/demo-sign-in";
import type { PrismaClient } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { makeAccount, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * What stops the demonstration's wipe, and what marks a database as holding it (Phase 1b review): a demo person who has a sign-in account, a code they
 * issued or a change they made on something that is not demo data cannot be removed, since the sign-in log and the trail are permanent. The wipe asks
 * first, so it never stops half way on the people. Each case has an organisation of its own.
 */

/// The demonstration's scripts take the plain client; the product's own omits some columns from its types (`@/lib/db`) and is the same connection.
const plain = db as unknown as PrismaClient;

async function organisation() {
  return db.organisation.create({ data: { code: `DEMO_${randomId()}`, name: "A demonstration database" } });
}

/// A person with a `demo_` id, as the demonstration loader makes them, and (optionally) a sign-in account, as `demo:accounts` makes it.
async function demoPerson(organisationId: string, name: string, withAccount: boolean) {
  const id = `demo_p${randomId()}`;
  const person = await db.person.create({ data: { id, organisationId, name } });
  if (!withAccount) return { person, loginName: null };
  const login = `demo.${randomId()}`;
  const made = await makeAccount(organisationId, { loginName: login });
  // makeAccount makes its own person: move the account onto the demo person (a scratch-database arrangement; the product never moves one).
  await db.staffAccount.update({ where: { id: made.account.id }, data: { personId: person.id } });
  return { person, loginName: login };
}

describe("the demonstration's marker", () => {
  it("is any organisation unit with a demo_ id", async () => {
    const org = await organisation();
    const before = await demoIsLoaded(plain);
    const unit = await db.orgUnit.create({ data: { id: `demo_ou${randomId()}`, organisationId: org.id, code: "DU", nameEn: "Demo unit", kind: "SECTION", effectiveFrom: new Date("2026-01-01") } });
    expect(await demoIsLoaded(plain)).toBe(true);
    await db.orgUnit.delete({ where: { id: unit.id } });
    expect(await demoIsLoaded(plain)).toBe(before);
  });
});

describe("what stops the demonstration's wipe", () => {
  it("lists a demo person's sign-in account, and says what it is and that nothing was removed", async () => {
    const org = await organisation();
    const { person, loginName } = await demoPerson(org.id, "Demo Officer", true);
    const lines = await demoSignInDependents(plain, org.id);
    expect(lines).toEqual([`  sign-in account "${loginName}" of Demo Officer, a demo person`]);
    expect(await db.person.count({ where: { id: person.id } })).toBe(1);
    expect(demoSignInRefusal(lines)).toMatch(/Refused whatever the flag[\s\S]*Demo Officer[\s\S]*Nothing was removed/);
  });

  it("lists a change a demo person made on something that is not demo data, and a code they issued, but not what they made on demo records", async () => {
    const org = await organisation();
    const { person } = await demoPerson(org.id, "Demo Approver", false);
    const actor = { kind: "STAFF" as const, personId: person.id, sessionId: "s", offices: [], sourceAddress: null };
    await db.$transaction(async (tx) => {
      await writeAudit(tx, { actor, organisationId: org.id, entity: "Person", entityId: "real_record", entityLabel: "A real record" }, "UPDATE", []);
      await writeAudit(tx, { actor, organisationId: org.id, entity: "Person", entityId: "demo_rq1", entityLabel: "A demo record" }, "UPDATE", []);
    });
    const other = await makeAccount(org.id);
    await db.oneTimeCode.create({
      data: { organisationId: org.id, store: "STAFF", staffAccountId: other.account.id, purpose: "ACTIVATION", codeHash: `h_${randomId()}${randomId()}`, expiresAt: new Date(Date.now() + 3600_000), issuedByPersonId: person.id, reason: "test" },
    });
    expect(await demoSignInDependents(plain, org.id)).toEqual([
      "  1 audit entry on records that are not demo data, made by Demo Approver, a demo person",
      "  1 one-time code issued by Demo Approver, a demo person",
    ]);
  });

  it("finds nothing for a person who is not the demonstration's, or a demo person who never signed in", async () => {
    const org = await organisation();
    await makeAccount(org.id);
    await demoPerson(org.id, "Demo Idle", false);
    expect(await demoSignInDependents(plain, org.id)).toEqual([]);
  });
});
