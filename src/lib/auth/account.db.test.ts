import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { ensureAdministrator, eventsOf, facts, kindsOf, makeAccount, randomAddress, randomId, randomPassword, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

// Every hash made goes through here, so a test can change the account at the moment its password is being hashed.
vi.mock("./password", async (importOriginal) => {
  const original = await importOriginal<typeof import("./password")>();
  return { ...original, hashPassword: vi.fn(original.hashPassword) };
});

import { hashPassword } from "./password";
import { acknowledgeResetNotice, changePassword, redeemOneTimeCode } from "./account-store";
import { codeExpiry, formatCode, generateCode, hashCode } from "./codes";
import { authenticateStaff } from "./identity";
import { readStaffSession } from "./session-store";
import { hashToken } from "./token";
import type { StaffActor } from "./types";

let organisationId: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
});

async function signedIn(account?: Awaited<ReturnType<typeof makeAccount>>) {
  const who = account ?? (await makeAccount(organisationId));
  const outcome = await authenticateStaff({ loginName: who.loginName, password: who.password }, facts(), null);
  if (!outcome.ok) throw new Error("sign-in failed");
  const read = await readStaffSession(outcome.token, { sourceAddress: null });
  if (!read.ok) throw new Error("read failed");
  return { ...who, token: outcome.token, actor: read.actor as StaffActor };
}

describe("changing the password", () => {
  it("asks for the current password, and a wrong one counts towards the lock and changes nothing", async () => {
    const me = await signedIn();
    const outcome = await changePassword(me.actor, { current: randomPassword(), next: randomPassword() }, facts());
    expect(outcome).toMatchObject({ ok: false, kind: "FIELDS", faults: { current: { code: "WRONG_CURRENT" } } });
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: me.account.id } })).failedAttempts).toBe(1);
    expect((await authenticateStaff({ loginName: me.loginName, password: me.password }, facts(), null)).ok).toBe(true);
  });

  it("holds the new password to the organisation's length, to the sign-in name and to being new", async () => {
    const me = await signedIn();
    const short = await changePassword(me.actor, { current: me.password, next: "short" }, facts());
    expect(short).toMatchObject({ ok: false, kind: "FIELDS", faults: { password: { code: "TOO_SHORT" } } });
    const same = await changePassword(me.actor, { current: me.password, next: me.password }, facts());
    expect(same).toMatchObject({ ok: false, kind: "FIELDS", faults: { password: { code: "SAME_AS_CURRENT" } } });
    const named = await changePassword(me.actor, { current: me.password, next: me.loginName.toUpperCase() }, facts());
    expect(named.ok).toBe(false);
  });

  it("refuses while the shortest password is unset, and names it", async () => {
    const me = await signedIn();
    await setPolicy(organisationId, { ...SETTINGS, passwordMinLength: null });
    expect(await changePassword(me.actor, { current: me.password, next: randomPassword() }, facts())).toEqual({ ok: false, kind: "POLICY_NOT_SET", unset: ["passwordMinLength"] });
  });

  it("changes it, ends every other session, gives this one a new token, and audits it without the password", async () => {
    const me = await signedIn();
    const other = await authenticateStaff({ loginName: me.loginName, password: me.password }, facts(), null);
    if (!other.ok) throw new Error("sign-in failed");
    const next = randomPassword();
    const outcome = await changePassword(me.actor, { current: me.password, next }, facts("203.0.113.7"));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.token).not.toBe(me.token);
    expect((await readStaffSession(me.token, { sourceAddress: null })).ok).toBe(false); // the old token died with the change
    expect((await readStaffSession(outcome.token, { sourceAddress: null })).ok).toBe(true);
    expect(await readStaffSession(other.token, { sourceAddress: null })).toMatchObject({ ok: false, reason: "REVOKED" });
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(other.token) } })).revokedReason).toBe("PASSWORD_CHANGED");

    expect((await authenticateStaff({ loginName: me.loginName, password: me.password }, facts(), null)).ok).toBe(false);
    expect((await authenticateStaff({ loginName: me.loginName, password: next }, facts(), null)).ok).toBe(true);

    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "StaffAccount", entityId: me.account.id, action: "UPDATE" }, orderBy: { at: "desc" } });
    expect(audit).toMatchObject({ unattributed: false, actorKind: "STAFF", actorPersonId: me.person.id, actorSessionId: me.actor.sessionId, sourceAddress: "203.0.113.7" });
    const text = JSON.stringify(audit);
    for (const secret of [me.password, next, me.token, outcome.token, hashToken(me.token), "$scrypt$"]) expect(text).not.toContain(secret);
    expect(await kindsOf(me.account.id)).toContain("PASSWORD_CHANGED");
  });
});

async function issueCode(accountId: string, purpose: "ACTIVATION" | "RESET", over: { expiresAt?: Date; usedAt?: Date | null } = {}) {
  const person = await db.person.create({ data: { organisationId, name: `Issuer ${randomId()}` } });
  const code = generateCode();
  await db.oneTimeCode.create({
    data: {
      organisationId,
      store: "STAFF",
      staffAccountId: accountId,
      purpose,
      codeHash: hashCode(code),
      expiresAt: over.expiresAt ?? codeExpiry(new Date(), 60),
      usedAt: over.usedAt ?? null,
      issuedByPersonId: person.id,
      reason: "test: identity checked at the counter",
    },
  });
  return formatCode(code);
}

describe("a one-time code", () => {
  it("activates an account: sets the password, makes it active, and cannot be used twice", async () => {
    const pending = await makeAccount(organisationId, { status: "PENDING_ACTIVATION" });
    const code = await issueCode(pending.account.id, "ACTIVATION");
    const password = randomPassword();
    expect(await redeemOneTimeCode({ loginName: pending.loginName, code, password }, facts())).toEqual({ ok: true });
    const row = await db.staffAccount.findUniqueOrThrow({ where: { id: pending.account.id } });
    expect(row).toMatchObject({ status: "ACTIVE", failedAttempts: 0, lockedUntil: null, resetNoticePending: false });
    expect((await authenticateStaff({ loginName: pending.loginName, password }, facts(), null)).ok).toBe(true);
    expect(await redeemOneTimeCode({ loginName: pending.loginName, code, password: randomPassword() }, facts())).toEqual({ ok: false, kind: "FAILED" });
    expect(await kindsOf(pending.account.id)).toEqual(expect.arrayContaining(["CODE_USED", "PASSWORD_CHANGED", "FAILED"]));
  });

  it("resets a locked account: clears the lock, ends every session, and leaves the notice to be shown at the next sign-in", async () => {
    const me = await signedIn();
    await db.staffAccount.update({ where: { id: me.account.id }, data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) } });
    const code = await issueCode(me.account.id, "RESET");
    const password = randomPassword();
    expect(await redeemOneTimeCode({ loginName: me.loginName.toUpperCase(), code: code.toLowerCase().replace(/-/g, " "), password }, facts())).toEqual({ ok: true });
    expect(await readStaffSession(me.token, { sourceAddress: null })).toMatchObject({ ok: false, reason: "REVOKED" });
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(me.token) } })).revokedReason).toBe("CODE_USED");
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: me.account.id } })).toMatchObject({ lockedUntil: null, failedAttempts: 0, resetNoticePending: true });

    const again = await authenticateStaff({ loginName: me.loginName, password }, facts(), null);
    expect(again).toMatchObject({ ok: true, resetNoticePending: true });
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "StaffAccount", entityId: me.account.id }, orderBy: { at: "desc" } });
    expect(audit).toMatchObject({ unattributed: false, actorKind: "STAFF", actorSessionId: null });
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain(code);
  });

  it("is refused, the same way, when expired, used, for another account, unknown, or malformed", async () => {
    const a = await makeAccount(organisationId);
    const b = await makeAccount(organisationId);
    const expired = await issueCode(a.account.id, "RESET", { expiresAt: new Date(Date.now() - 1000) });
    const used = await issueCode(a.account.id, "RESET", { usedAt: new Date() });
    const forB = await issueCode(b.account.id, "RESET");
    const refused = { ok: false, kind: "FAILED" };
    const password = randomPassword();
    expect(await redeemOneTimeCode({ loginName: a.loginName, code: expired, password }, facts())).toEqual(refused);
    expect(await redeemOneTimeCode({ loginName: a.loginName, code: used, password }, facts())).toEqual(refused);
    expect(await redeemOneTimeCode({ loginName: a.loginName, code: forB, password }, facts())).toEqual(refused);
    expect(await redeemOneTimeCode({ loginName: `nobody.${randomId()}`, code: forB, password }, facts())).toEqual(refused);
    expect(await redeemOneTimeCode({ loginName: a.loginName, code: formatCode(generateCode()), password }, facts())).toEqual(refused);
    expect(await redeemOneTimeCode({ loginName: a.loginName, code: "garbage", password }, facts())).toEqual(refused);
    // Nothing changed.
    expect((await authenticateStaff({ loginName: a.loginName, password: a.password }, facts(), null)).ok).toBe(true);
  });

  it("is refused for a disabled account and a person no longer active", async () => {
    const disabled = await makeAccount(organisationId, { status: "DISABLED" });
    const inactive = await makeAccount(organisationId, { personActive: false });
    for (const who of [disabled, inactive]) {
      const code = await issueCode(who.account.id, "RESET");
      expect(await redeemOneTimeCode({ loginName: who.loginName, code, password: randomPassword() }, facts())).toEqual({ ok: false, kind: "FAILED" });
    }
  });

  it("takes only one of two uses at once", async () => {
    const me = await makeAccount(organisationId);
    const code = await issueCode(me.account.id, "RESET");
    const results = await Promise.all([1, 2, 3].map(() => redeemOneTimeCode({ loginName: me.loginName, code, password: randomPassword() }, facts())));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.oneTimeCode.count({ where: { staffAccountId: me.account.id, usedAt: { not: null } } })).toBe(1);
  });

  it("voids every other code still open for the account when one is used, so a letter left over cannot be used later", async () => {
    const pending = await makeAccount(organisationId, { status: "PENDING_ACTIVATION" });
    const first = await issueCode(pending.account.id, "ACTIVATION");
    const second = await issueCode(pending.account.id, "ACTIVATION");
    const reset = await issueCode(pending.account.id, "RESET");
    const password = randomPassword();
    expect(await redeemOneTimeCode({ loginName: pending.loginName, code: second, password }, facts())).toEqual({ ok: true });
    expect(await db.oneTimeCode.count({ where: { staffAccountId: pending.account.id, usedAt: null } })).toBe(0);
    for (const code of [first, reset]) expect(await redeemOneTimeCode({ loginName: pending.loginName, code, password: randomPassword() }, facts())).toEqual({ ok: false, kind: "FAILED" });
    expect((await authenticateStaff({ loginName: pending.loginName, password }, facts(), null)).ok).toBe(true);
  });

  it("does not let an activation code set the password of an account that is already active, and leaves that code unused", async () => {
    const me = await makeAccount(organisationId);
    const code = await issueCode(me.account.id, "ACTIVATION");
    expect(await redeemOneTimeCode({ loginName: me.loginName, code, password: randomPassword() }, facts())).toEqual({ ok: false, kind: "FAILED" });
    expect((await authenticateStaff({ loginName: me.loginName, password: me.password }, facts(), null)).ok).toBe(true);
  });

  it("judges the account again under its lock: one disabled while the new password was being hashed is not re-enabled, and the code is not spent", async () => {
    const me = await makeAccount(organisationId);
    const code = await issueCode(me.account.id, "RESET");
    const original = await vi.importActual<typeof import("./password")>("./password");
    vi.mocked(hashPassword).mockImplementationOnce(async (password) => {
      await db.staffAccount.update({ where: { id: me.account.id }, data: { status: "DISABLED", disabledAt: new Date(), disabledReason: "test" } });
      return original.hashPassword(password);
    });
    expect(await redeemOneTimeCode({ loginName: me.loginName, code, password: randomPassword() }, facts())).toEqual({ ok: false, kind: "FAILED" });
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: me.account.id } })).status).toBe("DISABLED");
    expect((await db.oneTimeCode.findUniqueOrThrow({ where: { codeHash: hashCode(code.replace(/-/g, "")) } })).usedAt).toBeNull();
  });

  it("holds the new password to the rules and leaves the code unused when it is not good enough", async () => {
    const me = await makeAccount(organisationId);
    const code = await issueCode(me.account.id, "RESET");
    expect(await redeemOneTimeCode({ loginName: me.loginName, code, password: "short" }, facts())).toMatchObject({ ok: false, kind: "FIELDS", faults: { password: { code: "TOO_SHORT" } } });
    expect((await db.oneTimeCode.findUniqueOrThrow({ where: { codeHash: hashCode(code.replace(/-/g, "")) } })).usedAt).toBeNull();
    expect(await redeemOneTimeCode({ loginName: me.loginName, code, password: randomPassword() }, facts())).toEqual({ ok: true });
  });

  it("counts failed uses towards the address throttle, and holds the address back", async () => {
    await setPolicy(organisationId, { ...SETTINGS, addressThrottleAttempts: 3 });
    const me = await makeAccount(organisationId);
    const code = await issueCode(me.account.id, "RESET");
    const address = randomAddress();
    for (let i = 0; i < 3; i++) await redeemOneTimeCode({ loginName: me.loginName, code: formatCode(generateCode()), password: randomPassword() }, facts(address));
    expect(await redeemOneTimeCode({ loginName: me.loginName, code, password: randomPassword() }, facts(address))).toEqual({ ok: false, kind: "FAILED" });
    expect((await eventsOf(me.account.id)).map((e) => e.kind)).toContain("THROTTLED");
  });

  it("is refused while the settings it needs are unset", async () => {
    await setPolicy(organisationId, { ...SETTINGS, resetCodeValidityMinutes: null, passwordMinLength: null });
    const me = await makeAccount(organisationId);
    const code = await issueCode(me.account.id, "RESET");
    expect(await redeemOneTimeCode({ loginName: me.loginName, code, password: randomPassword() }, facts())).toEqual({ ok: false, kind: "POLICY_NOT_SET", unset: ["passwordMinLength"] });
  });
});

describe("the reset notice", () => {
  it("is said until it is acknowledged, and the acknowledgement is audited", async () => {
    const me = await signedIn();
    await db.staffAccount.update({ where: { id: me.account.id }, data: { resetNoticePending: true } });
    await acknowledgeResetNotice(me.actor, facts());
    await acknowledgeResetNotice(me.actor, facts());
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: me.account.id } })).resetNoticePending).toBe(false);
    expect(await db.auditEntry.count({ where: { entity: "StaffAccount", entityId: me.account.id, reason: { contains: "acknowledged" } } })).toBe(1);
  });
});

describe("the audit CHECK", () => {
  it("holds actorKind null to mean unattributed, and exactly one actor reference to match the kind", async () => {
    const insert = (data: Record<string, unknown>) =>
      db.auditEntry.create({ data: { organisationId, entity: "T", entityId: "t", entityLabel: "t", action: "CREATE", changes: [], ...data } as never });
    const person = await db.person.create({ data: { organisationId, name: "Check person" } });
    await expect(insert({ unattributed: true, actorKind: "STAFF", actorPersonId: person.id })).rejects.toThrow();
    await expect(insert({ unattributed: false })).rejects.toThrow();
    await expect(insert({ unattributed: false, actorKind: "STAFF" })).rejects.toThrow();
    await expect(insert({ unattributed: false, actorKind: "SYSTEM", actorSystemLabel: "x", actorPersonId: person.id })).rejects.toThrow();
    await expect(insert({ unattributed: false, actorKind: "SUPPLIER", actorPersonId: person.id })).rejects.toThrow();
    await expect(insert({ unattributed: true, actorPersonId: person.id })).rejects.toThrow();
    await expect(insert({ unattributed: false, actorKind: "STAFF", actorPersonId: person.id })).resolves.toBeTruthy();
    await expect(insert({ unattributed: false, actorKind: "SYSTEM", actorSystemLabel: "demo loader" })).resolves.toBeTruthy();
    await expect(insert({})).resolves.toBeTruthy();
  });
});
