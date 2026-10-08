import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ensureAdministrator, facts, makeAccount, makePerson, randomAddress, randomId, randomPassword, setPolicy, SETTINGS, SUPPLIER_SETTINGS, makeSupplierAccount, supplierEventsOf, supplierKindsOf, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { STAFF_FIXTURE } from "@/lib/test-support/staff";

import { codeExpiry, formatCode, generateCode, hashCode } from "./codes";
import { authenticateStaff } from "./identity";
import { hashPassword } from "./password";
import { acknowledgeSupplierResetNotice, changeSupplierPassword, redeemSupplierCode } from "./supplier-account-store";
import { disableAccountOfRetiredContact, issueSupplierCode, LoginNameTaken, openSupplierAccount, unlockSupplierAccount } from "./supplier-administration";
import { authenticateSupplier, confirmSupplierPassword, supplierSignOutEverywhere } from "./supplier-identity";
import { listOpenSupplierSessions, previousSupplierSignIn, readSupplierSession, signOutSupplierToken } from "./supplier-session-store";
import { readStaffSession } from "./session-store";
import { hashToken } from "./token";
import type { StaffActor } from "./types";

/**
 * The supplier store against a real database (Phase 4a): sign-in, the session read and its re-checks, lockout and the address throttle, the password asked again, a one-time code
 * used once and only at its own door, the password changed, an officer opening an account and issuing codes, and retiring a contact. And the two stores kept apart.
 */

let organisationId: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});

beforeEach(async () => {
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  await ensureAdministrator(organisationId);
});

const signIn = (loginName: string, password: string, address = randomAddress(), replacing: string | null = null, now = new Date()) => authenticateSupplier({ loginName, password }, facts(address), replacing, now);
const read = (token: string, now = new Date()) => readSupplierSession(token, { sourceAddress: "203.0.113.9" }, now);

/// An officer who holds the permission to manage supplier accounts, as a signed-in actor.
async function officer(permitted = true): Promise<StaffActor> {
  const person = await makePerson(organisationId, `Officer ${randomId()}`);
  return { ...STAFF_FIXTURE, personId: person.id, personName: person.name, organisationId, organisationTimeZone: "Asia/Kuala_Lumpur", permissions: new Set(permitted ? ["supplierAccounts.manage"] : []) };
}

describe("a supplier signs in", () => {
  it("makes a session with the SUPPLIER's timeouts, and reads back as the account's supplier", async () => {
    const { account, supplier, contact, password, loginName } = await makeSupplierAccount(organisationId);
    const outcome = await signIn(loginName.toUpperCase(), password);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.token).toHaveLength(43);
    expect(outcome.maxAgeSeconds).toBeGreaterThan(SUPPLIER_SETTINGS.supplierAbsoluteMinutes! * 60 - 5);
    expect(outcome.maxAgeSeconds).toBeLessThanOrEqual(SUPPLIER_SETTINGS.supplierAbsoluteMinutes! * 60);

    const session = await read(outcome.token);
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.actor).toMatchObject({ kind: "SUPPLIER", accountId: account!.id, contactId: contact.id, supplierId: supplier.id, supplierName: supplier.registeredName, organisationId, loginName, sourceAddress: "203.0.113.9" });
    const row = await db.supplierSession.findUniqueOrThrow({ where: { id: session.actor.sessionId } });
    expect(row.tokenHash).toBe(hashToken(outcome.token));
    expect(JSON.stringify(row)).not.toContain(outcome.token);
    // The log is the supplier store's, and carries no address on the permanent row.
    const [event] = await supplierEventsOf(account!.id);
    expect(event).toMatchObject({ store: "SUPPLIER", kind: "SIGNED_IN", staffAccountId: null, supplierAccountId: account!.id });
    expect(Object.keys(event)).not.toContain("sourceAddress");
  });

  it("gives a new token at every sign-in and ends the session the browser already held (fixation)", async () => {
    const { password, loginName } = await makeSupplierAccount(organisationId);
    const first = await signIn(loginName, password);
    if (!first.ok) throw new Error("first sign-in failed");
    const second = await signIn(loginName, password, undefined, first.token);
    if (!second.ok) throw new Error("second sign-in failed");
    expect(second.token).not.toBe(first.token);
    expect(await read(first.token)).toMatchObject({ ok: false, reason: "REVOKED" });
    expect((await read(second.token)).ok).toBe(true);
    expect((await db.supplierSession.findUniqueOrThrow({ where: { tokenHash: hashToken(first.token) } })).revokedReason).toBe("REPLACED");
  });

  it("ends an idle session at the supplier's idle limit and an old one at the supplier's absolute limit", async () => {
    const { password, loginName } = await makeSupplierAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    expect(await read(outcome.token, new Date(Date.now() + 60_000))).toMatchObject({ ok: true });
    expect(await read(outcome.token, new Date(Date.now() + (SUPPLIER_SETTINGS.supplierIdleMinutes! + 2) * 60_000))).toMatchObject({ ok: false, reason: "IDLE" });
    const other = await signIn(loginName, password);
    if (!other.ok) throw new Error("sign-in failed");
    // Kept busy within the idle limit, it still ends at the absolute one.
    expect(await read(other.token, new Date(Date.now() + (SUPPLIER_SETTINGS.supplierAbsoluteMinutes! + 1) * 60_000))).toMatchObject({ ok: false, reason: "ABSOLUTE" });
  });

  it("is closed, naming the supplier settings, while they are not set (the staff ones do not stand in)", async () => {
    await setPolicy(organisationId, SETTINGS);
    const { password, loginName } = await makeSupplierAccount(organisationId);
    expect(await signIn(loginName, password)).toEqual({ ok: false, kind: "POLICY_NOT_SET", unset: ["supplierIdleMinutes", "supplierAbsoluteMinutes"] });
    const token = "A".repeat(43);
    expect(await read(token)).toMatchObject({ ok: false });
  });

  it("answers the same thing for a wrong password, an unknown name, an account waiting for its code, a disabled one and a retired contact", async () => {
    const live = await makeSupplierAccount(organisationId);
    const pending = await makeSupplierAccount(organisationId, { status: "PENDING_ACTIVATION" });
    const disabled = await makeSupplierAccount(organisationId, { status: "DISABLED" });
    const retired = await makeSupplierAccount(organisationId, { retired: true });
    const outcomes = [
      await signIn(live.loginName, "not the password at all"),
      await signIn(`nobody.${randomId()}`, live.password),
      await signIn(pending.loginName, pending.password),
      await signIn(disabled.loginName, disabled.password),
      await signIn(retired.loginName, retired.password),
    ];
    for (const o of outcomes) expect(o).toEqual({ ok: false, kind: "FAILED" });
    // The log records which it was, to the account where one matched.
    expect(await supplierKindsOf(live.account!.id)).toEqual(["FAILED"]);
    expect(await supplierKindsOf(pending.account!.id)).toEqual(["FAILED"]);
  });

  it("locks an account after the wrong passwords the organisation allows, and then refuses the right one", async () => {
    const { account, password, loginName } = await makeSupplierAccount(organisationId);
    for (let i = 0; i < SUPPLIER_SETTINGS.maxFailedAttempts!; i++) await signIn(loginName, "wrong password here");
    const locked = await db.supplierAccount.findUniqueOrThrow({ where: { id: account!.id } });
    expect(locked.failedAttempts).toBe(SUPPLIER_SETTINGS.maxFailedAttempts);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await signIn(loginName, password)).toEqual({ ok: false, kind: "FAILED" });
    expect((await supplierKindsOf(account!.id)).filter((k) => k === "LOCKED_OUT").length).toBeGreaterThan(0);
  });

  it("counts failures from one address against that address, for the supplier store only", async () => {
    const address = randomAddress();
    const a = await makeSupplierAccount(organisationId);
    for (let i = 0; i < SUPPLIER_SETTINGS.addressThrottleAttempts!; i++) await signIn(`nobody.${randomId()}`, "wrong password here", address);
    // The address is now held back for suppliers: even a right password from it is refused, and the log says it was throttled.
    expect(await signIn(a.loginName, a.password, address)).toEqual({ ok: false, kind: "FAILED" });
    expect(await supplierKindsOf(a.account!.id)).toContain("THROTTLED");
    // The staff store is not touched by it: its own count starts from nothing.
    const staff = await makeAccount(organisationId);
    expect((await authenticateStaff({ loginName: staff.loginName, password: staff.password }, facts(address), null)).ok).toBe(true);
  });

  it("refuses a new session at the limit, or ends the oldest, as the organisation chose", async () => {
    await setPolicy(organisationId, { ...SUPPLIER_SETTINGS, maxConcurrentSessions: 2, concurrentSessionAction: "REFUSE_NEW" });
    const { password, loginName } = await makeSupplierAccount(organisationId);
    expect((await signIn(loginName, password)).ok).toBe(true);
    expect((await signIn(loginName, password)).ok).toBe(true);
    expect(await signIn(loginName, password)).toEqual({ ok: false, kind: "SESSION_LIMIT" });
    await setPolicy(organisationId, { ...SUPPLIER_SETTINGS, maxConcurrentSessions: 2, concurrentSessionAction: "REVOKE_OLDEST" });
    const third = await signIn(loginName, password);
    expect(third.ok).toBe(true);
  });

  it("signs out one session, and everywhere", async () => {
    const { account, password, loginName } = await makeSupplierAccount(organisationId);
    const a = await signIn(loginName, password);
    const b = await signIn(loginName, password);
    if (!a.ok || !b.ok) throw new Error("sign-in failed");
    await signOutSupplierToken(a.token, facts());
    expect(await read(a.token)).toMatchObject({ ok: false, reason: "REVOKED" });
    const session = await read(b.token);
    if (!session.ok) throw new Error("read failed");
    expect(await supplierSignOutEverywhere(session.actor, facts())).toBe(1);
    expect((await read(b.token)).ok).toBe(false);
    expect(await db.supplierSession.count({ where: { accountId: account!.id, revokedAt: null } })).toBe(0);
    expect(await listOpenSupplierSessions(account!.id, organisationId, "none")).toEqual([]);
  });

  it("shows the sign-in before this one and the failures since, from the supplier's own log", async () => {
    const { account, password, loginName } = await makeSupplierAccount(organisationId);
    const first = await signIn(loginName, password, "198.51.100.1", null, new Date(Date.now() - 3_600_000));
    expect(first.ok).toBe(true);
    await signIn(loginName, "wrong password here", randomAddress(), null, new Date(Date.now() - 1_800_000));
    const second = await signIn(loginName, password, "198.51.100.2");
    if (!second.ok) throw new Error("sign-in failed");
    const session = await read(second.token);
    if (!session.ok) throw new Error("read failed");
    const previous = await previousSupplierSignIn(account!.id, session.actor.sessionCreatedAt);
    expect(previous.previous?.sourceAddress).toBe("198.51.100.1");
    expect(previous.failedSince).toBe(1);
  });
});

describe("a session is re-checked on every read", () => {
  it("ends the next request after the account is disabled or the contact is retired", async () => {
    const a = await makeSupplierAccount(organisationId);
    const b = await makeSupplierAccount(organisationId);
    const sa = await signIn(a.loginName, a.password);
    const sb = await signIn(b.loginName, b.password);
    if (!sa.ok || !sb.ok) throw new Error("sign-in failed");
    await db.supplierAccount.update({ where: { id: a.account!.id }, data: { status: "DISABLED", disabledAt: new Date(), disabledReason: "test" } });
    await db.supplierContact.update({ where: { id: b.contact.id }, data: { retiredOn: new Date("2026-10-01") } });
    expect(await read(sa.token)).toMatchObject({ ok: false, reason: "ACCOUNT_INACTIVE" });
    expect(await read(sb.token)).toMatchObject({ ok: false, reason: "ACCOUNT_INACTIVE" });
    expect((await db.supplierSession.findUniqueOrThrow({ where: { tokenHash: hashToken(sa.token) } })).revokedReason).toBe("ACCOUNT_DISABLED");
    expect(await supplierKindsOf(a.account!.id)).toContain("REVOKED");
  });

  it("is the supplier store's alone: a staff token reads nothing here, and a supplier token reads nothing on the staff side", async () => {
    const staff = await makeAccount(organisationId);
    const staffIn = await authenticateStaff({ loginName: staff.loginName, password: staff.password }, facts(), null);
    const sup = await makeSupplierAccount(organisationId);
    const supIn = await signIn(sup.loginName, sup.password);
    if (!staffIn.ok || !supIn.ok) throw new Error("sign-in failed");
    expect(await read(staffIn.token)).toMatchObject({ ok: false, reason: "UNKNOWN" });
    expect(await readStaffSession(supIn.token, { sourceAddress: null })).toMatchObject({ ok: false, reason: "UNKNOWN" });
  });

  it("never takes the supplier from anything but the account: a session of one supplier is never another's", async () => {
    const one = await makeSupplierAccount(organisationId);
    const two = await makeSupplierAccount(organisationId);
    const a = await signIn(one.loginName, one.password);
    const b = await signIn(two.loginName, two.password);
    if (!a.ok || !b.ok) throw new Error("sign-in failed");
    const sa = await read(a.token);
    const sb = await read(b.token);
    if (!sa.ok || !sb.ok) throw new Error("read failed");
    expect(sa.actor.supplierId).toBe(one.supplier.id);
    expect(sb.actor.supplierId).toBe(two.supplier.id);
    expect(sa.actor.supplierId).not.toBe(sb.actor.supplierId);
  });
});

describe("the password asked again", () => {
  it("counts a wrong one towards the lockout and the log, and a right one stamps the session (the B0 prerequisite of the registration)", async () => {
    const { account, password, loginName } = await makeSupplierAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const session = await read(outcome.token);
    if (!session.ok) throw new Error("read failed");

    expect(await confirmSupplierPassword(session.actor, "not the password", facts())).toEqual({ ok: false, kind: "WRONG" });
    expect((await db.supplierAccount.findUniqueOrThrow({ where: { id: account!.id } })).failedAttempts).toBe(1);
    expect(await supplierKindsOf(account!.id)).toContain("STEP_UP_FAILED");

    const right = await confirmSupplierPassword(session.actor, password, facts());
    expect(right.ok).toBe(true);
    expect((await db.supplierAccount.findUniqueOrThrow({ where: { id: account!.id } })).failedAttempts).toBe(0);
    expect((await db.supplierSession.findUniqueOrThrow({ where: { id: session.actor.sessionId } })).stepUpAt).not.toBeNull();
    expect(await supplierKindsOf(account!.id)).toContain("STEP_UP_OK");
  });

  it("locks the account after too many wrong ones, and then refuses even the right one", async () => {
    const { password, loginName } = await makeSupplierAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const session = await read(outcome.token);
    if (!session.ok) throw new Error("read failed");
    for (let i = 0; i < SUPPLIER_SETTINGS.maxFailedAttempts!; i++) await confirmSupplierPassword(session.actor, "wrong", facts());
    expect(await confirmSupplierPassword(session.actor, password, facts())).toEqual({ ok: false, kind: "LOCKED" });
  });

  it("refuses a locked account at once, without a hash, and holds back an address that has failed too often (one session cannot fill the pool the sign-in shares)", async () => {
    const { password, loginName } = await makeSupplierAccount(organisationId);
    const outcome = await signIn(loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    const session = await read(outcome.token);
    if (!session.ok) throw new Error("read failed");
    const address = randomAddress();
    // From one address, failures up to the throttle are judged; the next attempt is held back, even with the right password, and the log says so.
    for (let i = 0; i < SUPPLIER_SETTINGS.addressThrottleAttempts!; i++) await db.signInEvent.create({ data: { organisationId, store: "SUPPLIER", supplierAccountId: session.actor.accountId, kind: "STEP_UP_FAILED", at: new Date(), detail: { create: { sourceAddress: address, userAgent: "test" } } } });
    expect(await confirmSupplierPassword(session.actor, password, facts(address))).toEqual({ ok: false, kind: "THROTTLED" });
    expect(await supplierKindsOf(session.actor.accountId)).toContain("THROTTLED");
    // The password was not checked, so it was not stamped on the session.
    expect((await db.supplierSession.findUniqueOrThrow({ where: { id: session.actor.sessionId } })).stepUpAt).toBeNull();
    // A locked account is refused as locked and its count does not move.
    await db.supplierAccount.update({ where: { id: session.actor.accountId }, data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) } });
    expect(await confirmSupplierPassword(session.actor, password, facts())).toEqual({ ok: false, kind: "LOCKED" });
    expect((await db.supplierAccount.findUniqueOrThrow({ where: { id: session.actor.accountId } })).failedAttempts).toBe(5);
  });
});

describe("a one-time code", () => {
  /// An account waiting for its code, and the code an officer issued for it.
  async function waiting(purpose: "ACTIVATION" | "RESET" = "ACTIVATION") {
    const made = await makeSupplierAccount(organisationId, { status: purpose === "ACTIVATION" ? "PENDING_ACTIVATION" : "ACTIVE" });
    const code = generateCode();
    await db.oneTimeCode.create({
      data: { organisationId, store: "SUPPLIER", supplierAccountId: made.account!.id, purpose, codeHash: hashCode(code), expiresAt: codeExpiry(new Date(), 60), issuedByPersonId: (await makePerson(organisationId)).id, reason: "test", identityCheck: "seen at the counter" },
    });
    return { ...made, code: formatCode(code) };
  }
  const use = (purpose: "ACTIVATION" | "RESET", loginName: string, code: string, password = randomPassword() + "Zz9") => redeemSupplierCode({ purpose, loginName, code, password }, facts());

  it("activates the account with a password of the person's own, once", async () => {
    const w = await waiting();
    const password = randomPassword() + "Qq7";
    expect(await use("ACTIVATION", w.loginName, w.code, password)).toEqual({ ok: true });
    expect((await db.supplierAccount.findUniqueOrThrow({ where: { id: w.account!.id } })).status).toBe("ACTIVE");
    expect((await signIn(w.loginName, password)).ok).toBe(true);
    // Used once.
    expect(await use("ACTIVATION", w.loginName, w.code)).toEqual({ ok: false, kind: "FAILED" });
    const kinds = await supplierKindsOf(w.account!.id);
    expect(kinds).toEqual(expect.arrayContaining(["CODE_USED", "PASSWORD_CHANGED", "SIGNED_IN", "FAILED"]));
  });

  it("is spent at its own door only: an activation code does nothing at the reset door, and a reset code nothing at activation", async () => {
    const w = await waiting("ACTIVATION");
    expect(await use("RESET", w.loginName, w.code)).toEqual({ ok: false, kind: "FAILED" });
    const r = await waiting("RESET");
    expect(await use("ACTIVATION", r.loginName, r.code)).toEqual({ ok: false, kind: "FAILED" });
    expect((await db.oneTimeCode.findMany({ where: { supplierAccountId: w.account!.id } })).every((c) => c.usedAt === null)).toBe(true);
    expect(await use("ACTIVATION", w.loginName, w.code)).toEqual({ ok: true });
    expect(await use("RESET", r.loginName, r.code)).toEqual({ ok: true });
  });

  it("is refused after it expired, for another account's name, for a retired contact and once the account is disabled, all the same way", async () => {
    const expired = await waiting();
    await db.oneTimeCode.updateMany({ where: { supplierAccountId: expired.account!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await use("ACTIVATION", expired.loginName, expired.code)).toEqual({ ok: false, kind: "FAILED" });
    const a = await waiting();
    const b = await waiting();
    expect(await use("ACTIVATION", b.loginName, a.code)).toEqual({ ok: false, kind: "FAILED" });
    const retired = await waiting();
    await db.supplierContact.update({ where: { id: retired.contact.id }, data: { retiredOn: new Date("2026-10-01") } });
    expect(await use("ACTIVATION", retired.loginName, retired.code)).toEqual({ ok: false, kind: "FAILED" });
    const disabled = await waiting();
    await db.supplierAccount.update({ where: { id: disabled.account!.id }, data: { status: "DISABLED", disabledAt: new Date(), disabledReason: "test" } });
    expect(await use("ACTIVATION", disabled.loginName, disabled.code)).toEqual({ ok: false, kind: "FAILED" });
    expect(await use("ACTIVATION", "nobody.at.all", a.code)).toEqual({ ok: false, kind: "FAILED" });
  });

  it("is a staff code's mirror: a staff code is not a supplier's, and the staff door refuses a supplier's", async () => {
    const w = await waiting();
    const { redeemOneTimeCode } = await import("./account-store");
    expect(await redeemOneTimeCode({ loginName: w.loginName, code: w.code, password: randomPassword() + "Zz9" }, facts())).toEqual({ ok: false, kind: "FAILED" });
  });

  it("is used by exactly one of two requests that arrive together", async () => {
    const w = await waiting();
    const results = await Promise.all([use("ACTIVATION", w.loginName, w.code, randomPassword() + "Aa1"), use("ACTIVATION", w.loginName, w.code, randomPassword() + "Bb2")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.oneTimeCode.findMany({ where: { supplierAccountId: w.account!.id } })).filter((c) => c.usedAt !== null)).toHaveLength(1);
  });

  it("ends every session of the account and clears its lock, and says a reset to the person at their next sign-in", async () => {
    const r = await waiting("RESET");
    const before = await signIn(r.loginName, r.password);
    if (!before.ok) throw new Error("sign-in failed");
    await db.supplierAccount.update({ where: { id: r.account!.id }, data: { failedAttempts: 3 } });
    const password = randomPassword() + "Rr4";
    expect(await use("RESET", r.loginName, r.code, password)).toEqual({ ok: true });
    expect(await read(before.token)).toMatchObject({ ok: false, reason: "REVOKED" });
    const after = await db.supplierAccount.findUniqueOrThrow({ where: { id: r.account!.id } });
    expect(after).toMatchObject({ failedAttempts: 0, lockedUntil: null, resetNoticePending: true });
    const outcome = await signIn(r.loginName, password);
    if (!outcome.ok) throw new Error("sign-in failed");
    expect(outcome.resetNoticePending).toBe(true);
    const session = await read(outcome.token);
    if (!session.ok) throw new Error("read failed");
    expect(session.actor.resetNoticePending).toBe(true);
    await acknowledgeSupplierResetNotice(session.actor, facts());
    expect((await db.supplierAccount.findUniqueOrThrow({ where: { id: r.account!.id } })).resetNoticePending).toBe(false);
  });

  it("writes no password, hash or code into the trail or the log", async () => {
    const w = await waiting();
    const password = randomPassword() + "Pp5";
    await use("ACTIVATION", w.loginName, w.code, password);
    const rows = JSON.stringify(await db.auditEntry.findMany({ where: { entityId: w.account!.id } }));
    const events = JSON.stringify(await supplierEventsOf(w.account!.id));
    for (const secret of [password, w.code, w.code.replace(/-/g, ""), (await db.supplierAccount.findUniqueOrThrow({ where: { id: w.account!.id } })).passwordHash]) {
      expect(rows).not.toContain(secret);
      expect(events).not.toContain(secret);
    }
    const [audit] = await db.auditEntry.findMany({ where: { entityId: w.account!.id }, orderBy: { at: "desc" }, take: 1 });
    expect(audit).toMatchObject({ entity: "SupplierAccount", actorKind: "SUPPLIER", actorSupplierAccountId: w.account!.id, actorPersonId: null, unattributed: false });
  });
});

describe("changing the password", () => {
  it("asks the current one, ends every other session and gives this one a new token", async () => {
    const { account, password, loginName } = await makeSupplierAccount(organisationId);
    const a = await signIn(loginName, password);
    const b = await signIn(loginName, password);
    if (!a.ok || !b.ok) throw new Error("sign-in failed");
    const session = await read(b.token);
    if (!session.ok) throw new Error("read failed");

    const wrong = await changeSupplierPassword(session.actor, { current: "not the current one", next: randomPassword() + "Ww6" }, facts());
    expect(wrong).toMatchObject({ ok: false, kind: "FIELDS", faults: { current: { code: "WRONG_CURRENT" } } });
    const short = await changeSupplierPassword(session.actor, { current: password, next: "short" }, facts());
    expect(short).toMatchObject({ ok: false, kind: "FIELDS" });
    const same = await changeSupplierPassword(session.actor, { current: password, next: password }, facts());
    expect(same).toMatchObject({ ok: false, kind: "FIELDS" });

    const next = randomPassword() + "Nn8";
    const changed = await changeSupplierPassword(session.actor, { current: password, next }, facts());
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(await read(a.token)).toMatchObject({ ok: false, reason: "REVOKED" });
    expect(await read(b.token)).toMatchObject({ ok: false });
    expect((await read(changed.token)).ok).toBe(true);
    expect((await signIn(loginName, next)).ok).toBe(true);
    expect(await signIn(loginName, password)).toEqual({ ok: false, kind: "FAILED" });
    expect(await supplierKindsOf(account!.id)).toContain("PASSWORD_CHANGED");
  });
});

describe("an officer's acts on a supplier's portal account", () => {
  const request = facts();
  const open = async (o: { actor: StaffActor; supplier: { id: string; reference: string }; contactId: string; loginName: string; identityCheck?: string; passwordHash?: string }) =>
    db.$transaction((tx) =>
      openSupplierAccount(tx, {
        actor: o.actor,
        supplier: o.supplier,
        contactId: o.contactId,
        loginName: o.loginName,
        identityCheck: o.identityCheck ?? "Seen at the counter with an identity card",
        reason: "test",
        validityMinutes: 60,
        passwordHash: o.passwordHash ?? "$scrypt$unusable",
        request,
        now: new Date(),
      }),
    );

  it("opens a portal account waiting for its code, and issues the code, in one transaction", async () => {
    const o = await officer();
    const { supplier, contact } = await makeSupplierAccount(organisationId, { withAccount: false });
    const loginName = `new.${randomId()}`;
    const result = await open({ actor: o, supplier, contactId: contact.id, loginName });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const account = await db.supplierAccount.findUniqueOrThrow({ where: { id: result.accountId } });
    expect(account).toMatchObject({ contactId: contact.id, supplierId: supplier.id, organisationId, status: "PENDING_ACTIVATION", loginName, loginKey: loginName });
    const [code] = await db.oneTimeCode.findMany({ where: { supplierAccountId: account.id } });
    expect(code).toMatchObject({ store: "SUPPLIER", purpose: "ACTIVATION", issuedByPersonId: o.personId, identityCheck: "Seen at the counter with an identity card", usedAt: null });
    expect(code.codeHash).toBe(hashCode(result.issued.code.replace(/-/g, "")));
    expect(await supplierKindsOf(account.id)).toEqual(["ACCOUNT_CREATED", "CODE_ISSUED"]);
    // The trail says that a code was issued and how identity was checked, and holds neither the code nor the sign-in name.
    const trail = JSON.stringify(await db.auditEntry.findMany({ where: { entityId: account.id } }));
    expect(trail).toContain("Seen at the counter with an identity card");
    expect(trail).not.toContain(result.issued.code.replace(/-/g, ""));
    expect(trail).not.toContain(loginName);
  });

  it("is refused to an officer without the permission, to a contact that has an account or is retired, and without the identity check", async () => {
    const o = await officer();
    const nobody = await officer(false);
    const { supplier, contact } = await makeSupplierAccount(organisationId, { withAccount: false });
    const refused = await open({ actor: nobody, supplier, contactId: contact.id, loginName: `x.${randomId()}` });
    expect(refused).toMatchObject({ ok: false, fields: { "*": { code: "SUPPLIER_ACCOUNTS_NOT_PERMITTED" } } });
    const noCheck = await open({ actor: o, supplier, contactId: contact.id, loginName: `x.${randomId()}`, identityCheck: "  " });
    expect(noCheck).toMatchObject({ ok: false, fields: { identityCheck: { code: "IDENTITY_CHECK_REQUIRED" } } });
    const badName = await open({ actor: o, supplier, contactId: contact.id, loginName: "a b" });
    expect(badName).toMatchObject({ ok: false, fields: { loginName: { code: "BAD_LOGIN_NAME" } } });
    const has = await makeSupplierAccount(organisationId);
    expect(await open({ actor: o, supplier: has.supplier, contactId: has.contact.id, loginName: `x.${randomId()}` })).toMatchObject({ ok: false, fields: { "*": { code: "CONTACT_HAS_ACCOUNT" } } });
    const gone = await makeSupplierAccount(organisationId, { withAccount: false, retired: true });
    expect(await open({ actor: o, supplier: gone.supplier, contactId: gone.contact.id, loginName: `x.${randomId()}` })).toMatchObject({ ok: false, fields: { "*": { code: "CONTACT_RETIRED" } } });
    expect(await open({ actor: o, supplier, contactId: "no-such-contact", loginName: `x.${randomId()}` })).toMatchObject({ ok: false, fields: { "*": { code: "NO_SUCH_CONTACT" } } });
    expect(await db.supplierAccount.count({ where: { contactId: contact.id } })).toBe(0);
  });

  it("takes a contact of another supplier for no contact at all", async () => {
    const o = await officer();
    const mine = await makeSupplierAccount(organisationId, { withAccount: false });
    const theirs = await makeSupplierAccount(organisationId, { withAccount: false });
    expect(await open({ actor: o, supplier: mine.supplier, contactId: theirs.contact.id, loginName: `x.${randomId()}` })).toMatchObject({ ok: false, fields: { "*": { code: "NO_SUCH_CONTACT" } } });
  });

  it("refuses a sign-in name already used, by the check and, if two race, by the unique index", async () => {
    const o = await officer();
    const taken = await makeSupplierAccount(organisationId);
    const { supplier, contact } = await makeSupplierAccount(organisationId, { withAccount: false });
    expect(await open({ actor: o, supplier, contactId: contact.id, loginName: taken.loginName.toUpperCase() })).toMatchObject({ ok: false, fields: { loginName: { code: "LOGIN_NAME_TAKEN" } } });
    // Two acts that each found the name free: one wins, the other is told the name is taken, and the loser's transaction rolls back.
    const a = await makeSupplierAccount(organisationId, { withAccount: false });
    const b = await makeSupplierAccount(organisationId, { withAccount: false });
    const name = `race.${randomId()}`;
    const outcomes = await Promise.allSettled([open({ actor: o, supplier: a.supplier, contactId: a.contact.id, loginName: name }), open({ actor: o, supplier: b.supplier, contactId: b.contact.id, loginName: name })]);
    const won = outcomes.filter((x) => x.status === "fulfilled" && x.value.ok);
    const lost = outcomes.filter((x) => (x.status === "fulfilled" && !x.value.ok) || (x.status === "rejected" && x.reason instanceof LoginNameTaken));
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(await db.supplierAccount.count({ where: { loginKey: name } })).toBe(1);
  });

  it("issues a reset code for an active account, voids the code before it, ends the account's sessions at once, and demands the check", async () => {
    const o = await officer();
    const { account, supplier, password, loginName } = await makeSupplierAccount(organisationId);
    const signed = await signIn(loginName, password);
    if (!signed.ok) throw new Error("sign-in failed");
    const issue = (purpose: "ACTIVATION" | "RESET", identityCheck = "Called back on the registered number") =>
      db.$transaction((tx) => issueSupplierCode(tx, { actor: o, supplier, accountId: account!.id, purpose, identityCheck, reason: "test", validityMinutes: 60, request, now: new Date() }));

    expect(await issue("ACTIVATION")).toMatchObject({ ok: false, faults: [{ code: "NOT_AWAITING_ACTIVATION" }] });
    expect(await issue("RESET", " ")).toMatchObject({ ok: false, faults: [{ code: "IDENTITY_CHECK_REQUIRED" }] });
    expect((await read(signed.token)).ok).toBe(true);

    const first = await issue("RESET");
    const second = await issue("RESET");
    if (!first.ok || !second.ok) throw new Error("issue failed");
    expect(first.sessionsEnded).toBe(1);
    expect(await read(signed.token)).toMatchObject({ ok: false, reason: "REVOKED" });
    expect((await db.supplierSession.findUniqueOrThrow({ where: { tokenHash: hashToken(signed.token) } })).revokedReason).toBe("ADMINISTRATOR");
    const codes = await db.oneTimeCode.findMany({ where: { supplierAccountId: account!.id }, orderBy: { createdAt: "asc" } });
    expect(codes.map((c) => c.usedAt !== null)).toEqual([true, false]);
    // The earlier code no longer works; the later one does.
    expect(await redeemSupplierCode({ purpose: "RESET", loginName, code: first.issued.code, password: randomPassword() + "Aa1" }, facts())).toEqual({ ok: false, kind: "FAILED" });
    expect(await redeemSupplierCode({ purpose: "RESET", loginName, code: second.issued.code, password: randomPassword() + "Bb2" }, facts())).toEqual({ ok: true });
  });

  it("will not issue a code for an account of another supplier, of a retired contact, or without the permission", async () => {
    const o = await officer();
    const nobody = await officer(false);
    const mine = await makeSupplierAccount(organisationId);
    const theirs = await makeSupplierAccount(organisationId);
    const issue = (actor: StaffActor, supplier: { id: string; reference: string }, accountId: string) =>
      db.$transaction((tx) => issueSupplierCode(tx, { actor, supplier, accountId, purpose: "RESET", identityCheck: "seen", reason: "test", validityMinutes: 60, request, now: new Date() }));
    expect(await issue(o, mine.supplier, theirs.account!.id)).toMatchObject({ ok: false, faults: [{ code: "NO_SUCH_SUPPLIER_ACCOUNT" }] });
    expect(await issue(nobody, mine.supplier, mine.account!.id)).toMatchObject({ ok: false, faults: [{ code: "SUPPLIER_ACCOUNTS_NOT_PERMITTED" }] });
    await db.supplierContact.update({ where: { id: mine.contact.id }, data: { retiredOn: new Date("2026-10-01") } });
    expect(await issue(o, mine.supplier, mine.account!.id)).toMatchObject({ ok: false, faults: [{ code: "CONTACT_RETIRED" }] });
  });

  it("unlocks a locked account, with the check, and only a locked one", async () => {
    const o = await officer();
    const { account, supplier, loginName, password } = await makeSupplierAccount(organisationId);
    const unlock = (identityCheck = "Seen at the counter") => db.$transaction((tx) => unlockSupplierAccount(tx, { actor: o, supplier, accountId: account!.id, identityCheck, request, now: new Date() }));
    expect(await unlock()).toMatchObject({ ok: false, faults: [{ code: "NOT_LOCKED" }] });
    for (let i = 0; i < SUPPLIER_SETTINGS.maxFailedAttempts!; i++) await signIn(loginName, "wrong password here");
    expect(await signIn(loginName, password)).toEqual({ ok: false, kind: "FAILED" });
    expect(await unlock(" ")).toMatchObject({ ok: false });
    expect(await unlock()).toEqual({ ok: true });
    expect((await signIn(loginName, password)).ok).toBe(true);
    expect(await supplierKindsOf(account!.id)).toContain("UNLOCKED");
  });

  it("retiring a contact disables its account, ends its sessions and voids its codes, in the same transaction", async () => {
    const o = await officer();
    const { account, supplier, contact, password, loginName } = await makeSupplierAccount(organisationId);
    const signed = await signIn(loginName, password);
    if (!signed.ok) throw new Error("sign-in failed");
    await db.oneTimeCode.create({ data: { organisationId, store: "SUPPLIER", supplierAccountId: account!.id, purpose: "RESET", codeHash: hashCode(generateCode()), expiresAt: codeExpiry(new Date(), 60), issuedByPersonId: o.personId, reason: "test", identityCheck: "seen" } });
    const ended = await db.$transaction(async (tx) => {
      await tx.supplierContact.update({ where: { id: contact.id }, data: { retiredOn: new Date("2026-10-08") } });
      return disableAccountOfRetiredContact(tx, { actor: o, supplier, contactId: contact.id, reason: "Left the company", request, now: new Date() });
    });
    expect(ended).toBe(1);
    const after = await db.supplierAccount.findUniqueOrThrow({ where: { id: account!.id } });
    expect(after).toMatchObject({ status: "DISABLED", disabledReason: "Left the company" });
    expect(after.disabledAt).not.toBeNull();
    expect(await read(signed.token)).toMatchObject({ ok: false });
    expect((await db.oneTimeCode.findMany({ where: { supplierAccountId: account!.id } })).every((c) => c.usedAt !== null)).toBe(true);
    expect(await signIn(loginName, password)).toEqual({ ok: false, kind: "FAILED" });
    expect(await supplierKindsOf(account!.id)).toContain("ACCOUNT_DISABLED");
    // Doing it again changes nothing and ends nothing.
    expect(await db.$transaction((tx) => disableAccountOfRetiredContact(tx, { actor: o, supplier, contactId: contact.id, reason: "again", request, now: new Date() }))).toBe(0);
  });
});

describe("what the database itself refuses", () => {
  it("an account belongs to the supplier and organisation of its contact", async () => {
    const one = await makeSupplierAccount(organisationId, { withAccount: false });
    const other = await makeSupplierAccount(organisationId, { withAccount: false });
    const base = { organisationId, passwordHash: await hashPassword(randomPassword()), passwordChangedAt: new Date(), status: "ACTIVE" as const };
    await expect(db.supplierAccount.create({ data: { ...base, contactId: one.contact.id, supplierId: other.supplier.id, loginName: `a.${randomId()}`, loginKey: "x" } })).rejects.toThrow();
    const name = `b.${randomId()}`;
    await expect(db.supplierAccount.create({ data: { ...base, contactId: one.contact.id, supplierId: other.supplier.id, loginName: name, loginKey: name } })).rejects.toThrow(/must belong to the supplier and the organisation of its contact/);
    const second = await db.organisation.create({ data: { code: `OTHER_${randomId()}`, name: "Another organisation" } });
    const name2 = `c.${randomId()}`;
    await expect(db.supplierAccount.create({ data: { ...base, organisationId: second.id, contactId: one.contact.id, supplierId: one.supplier.id, loginName: name2, loginKey: name2 } })).rejects.toThrow(/must belong to the supplier and the organisation of its contact/);
    // And it cannot be moved afterwards.
    const made = await makeSupplierAccount(organisationId);
    await expect(db.supplierAccount.update({ where: { id: made.account!.id }, data: { supplierId: one.supplier.id } })).rejects.toThrow(/must belong to the supplier and the organisation of its contact/);
  });

  it("the sign-in key is the lower-cased name, a disabled account is dated, and a count is never negative", async () => {
    const one = await makeSupplierAccount(organisationId, { withAccount: false });
    const base = { organisationId, contactId: one.contact.id, supplierId: one.supplier.id, passwordHash: "h", passwordChangedAt: new Date() };
    await expect(db.supplierAccount.create({ data: { ...base, loginName: "Mixed.Case", loginKey: "Mixed.Case", status: "ACTIVE" } })).rejects.toThrow();
    await expect(db.supplierAccount.create({ data: { ...base, loginName: "", loginKey: "", status: "ACTIVE" } })).rejects.toThrow();
    await expect(db.supplierAccount.create({ data: { ...base, loginName: "dis.abled", loginKey: "dis.abled", status: "DISABLED" } })).rejects.toThrow();
    await expect(db.supplierAccount.create({ data: { ...base, loginName: "neg.count", loginKey: "neg.count", status: "ACTIVE", failedAttempts: -1 } })).rejects.toThrow();
  });

  it("a code names exactly one account, and the right store's", async () => {
    const made = await makeSupplierAccount(organisationId);
    const staff = await makeAccount(organisationId);
    const person = await makePerson(organisationId);
    const base = { organisationId, purpose: "ACTIVATION" as const, expiresAt: new Date(Date.now() + 60_000), issuedByPersonId: person.id, reason: "test" };
    await expect(db.oneTimeCode.create({ data: { ...base, store: "SUPPLIER", codeHash: randomId() + randomId() } })).rejects.toThrow();
    await expect(db.oneTimeCode.create({ data: { ...base, store: "SUPPLIER", supplierAccountId: made.account!.id, staffAccountId: staff.account.id, codeHash: randomId() + randomId() } })).rejects.toThrow();
    await expect(db.oneTimeCode.create({ data: { ...base, store: "STAFF", supplierAccountId: made.account!.id, codeHash: randomId() + randomId() } })).rejects.toThrow();
    await expect(db.signInEvent.create({ data: { organisationId, store: "STAFF", supplierAccountId: made.account!.id, kind: "FAILED" } })).rejects.toThrow();
    await expect(db.signInEvent.create({ data: { organisationId, store: "SUPPLIER", staffAccountId: staff.account.id, kind: "FAILED" } })).rejects.toThrow();
  });

  it("a dial code belongs to a country and has a plus sign and one to six digits", async () => {
    const mk = (list: "COUNTRY" | "STATE", callingCode: string | null) => db.supplierListValue.create({ data: { organisationId, list, code: `t_${randomId()}`, nameEn: "T", provenance: "ASSUMED", callingCode } });
    await expect(mk("COUNTRY", "+60")).resolves.toBeTruthy();
    await expect(mk("COUNTRY", null)).resolves.toBeTruthy();
    await expect(mk("COUNTRY", "60")).rejects.toThrow();
    await expect(mk("COUNTRY", "+0123")).rejects.toThrow();
    await expect(mk("COUNTRY", "+1234567")).rejects.toThrow();
    await expect(mk("STATE", "+60")).rejects.toThrow();
  });

  it("the sign-in log of the supplier store is as permanent as the staff's", async () => {
    const made = await makeSupplierAccount(organisationId);
    await signIn(made.loginName, "wrong password here");
    const [event] = await supplierEventsOf(made.account!.id);
    await expect(db.signInEvent.update({ where: { id: event.id }, data: { kind: "SIGNED_IN" } })).rejects.toThrow();
    await expect(db.signInEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  });
});
