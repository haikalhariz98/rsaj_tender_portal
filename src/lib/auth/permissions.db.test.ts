import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { authenticateStaff } from "@/lib/auth/identity";
import { ensureAdministrator, facts, makeAccount, makePerson, randomId, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { explainRefusal } from "./permission-store";
import { readStaffSession } from "./session-store";
import type { PermissionKey, StaffActor } from "./types";

/**
 * Product permissions read for a signed-in person (ADR 0034 D8, Phase 2a), against the scratch database: from the administrator flag, from the
 * offices held on the organisation's today and the grants to their roles, and on every request, so a grant or an office that ends takes effect at
 * the next one. A delegation carries none; a stored row for an administrator-only key is ignored; no time zone means no office is claimed.
 */

let organisationId: string;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const roleCode = () => `R_${randomId()}`;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
});
afterAll(async () => {
  await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
});

async function actorOf(opts: { admin?: boolean } = {}) {
  const who = await makeAccount(organisationId, { admin: opts.admin ?? false });
  const outcome = await authenticateStaff({ loginName: who.loginName, password: who.password }, facts(), null);
  if (!outcome.ok) throw new Error("sign-in failed");
  return { ...who, token: outcome.token, read: async () => ((await readStaffSession(outcome.token, { sourceAddress: null })) as { ok: true; actor: StaffActor }).actor };
}

const hold = (personId: string, code: string, over: Partial<{ scope: string | null; effectiveFrom: Date; effectiveTo: Date | null }> = {}) =>
  db.roleAssignment.create({ data: { personId, roleCode: code, effectiveFrom: day("2020-01-01"), ...over } });
const decide = (key: string, code: string, decision: "GRANTED" | "WITHHELD") => db.rolePermission.create({ data: { organisationId, permissionKey: key, roleCode: code, decision } });
const held = (actor: StaffActor) => [...actor.permissions].sort();

describe("what a signed-in person holds", () => {
  it("holds nothing with no office, and an administrator holds what the flag confers and no granted-only key", async () => {
    const plain = await actorOf();
    expect(held(await plain.read())).toEqual([]);
    const admin = await actorOf({ admin: true });
    expect(held(await admin.read())).toEqual(["accounts.manage", "audit.read", "configuration.draft", "configuration.issue", "permissions.grant", "security.policy"]);
  });

  it("holds a key through an office whose role the organisation has granted it, and refuses it once the grant is withheld", async () => {
    const code = roleCode();
    const who = await actorOf();
    await hold(who.person.id, code);
    expect(held(await who.read())).toEqual([]);
    const row = await decide("audit.read", code, "GRANTED");
    expect(held(await who.read())).toEqual(["audit.read"]);
    await db.rolePermission.update({ where: { id: row.id }, data: { decision: "WITHHELD" } });
    expect(held(await who.read())).toEqual([]);
  });

  it("loses a key the day the office ends, and has not got it before the office begins", async () => {
    const code = roleCode();
    await decide("sulit.read.organisation", code, "GRANTED");
    const ended = await actorOf();
    await hold(ended.person.id, code, { effectiveTo: day("2020-06-01") });
    expect(held(await ended.read())).toEqual([]);
    const future = await actorOf();
    await hold(future.person.id, code, { effectiveFrom: day("2999-01-01") });
    expect(held(await future.read())).toEqual([]);
  });

  it("is given nothing by a delegation: it carries approval authority only", async () => {
    const code = roleCode();
    await decide("audit.read", code, "GRANTED");
    const grantor = await makePerson(organisationId);
    await hold(grantor.id, code);
    const delegate = await actorOf();
    await db.delegation.create({ data: { organisationId, fromPersonId: grantor.id, toPersonId: delegate.person.id, roleCode: code, capabilityCodes: [], effectiveFrom: day("2020-01-01") } });
    expect(held(await delegate.read())).toEqual([]);
  });

  it("is given nothing by a stored row for an administrator-only key or a key that is not on the list", async () => {
    const code = roleCode();
    await decide("accounts.manage", code, "GRANTED");
    await decide("everything.all", code, "GRANTED");
    const who = await actorOf();
    await hold(who.person.id, code);
    expect(held(await who.read())).toEqual([]);
  });

  it("is given no permission through an office that is held only for a department", async () => {
    const code = roleCode();
    await decide("audit.read", code, "GRANTED");
    const who = await actorOf();
    await hold(who.person.id, code, { scope: "FIN" });
    expect(held(await who.read())).toEqual([]);
  });

  it("is given no permission through an office where the organisation has no time zone, so today is not known", async () => {
    const code = roleCode();
    await decide("audit.read", code, "GRANTED");
    const who = await actorOf();
    await hold(who.person.id, code);
    expect(held(await who.read())).toEqual(["audit.read"]);
    await db.organisation.update({ where: { id: organisationId }, data: { timeZone: null } });
    try {
      const actor = await who.read();
      expect(held(actor)).toEqual([]);
      expect(actor.offices).toEqual([]);
      expect(held(await (await actorOf({ admin: true })).read())).toContain("accounts.manage");
    } finally {
      await db.organisation.update({ where: { id: organisationId }, data: { timeZone: "Asia/Kuala_Lumpur" } });
    }
  });

  it("refuses a key GRANTED on one held role and WITHHELD on another", async () => {
    const a = roleCode();
    const b = roleCode();
    await decide("audit.read", a, "GRANTED");
    await decide("audit.read", b, "WITHHELD");
    const who = await actorOf();
    await hold(who.person.id, a);
    await hold(who.person.id, b);
    expect(held(await who.read())).toEqual([]);
  });
});

describe("why a person is refused, in words", () => {
  const explain = (actor: StaffActor, key: PermissionKey) =>
    explainRefusal(db, { organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, key);

  it("says the organisation has not decided, where it has not, and names the role as the organisation names it where it has withheld", async () => {
    const code = roleCode();
    await db.authorityRole.create({ data: { organisationId, code, nameEn: "Finance Director (test)", nameMs: "Pengarah Kewangan (ujian)" } });
    const who = await actorOf();
    await hold(who.person.id, code);
    const undecided = await explain(await who.read(), "audit.read");
    expect(undecided.state).toEqual({ state: "UNDECIDED" });
    expect(undecided.words.en).toMatch(/not yet decided/);
    await decide("audit.read", code, "WITHHELD");
    const withheld = await explain(await who.read(), "audit.read");
    expect(withheld.words.en).toContain("withheld it from Finance Director (test)");
    expect(withheld.words.en).not.toContain(code);
  });
});
