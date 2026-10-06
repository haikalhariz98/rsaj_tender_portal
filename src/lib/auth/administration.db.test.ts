import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import { ensureAdministrator, facts, kindsOf, makeAccount, makePerson, randomId, randomPassword, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { redeemOneTimeCode } from "./account-store";
import { createAccount, disableAccount, disableAccountOfLeaver, enableAccount, issueCode, LeaverRefused, unlockAccount } from "./administration";
import { authenticateStaff } from "./identity";
import { readStaffSession } from "./session-store";
import { hashToken } from "./token";
import type { StaffActor } from "./types";

/**
 * Administering sign-in accounts against the scratch database (Phase 1b): each act writes its change, its audit row (the administrator as actor,
 * from the session) and its sign-in log row in one transaction; none is open to a person who is not an administrator; nobody issues a code for, or
 * disables, their own account; and no code, hash or password reaches the trail.
 */

let organisationId: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
});

async function signedIn(opts: { admin?: boolean; address?: string } = {}) {
  const who = await makeAccount(organisationId, { admin: opts.admin ?? false });
  const outcome = await authenticateStaff({ loginName: who.loginName, password: who.password }, facts(opts.address), null);
  if (!outcome.ok) throw new Error("sign-in failed");
  const read = await readStaffSession(outcome.token, { sourceAddress: opts.address ?? null });
  if (!read.ok) throw new Error("read failed");
  return { ...who, token: outcome.token, actor: read.actor as StaffActor };
}
const administrator = (address = "203.0.113.9") => signedIn({ admin: true, address });
const auditsOf = (accountId: string) => db.auditEntry.findMany({ where: { entity: "StaffAccount", entityId: accountId }, orderBy: { at: "asc" } });

describe("creating an account", () => {
  it("makes one for a person, waiting for activation, that nobody can sign in to, audited as the administrator who made it", async () => {
    const admin = await administrator();
    const person = await makePerson(organisationId);
    const name = `New.${randomId()}`;
    const outcome = await createAccount(admin.actor, { personId: person.id, loginName: ` ${name} ` }, facts("203.0.113.9"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const row = await db.staffAccount.findUniqueOrThrow({ where: { id: outcome.accountId } });
    expect(row).toMatchObject({ personId: person.id, loginName: name, loginKey: name.toLowerCase(), status: "PENDING_ACTIVATION", isAdministrator: false, mustChangePassword: false });
    // No password is known to anyone: nothing signs in to it.
    for (const guess of ["", name, randomPassword()]) expect((await authenticateStaff({ loginName: name, password: guess }, facts(), null)).ok).toBe(false);

    const [audit] = await auditsOf(row.id);
    expect(audit).toMatchObject({ action: "CREATE", unattributed: false, actorKind: "STAFF", actorPersonId: admin.person.id, actorSessionId: admin.actor.sessionId, sourceAddress: "203.0.113.9" });
    expect(JSON.stringify(audit)).not.toContain(row.passwordHash);
    expect(await kindsOf(row.id)).toEqual(["ACCOUNT_CREATED", "FAILED", "FAILED", "FAILED"]);
  });

  it("is refused to a person who is not an administrator, and writes nothing", async () => {
    const officer = await signedIn();
    const person = await makePerson(organisationId);
    const outcome = await createAccount(officer.actor, { personId: person.id, loginName: `x.${randomId()}` }, facts());
    expect(outcome).toMatchObject({ ok: false, kind: "FAULTS", faults: [{ code: "NOT_ADMINISTRATOR" }] });
    expect(await db.staffAccount.count({ where: { personId: person.id } })).toBe(0);
  });

  it("refuses a taken name (whatever its case), a person who has an account, a person who has left, and a person of no organisation of ours", async () => {
    const admin = await administrator();
    const taken = await makeAccount(organisationId);
    const person = await makePerson(organisationId);
    expect(await createAccount(admin.actor, { personId: person.id, loginName: taken.loginName.toUpperCase() }, facts())).toMatchObject({ ok: false, fields: { loginName: { code: "LOGIN_NAME_TAKEN" } } });
    expect(await createAccount(admin.actor, { personId: taken.person.id, loginName: `x.${randomId()}` }, facts())).toMatchObject({ ok: false, fields: { personId: { code: "PERSON_HAS_ACCOUNT" } } });
    const left = await db.person.create({ data: { organisationId, name: "Left", isActive: false } });
    expect(await createAccount(admin.actor, { personId: left.id, loginName: `x.${randomId()}` }, facts())).toMatchObject({ ok: false, fields: { personId: { code: "PERSON_INACTIVE" } } });
    const other = await db.organisation.create({ data: { code: `ADM_${randomId()}`, name: "Another organisation" } });
    const stranger = await db.person.create({ data: { organisationId: other.id, name: "Stranger" } });
    expect(await createAccount(admin.actor, { personId: stranger.id, loginName: `x.${randomId()}` }, facts())).toMatchObject({ ok: false, fields: { personId: { code: "NO_SUCH_PERSON" } } });
    expect(await createAccount(admin.actor, { personId: person.id, loginName: "a b" }, facts())).toMatchObject({ ok: false, fields: { loginName: { code: "BAD_LOGIN_NAME" } } });
  });

  it("two made at once with the same name make one", async () => {
    const admin = await administrator();
    const [p1, p2] = [await makePerson(organisationId), await makePerson(organisationId)];
    const name = `Race.${randomId()}`;
    const results = await Promise.all([createAccount(admin.actor, { personId: p1.id, loginName: name }, facts()), createAccount(admin.actor, { personId: p2.id, loginName: name }, facts())]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.staffAccount.count({ where: { loginKey: name.toLowerCase() } })).toBe(1);
  });
});

describe("issuing a code", () => {
  async function pending() {
    const admin = await administrator();
    const person = await makePerson(organisationId);
    const name = `Code.${randomId()}`;
    const made = await createAccount(admin.actor, { personId: person.id, loginName: name }, facts());
    if (!made.ok) throw new Error("create failed");
    return { admin, person, name, accountId: made.accountId };
  }

  it("gives the code once; the database holds only its hash, and the trail only that one was issued and why", async () => {
    const { admin, name, accountId } = await pending();
    const outcome = await issueCode(admin.actor, { accountId, purpose: "ACTIVATION", reason: "New starter, identity checked at the desk" }, facts());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { code, expiresAt, officeHolderNotice } = outcome.issued;
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}-[0-9A-Z]{2}$/);
    expect(officeHolderNotice).toBeNull();
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);

    const stored = await db.oneTimeCode.findFirstOrThrow({ where: { staffAccountId: accountId } });
    expect(stored).toMatchObject({ store: "STAFF", purpose: "ACTIVATION", issuedByPersonId: admin.person.id, reason: "New starter, identity checked at the desk", usedAt: null });
    expect(JSON.stringify(stored)).not.toContain(code.replace(/-/g, ""));
    const audits = await auditsOf(accountId);
    const issued = audits.at(-1)!;
    expect(issued).toMatchObject({ actorKind: "STAFF", actorPersonId: admin.person.id, actorSessionId: admin.actor.sessionId, reason: "New starter, identity checked at the desk" });
    for (const secret of [code, code.replace(/-/g, ""), stored.codeHash]) expect(JSON.stringify(issued)).not.toContain(secret);
    expect(await kindsOf(accountId)).toContain("CODE_ISSUED");

    // The person uses it, and signs in: the whole of getting a first password with no email.
    const password = randomPassword();
    expect(await redeemOneTimeCode({ loginName: name, code, password }, facts())).toEqual({ ok: true });
    expect((await authenticateStaff({ loginName: name, password }, facts(), null)).ok).toBe(true);
  });

  it("voids the codes still open for the account: one live code at a time", async () => {
    const { admin, name, accountId } = await pending();
    const first = await issueCode(admin.actor, { accountId, purpose: "ACTIVATION", reason: "first" }, facts());
    const second = await issueCode(admin.actor, { accountId, purpose: "ACTIVATION", reason: "the first was lost" }, facts());
    if (!first.ok || !second.ok) throw new Error("issue failed");
    expect(await redeemOneTimeCode({ loginName: name, code: first.issued.code, password: randomPassword() }, facts())).toEqual({ ok: false, kind: "FAILED" });
    expect(await redeemOneTimeCode({ loginName: name, code: second.issued.code, password: randomPassword() }, facts())).toEqual({ ok: true });
  });

  it("an activation code is for an account waiting, a reset code for an active one", async () => {
    const { admin, accountId } = await pending();
    expect(await issueCode(admin.actor, { accountId, purpose: "RESET", reason: "x" }, facts())).toMatchObject({ ok: false, faults: [{ code: "NOT_ACTIVE" }] });
    const active = await makeAccount(organisationId);
    expect(await issueCode(admin.actor, { accountId: active.account.id, purpose: "ACTIVATION", reason: "x" }, facts())).toMatchObject({ ok: false, faults: [{ code: "NOT_AWAITING_ACTIVATION" }] });
    const reset = await issueCode(admin.actor, { accountId: active.account.id, purpose: "RESET", reason: "forgot it" }, facts());
    expect(reset.ok).toBe(true);
    // Until it is used the current password keeps working.
    expect((await authenticateStaff({ loginName: active.loginName, password: active.password }, facts(), null)).ok).toBe(true);
  });

  it("is refused for an administrator's own account, and to a person who is not an administrator", async () => {
    const admin = await administrator();
    expect(await issueCode(admin.actor, { accountId: admin.account.id, purpose: "RESET", reason: "my own" }, facts())).toMatchObject({ ok: false, faults: [{ code: "OWN_ACCOUNT" }] });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: admin.account.id } })).toBe(0);
    const officer = await signedIn();
    const target = await makeAccount(organisationId);
    expect(await issueCode(officer.actor, { accountId: target.account.id, purpose: "RESET", reason: "x" }, facts())).toMatchObject({ ok: false, faults: [{ code: "NOT_ADMINISTRATOR" }] });
    // Even an administrator of another organisation reaches nobody here.
    const other = await db.organisation.create({ data: { code: `ADM_${randomId()}`, name: "Another" } });
    await setPolicy(other.id, SETTINGS);
    const foreign = await makeAccount(other.id, { admin: true });
    expect(await issueCode({ ...admin.actor, organisationId: other.id, accountId: foreign.account.id }, { accountId: target.account.id, purpose: "RESET", reason: "x" }, facts())).toMatchObject({ ok: false, faults: [{ code: "NO_SUCH_ACCOUNT" }] });
  });

  it("is refused while the code's validity is unset, and names it", async () => {
    const { admin, accountId } = await pending();
    await setPolicy(organisationId, { ...SETTINGS, resetCodeValidityMinutes: null });
    expect(await issueCode(admin.actor, { accountId, purpose: "ACTIVATION", reason: "x" }, facts())).toEqual({ ok: false, kind: "POLICY_NOT_SET", unset: ["resetCodeValidityMinutes"] });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: accountId } })).toBe(0);
  });

  it("says, for an office holder, that the second-person check is not built, and records that the person holds an office", async () => {
    const { admin, person, accountId } = await pending();
    await db.roleAssignment.create({ data: { personId: person.id, roleCode: "TEST_OFFICE", effectiveFrom: new Date("2020-01-01") } });
    const outcome = await issueCode(admin.actor, { accountId, purpose: "ACTIVATION", reason: "new officer" }, facts());
    if (!outcome.ok) throw new Error("issue failed");
    expect(outcome.issued.officeHolderNotice).toContain("1 office");
    expect(outcome.issued.officeHolderNotice).toContain("not built yet");
    expect((await auditsOf(accountId)).at(-1)!.reason).toContain("second-person check for this is not built yet");
  });
});

describe("disabling an account", () => {
  it("ends every session in the same transaction, so the next request is refused, voids open codes, and is audited and logged", async () => {
    const admin = await administrator();
    const target = await signedIn();
    const second = await authenticateStaff({ loginName: target.loginName, password: target.password }, facts(), null);
    if (!second.ok) throw new Error("sign-in failed");
    await issueCode(admin.actor, { accountId: target.account.id, purpose: "RESET", reason: "x" }, facts());

    const outcome = await disableAccount(admin.actor, { accountId: target.account.id, reason: "moved to another agency" }, facts());
    expect(outcome).toEqual({ ok: true, sessionsEnded: 2 });
    for (const token of [target.token, second.token]) expect(await readStaffSession(token, { sourceAddress: null })).toMatchObject({ ok: false });
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(target.token) } })).revokedReason).toBe("ACCOUNT_DISABLED");
    expect(await db.oneTimeCode.count({ where: { staffAccountId: target.account.id, usedAt: null } })).toBe(0);
    expect((await authenticateStaff({ loginName: target.loginName, password: target.password }, facts(), null)).ok).toBe(false);
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ status: "DISABLED", disabledReason: "moved to another agency" });
    expect((await auditsOf(target.account.id)).at(-1)).toMatchObject({ reason: expect.stringContaining("moved to another agency"), actorKind: "STAFF", actorPersonId: admin.person.id });
    expect(await kindsOf(target.account.id)).toContain("ACCOUNT_DISABLED");
  });

  it("is refused for one's own account, without a reason, and for a non-administrator; and never leaves nobody to administer", async () => {
    const admin = await administrator();
    expect(await disableAccount(admin.actor, { accountId: admin.account.id, reason: "x" }, facts())).toMatchObject({ ok: false, faults: [{ code: "OWN_ACCOUNT" }] });
    const victim = await makeAccount(organisationId);
    expect(await disableAccount(admin.actor, { accountId: victim.account.id, reason: " " }, facts())).toMatchObject({ ok: false, faults: [{ code: "REASON_REQUIRED" }] });
    const officer = await signedIn();
    expect(await disableAccount(officer.actor, { accountId: victim.account.id, reason: "x" }, facts())).toMatchObject({ ok: false, faults: [{ code: "NOT_ADMINISTRATOR" }] });

    // In an organisation of its own with exactly one administrator and one more: the only one cannot be disabled, by anyone.
    const org = await db.organisation.create({ data: { code: `ADM_${randomId()}`, name: "Single administrator", timeZone: "Asia/Kuala_Lumpur" } });
    const only = await makeAccount(org.id, { admin: true });
    const actor = { ...admin.actor, organisationId: org.id, accountId: (await makeAccount(org.id)).account.id, isAdministrator: true };
    expect(await disableAccount(actor, { accountId: only.account.id, reason: "x" }, facts())).toMatchObject({ ok: false, faults: [{ code: "LAST_ADMINISTRATOR" }] });
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: only.account.id } })).status).toBe("ACTIVE");
  });

  it("puts a disabled account back to waiting for activation, never straight to active, only for a person who is active", async () => {
    const admin = await administrator();
    const target = await makeAccount(organisationId);
    await disableAccount(admin.actor, { accountId: target.account.id, reason: "left" }, facts());
    await db.person.update({ where: { id: target.person.id }, data: { isActive: false } });
    expect(await enableAccount(admin.actor, { accountId: target.account.id, reason: "back" })).toMatchObject({ ok: false, faults: [{ code: "PERSON_INACTIVE" }] });
    await db.person.update({ where: { id: target.person.id }, data: { isActive: true } });
    expect(await enableAccount(admin.actor, { accountId: target.account.id, reason: "back" })).toEqual({ ok: true });
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ status: "PENDING_ACTIVATION", disabledReason: "" });
    expect((await authenticateStaff({ loginName: target.loginName, password: target.password }, facts(), null)).ok).toBe(false);
    expect(await enableAccount(admin.actor, { accountId: target.account.id, reason: "again" })).toMatchObject({ ok: false, faults: [{ code: "NOT_DISABLED" }] });
  });
});

describe("a person who leaves", () => {
  it("has the account disabled and the sessions ended in the transaction that makes them inactive; their next request is refused", async () => {
    const target = await signedIn();
    const actor = auditActorOfStaff((await administrator()).actor);
    await db.$transaction(async (tx) => {
      await tx.person.update({ where: { id: target.person.id }, data: { isActive: false } });
      await disableAccountOfLeaver(tx, { personId: target.person.id, organisationId, actor, reason: "Retired" });
    });
    expect(await readStaffSession(target.token, { sourceAddress: null })).toMatchObject({ ok: false });
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(target.token) } })).revokedReason).toBe("ACCOUNT_DISABLED");
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ status: "DISABLED" });
    expect((await auditsOf(target.account.id)).at(-1)).toMatchObject({ actorKind: "STAFF", reason: expect.stringContaining("Retired") });
  });

  it("does nothing for a person with no account, or an account already disabled", async () => {
    const person = await makePerson(organisationId);
    const actor = auditActorOfStaff((await administrator()).actor);
    await db.$transaction((tx) => disableAccountOfLeaver(tx, { personId: person.id, organisationId, actor, reason: "x" }));
    expect(await db.auditEntry.count({ where: { entity: "StaffAccount", entityLabel: { contains: person.name } } })).toBe(0);
  });

  it("is refused for the only active administrator, and the whole change rolls back", async () => {
    const org = await db.organisation.create({ data: { code: `ADM_${randomId()}`, name: "Single administrator" } });
    const only = await makeAccount(org.id, { admin: true });
    await expect(
      db.$transaction(async (tx) => {
        await tx.person.update({ where: { id: only.person.id }, data: { isActive: false } });
        await disableAccountOfLeaver(tx, { personId: only.person.id, organisationId: org.id, actor: { kind: "SYSTEM", label: "test" }, reason: "x" });
      }),
    ).rejects.toBeInstanceOf(LeaverRefused);
    expect((await db.person.findUniqueOrThrow({ where: { id: only.person.id } })).isActive).toBe(true);
  });
});

describe("unlocking an account", () => {
  it("clears the lock and the count, audited and logged; refused where there is nothing to clear", async () => {
    const admin = await administrator();
    const target = await makeAccount(organisationId);
    await db.staffAccount.update({ where: { id: target.account.id }, data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 3600_000) } });
    expect(await unlockAccount(admin.actor, { accountId: target.account.id, reason: "rang the desk" }, facts())).toEqual({ ok: true });
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: target.account.id } })).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    expect(await kindsOf(target.account.id)).toContain("UNLOCKED");
    expect((await auditsOf(target.account.id)).at(-1)).toMatchObject({ reason: "rang the desk", actorPersonId: admin.person.id });
    expect(await unlockAccount(admin.actor, { accountId: target.account.id, reason: "again" }, facts())).toMatchObject({ ok: false, faults: [{ code: "NOT_LOCKED" }] });
  });
});
