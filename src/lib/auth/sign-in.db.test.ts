import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { dummyHash } from "@/lib/auth/password";
import { ensureAdministrator, eventsOf, facts, kindsOf, makeAccount, makePerson, randomAddress, randomId, randomPassword, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

// Every check of a password goes through here, so a test can say which hash it was made against.
vi.mock("./password", async (importOriginal) => {
  const original = await importOriginal<typeof import("./password")>();
  return { ...original, verifyPassword: vi.fn(original.verifyPassword) };
});

import { authenticateStaff, confirmStaffPassword, signOutEverywhere } from "./identity";
import { verifyPassword } from "./password";
import { listOpenSessions, previousSignIn, readStaffSession, signOutToken } from "./session-store";
import { hashToken } from "./token";

const verify = vi.mocked(verifyPassword);
let organisationId: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});

beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
  verify.mockClear();
});

const signIn = (loginName: string, password: string, address = randomAddress(), replacing: string | null = null, now = new Date()) =>
  authenticateStaff({ loginName, password }, facts(address), replacing, now);

describe("sign-in", () => {
  it("signs in with the right name and password, makes a session, and reads back as the person", async () => {
    const { account, person, password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName.toUpperCase(), password);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.token).toHaveLength(43);
    expect(outcome.maxAgeSeconds).toBeGreaterThan(SETTINGS.staffAbsoluteMinutes! * 60 - 5);

    const read = await readStaffSession(outcome.token, { sourceAddress: "203.0.113.5" });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.actor).toMatchObject({ kind: "STAFF", accountId: account.id, personId: person.id, personName: person.name, isAdministrator: false, organisationId, sourceAddress: "203.0.113.5" });
    expect(read.actor.permissions.size).toBe(0);

    // The token is stored only as its hash.
    const row = await db.staffSession.findUniqueOrThrow({ where: { id: read.actor.sessionId } });
    expect(row.tokenHash).toBe(hashToken(outcome.token));
    expect(JSON.stringify(row)).not.toContain(outcome.token);
    expect(await kindsOf(account.id)).toEqual(["SIGNED_IN"]);
  });

  it("gives a new token at every sign-in and ends the session the browser already held (fixation)", async () => {
    const { password, loginName } = await makeAccount(organisationId);
    const first = await signIn(loginName, password);
    if (!first.ok) throw new Error("first sign-in failed");
    const second = await signIn(loginName, password, undefined, first.token);
    if (!second.ok) throw new Error("second sign-in failed");
    expect(second.token).not.toBe(first.token);
    expect(await readStaffSession(first.token, { sourceAddress: null })).toMatchObject({ ok: false, reason: "REVOKED" });
    expect((await readStaffSession(second.token, { sourceAddress: null })).ok).toBe(true);
    const old = await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(first.token) } });
    expect(old.revokedReason).toBe("REPLACED");
  });

  it("refuses a forged, malformed or missing cookie", async () => {
    expect(await readStaffSession(undefined, { sourceAddress: null })).toEqual({ ok: false, reason: "NO_TOKEN" });
    expect(await readStaffSession("not-a-token", { sourceAddress: null })).toEqual({ ok: false, reason: "NO_TOKEN" });
    expect(await readStaffSession("A".repeat(43), { sourceAddress: null })).toEqual({ ok: false, reason: "UNKNOWN" });
  });

  it("holds no address on the permanent row: the address and user agent are in the detail beside it", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    await signIn(loginName, password, "198.51.100.77");
    const [event] = await eventsOf(account.id);
    expect(Object.keys(event)).not.toContain("sourceAddress");
    expect(Object.keys(event)).not.toContain("userAgent");
    expect(event.detail).toMatchObject({ sourceAddress: "198.51.100.77", userAgent: "vitest" });
  });

  it("signs out: the session row is revoked, the cookie's token no longer reads, and the log says so once", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    await signOutToken(outcome.token, facts());
    await signOutToken(outcome.token, facts());
    expect(await readStaffSession(outcome.token, { sourceAddress: null })).toMatchObject({ ok: false, reason: "REVOKED" });
    const row = await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(outcome.token) } });
    expect(row.revokedReason).toBe("SIGNED_OUT");
    expect(await kindsOf(account.id)).toEqual(["SIGNED_IN", "SIGNED_OUT"]);
  });

  it("signs out everywhere: every session of the account ends", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const a = await signIn(loginName, password);
    const b = await signIn(loginName, password);
    if (!a.ok || !b.ok) throw new Error("sign-in failed");
    const read = await readStaffSession(a.token, { sourceAddress: null });
    if (!read.ok) throw new Error("read failed");
    expect(await signOutEverywhere(read.actor, facts())).toBe(2);
    expect((await readStaffSession(a.token, { sourceAddress: null })).ok).toBe(false);
    expect((await readStaffSession(b.token, { sourceAddress: null })).ok).toBe(false);
    expect(await db.staffSession.count({ where: { accountId: account.id, revokedAt: null } })).toBe(0);
  });
});

describe("session limits", () => {
  it("ends an idle session at the idle limit, and says so once", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const later = new Date(Date.now() + (SETTINGS.staffIdleMinutes! + 1) * 60_000);
    expect(await readStaffSession(outcome.token, { sourceAddress: null }, new Date(Date.now() + 60_000))).toMatchObject({ ok: true });
    expect(await readStaffSession(outcome.token, { sourceAddress: null }, later)).toEqual({ ok: false, reason: "IDLE" });
    // A page render cannot delete the cookie, so the next read finds the session revoked and writes nothing more.
    expect(await readStaffSession(outcome.token, { sourceAddress: null }, later)).toEqual({ ok: false, reason: "REVOKED" });
    expect((await kindsOf(account.id)).filter((k) => k === "IDLE_EXPIRED")).toHaveLength(1);
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(outcome.token) } })).revokedReason).toBe("IDLE");
  });

  it("ends a session at its absolute limit however recently it was used", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    await setPolicy(organisationId, { ...SETTINGS, staffIdleMinutes: 60, staffAbsoluteMinutes: 60 });
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const t = Date.now();
    expect((await readStaffSession(outcome.token, { sourceAddress: null }, new Date(t + 59 * 60_000))).ok).toBe(true);
    expect(await readStaffSession(outcome.token, { sourceAddress: null }, new Date(t + 61 * 60_000))).toEqual({ ok: false, reason: "ABSOLUTE" });
    expect(await kindsOf(account.id)).toContain("ABSOLUTE_EXPIRED");
  });

  it("refuses to read a session while the limits are unset, and does not end it", async () => {
    const { password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    await setPolicy(organisationId, { ...SETTINGS, staffIdleMinutes: null });
    expect(await readStaffSession(outcome.token, { sourceAddress: null })).toEqual({ ok: false, reason: "POLICY_NOT_SET" });
    await setPolicy(organisationId, SETTINGS);
    expect((await readStaffSession(outcome.token, { sourceAddress: null })).ok).toBe(true);
  });

  it("with REFUSE_NEW, refuses a sign-in at the limit and logs it, ending nothing", async () => {
    await setPolicy(organisationId, { ...SETTINGS, maxConcurrentSessions: 2, concurrentSessionAction: "REFUSE_NEW" });
    const { account, password, loginName } = await makeAccount(organisationId);
    const a = await signIn(loginName, password);
    const b = await signIn(loginName, password);
    const c = await signIn(loginName, password);
    expect(a.ok && b.ok).toBe(true);
    expect(c).toEqual({ ok: false, kind: "SESSION_LIMIT" });
    expect(await db.staffSession.count({ where: { accountId: account.id, revokedAt: null } })).toBe(2);
    expect(await kindsOf(account.id)).toEqual(["SIGNED_IN", "SIGNED_IN", "SESSION_LIMIT"]);
    // A refused session is not a wrong password: it does not count towards the address throttle or the lock.
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).failedAttempts).toBe(0);
  });

  it("with REVOKE_OLDEST, ends the oldest session to make room", async () => {
    await setPolicy(organisationId, { ...SETTINGS, maxConcurrentSessions: 2, concurrentSessionAction: "REVOKE_OLDEST" });
    const { account, password, loginName } = await makeAccount(organisationId);
    const a = await signIn(loginName, password, undefined, null, new Date(Date.now() - 3000));
    const b = await signIn(loginName, password, undefined, null, new Date(Date.now() - 2000));
    const c = await signIn(loginName, password, undefined, null, new Date(Date.now() - 1000));
    if (!a.ok || !b.ok || !c.ok) throw new Error("sign-in failed");
    expect((await readStaffSession(a.token, { sourceAddress: null })).ok).toBe(false);
    expect((await readStaffSession(b.token, { sourceAddress: null })).ok).toBe(true);
    expect((await readStaffSession(c.token, { sourceAddress: null })).ok).toBe(true);
    expect((await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(a.token) } })).revokedReason).toBe("CONCURRENT_LIMIT");
    expect((await listOpenSessions(account.id, organisationId, "none")).length).toBe(2);
  });
});

describe("what a stranger can tell", () => {
  it("answers an unknown name and a wrong password the same way, and checks a hash for each", async () => {
    const { password, loginName } = await makeAccount(organisationId);
    const dummy = await dummyHash();
    const unknown = await signIn(`nobody.${randomId()}`, password);
    const wrong = await signIn(loginName, randomPassword());
    expect(unknown).toEqual({ ok: false, kind: "FAILED" });
    expect(wrong).toEqual(unknown);
    expect(verify).toHaveBeenCalledTimes(2);
    // The unknown name was checked against the dummy hash; the wrong password against the account's own.
    expect(verify.mock.calls[0][0]).toBe(dummy);
    expect(verify.mock.calls[1][0]).not.toBe(dummy);
  });

  it("still checks a hash for a locked account, a disabled one and an inactive person, and answers the same", async () => {
    const dummy = await dummyHash();
    const disabled = await makeAccount(organisationId, { status: "DISABLED" });
    const inactive = await makeAccount(organisationId, { personActive: false });
    const locked = await makeAccount(organisationId);
    await db.staffAccount.update({ where: { id: locked.account.id }, data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) } });
    for (const who of [disabled, inactive, locked]) {
      verify.mockClear();
      // The right password: still refused, and still one check, against the dummy.
      expect(await signIn(who.loginName, who.password)).toEqual({ ok: false, kind: "FAILED" });
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify.mock.calls[0][0]).toBe(dummy);
    }
    expect(await kindsOf(locked.account.id)).toEqual(["LOCKED_OUT"]);
    expect(await kindsOf(disabled.account.id)).toEqual(["FAILED"]);
  });

  it("holds an address back before any hash is computed", async () => {
    await setPolicy(organisationId, { ...SETTINGS, addressThrottleAttempts: 3 });
    const { account, password, loginName } = await makeAccount(organisationId);
    const address = randomAddress();
    for (let i = 0; i < 3; i++) await signIn(`nobody.${randomId()}`, "whatever", address);
    verify.mockClear();
    // Even the right password, from that address now.
    expect(await signIn(loginName, password, address)).toEqual({ ok: false, kind: "FAILED" });
    expect(verify).not.toHaveBeenCalled();
    expect(await kindsOf(account.id)).toEqual(["THROTTLED"]);
    // Another address is not held back.
    expect((await signIn(loginName, password, randomAddress())).ok).toBe(true);
  });

  it("counts the address's failures from the database, and lets the address back in when the window ends", async () => {
    await setPolicy(organisationId, { ...SETTINGS, addressThrottleAttempts: 3, addressThrottleMinutes: 30 });
    const { password, loginName } = await makeAccount(organisationId);
    const address = randomAddress();
    const t0 = new Date();
    for (let i = 0; i < 3; i++) await signIn(`nobody.${randomId()}`, "whatever", address, null, t0);
    expect(await signIn(loginName, password, address, null, new Date(t0.getTime() + 29 * 60_000))).toEqual({ ok: false, kind: "FAILED" });
    expect((await signIn(loginName, password, address, null, new Date(t0.getTime() + 31 * 60_000))).ok).toBe(true);
  });

  it("does not throttle an address it does not know", async () => {
    await setPolicy(organisationId, { ...SETTINGS, addressThrottleAttempts: 1 });
    const { password, loginName } = await makeAccount(organisationId);
    for (let i = 0; i < 3; i++) await authenticateStaff({ loginName: `nobody.${randomId()}`, password: "x" }, facts(null), null);
    expect((await authenticateStaff({ loginName, password }, facts(null), null)).ok).toBe(true);
  });
});

describe("lockout", () => {
  it("locks an account at the limit, refuses even the right password while locked, and lets it in again when the window ends", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const t0 = new Date();
    for (let i = 0; i < SETTINGS.maxFailedAttempts!; i++) await signIn(loginName, randomPassword(), randomAddress(), null, t0);
    const locked = await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(locked.failedAttempts).toBe(5);
    expect(locked.lockedUntil?.getTime()).toBe(t0.getTime() + SETTINGS.lockoutMinutes! * 60_000);
    expect((await kindsOf(account.id)).slice(-2)).toEqual(["FAILED", "LOCKED_OUT"]);

    expect(await signIn(loginName, password, randomAddress(), null, new Date(t0.getTime() + 14 * 60_000))).toEqual({ ok: false, kind: "FAILED" });
    // A knock on a locked account does not extend the lock.
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).lockedUntil).toEqual(locked.lockedUntil);

    const back = await signIn(loginName, password, randomAddress(), null, new Date(t0.getTime() + 16 * 60_000));
    expect(back.ok).toBe(true);
    expect(await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });

  it("counts a good sign-in as the end of the run of failures", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    for (let i = 0; i < 3; i++) await signIn(loginName, randomPassword());
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).failedAttempts).toBe(3);
    expect((await signIn(loginName, password)).ok).toBe(true);
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).failedAttempts).toBe(0);
  });

  it("holds the limit under a burst of guesses at once: the count is taken under a row lock, so it does not run past the limit", async () => {
    const { account, loginName } = await makeAccount(organisationId);
    await Promise.all(Array.from({ length: 12 }, () => signIn(loginName, randomPassword())));
    const row = await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(row.failedAttempts).toBe(SETTINGS.maxFailedAttempts);
    expect(row.lockedUntil).not.toBeNull();
    expect((await kindsOf(account.id)).filter((k) => k === "LOCKED_OUT").length).toBeGreaterThanOrEqual(1);
  });
});

describe("policy", () => {
  it("refuses sign-in while a setting it needs is unset, and names it", async () => {
    const { password, loginName } = await makeAccount(organisationId);
    await setPolicy(organisationId, { ...SETTINGS, lockoutMinutes: null, concurrentSessionAction: null });
    expect(await signIn(loginName, password)).toEqual({ ok: false, kind: "POLICY_NOT_SET", unset: ["concurrentSessionAction", "lockoutMinutes"] });
    await setPolicy(organisationId, null);
    const none = await signIn(loginName, password);
    expect(none).toMatchObject({ ok: false, kind: "POLICY_NOT_SET" });
    expect(await db.staffSession.count({ where: { account: { loginKey: loginName.toLowerCase() } } })).toBe(0);
  });
});

describe("every request re-checks the account and the person", () => {
  it("ends the session at the next request when the person is made inactive, and says so in the log", async () => {
    const { account, person, password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    expect((await readStaffSession(outcome.token, { sourceAddress: null })).ok).toBe(true);
    await db.person.update({ where: { id: person.id }, data: { isActive: false } });
    expect(await readStaffSession(outcome.token, { sourceAddress: null })).toEqual({ ok: false, reason: "ACCOUNT_INACTIVE" });
    expect(await readStaffSession(outcome.token, { sourceAddress: null })).toEqual({ ok: false, reason: "REVOKED" });
    expect((await kindsOf(account.id)).filter((k) => k === "REVOKED")).toHaveLength(1);
  });

  it("ends the session at the next request when the account is disabled", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    await db.staffAccount.update({ where: { id: account.id }, data: { status: "DISABLED", disabledAt: new Date(), disabledReason: "test" } });
    expect(await readStaffSession(outcome.token, { sourceAddress: null })).toEqual({ ok: false, reason: "ACCOUNT_INACTIVE" });
  });

  it("reads the offices the person holds on the organisation's day, and none that have ended", async () => {
    const { person, password, loginName } = await makeAccount(organisationId);
    const day = new Date();
    await db.roleAssignment.createMany({
      data: [
        { personId: person.id, roleCode: "HELD", scope: null, effectiveFrom: new Date(day.getTime() - 86_400_000 * 30), effectiveTo: null },
        { personId: person.id, roleCode: "ENDED", scope: null, effectiveFrom: new Date(day.getTime() - 86_400_000 * 30), effectiveTo: new Date(day.getTime() - 86_400_000 * 2) },
        { personId: person.id, roleCode: "FUTURE", scope: null, effectiveFrom: new Date(day.getTime() + 86_400_000 * 30), effectiveTo: null },
      ],
    });
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const read = await readStaffSession(outcome.token, { sourceAddress: null });
    if (!read.ok) throw new Error("read failed");
    expect(read.actor.offices).toEqual([{ roleCode: "HELD", scope: null }]);
  });
});

describe("the password asked again", () => {
  it("counts a wrong one towards the lockout and logs it, and stamps the session on a right one", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const read = await readStaffSession(outcome.token, { sourceAddress: null });
    if (!read.ok) throw new Error("read failed");
    expect(await confirmStaffPassword(read.actor, randomPassword(), facts())).toEqual({ ok: false, kind: "WRONG" });
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).failedAttempts).toBe(1);
    const ok = await confirmStaffPassword(read.actor, password, facts());
    expect(ok.ok).toBe(true);
    expect((await db.staffSession.findUniqueOrThrow({ where: { id: read.actor.sessionId } })).stepUpAt).not.toBeNull();
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).failedAttempts).toBe(0);
    expect(await kindsOf(account.id)).toEqual(["SIGNED_IN", "STEP_UP_FAILED", "STEP_UP_OK"]);
  });

  it("locks the account after enough wrong ones, with no window to ride", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const read = await readStaffSession(outcome.token, { sourceAddress: null });
    if (!read.ok) throw new Error("read failed");
    for (let i = 0; i < SETTINGS.maxFailedAttempts!; i++) await confirmStaffPassword(read.actor, randomPassword(), facts());
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: account.id } })).lockedUntil).not.toBeNull();
    // Locked: even the right password is refused.
    expect(await confirmStaffPassword(read.actor, password, facts())).toEqual({ ok: false, kind: "LOCKED" });
  });
});

describe("the previous sign-in (the compensating control for the missing second factor)", () => {
  it("shows the sign-in before this one, from where, and the failures against the account since", async () => {
    const { account, password, loginName } = await makeAccount(organisationId);
    const t = Date.now();
    expect(await previousSignIn(account.id, new Date(t))).toEqual({ previous: null, failedSince: null });
    const first = await signIn(loginName, password, "198.51.100.10", null, new Date(t - 60_000));
    if (!first.ok) throw new Error("sign-in failed");
    await signIn(loginName, randomPassword(), "198.51.100.99", null, new Date(t - 40_000));
    await signIn(loginName, randomPassword(), "198.51.100.99", null, new Date(t - 30_000));
    const second = await signIn(loginName, password, "198.51.100.11", null, new Date(t));
    if (!second.ok) throw new Error("sign-in failed");
    const session = await db.staffSession.findUniqueOrThrow({ where: { tokenHash: hashToken(second.token) } });
    const shown = await previousSignIn(account.id, session.createdAt);
    expect(shown.previous).toEqual({ at: new Date(t - 60_000), sourceAddress: "198.51.100.10" });
    expect(shown.failedSince).toBe(2);
  });
});

describe("a person with no account of their own", () => {
  it("cannot sign in under another's name, and a sign-in name is unique whatever its case", async () => {
    const { loginName } = await makeAccount(organisationId);
    const person = await makePerson(organisationId);
    await expect(
      db.staffAccount.create({ data: { organisationId, personId: person.id, loginName: loginName.toUpperCase(), loginKey: loginName.toLowerCase(), passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } }),
    ).rejects.toThrow();
    // The key must be the lower-cased name: the database holds it.
    await expect(
      db.staffAccount.create({ data: { organisationId, personId: person.id, loginName: "Mixed.Case", loginKey: "Mixed.Case", passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } }),
    ).rejects.toThrow();
  });
});
