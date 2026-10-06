import { beforeEach, describe, expect, it } from "vitest";

import { loadAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { randomId, randomPassword, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { bootstrapAdministrator, bootstrapLabel, type BootstrapInput } from "./bootstrap";
import { verifyPassword } from "./password";

/// Each test gets an organisation of its own with nothing in it: the bootstrap command works on an organisation that already exists and is empty.
let code: string;
let organisationId: string;

beforeEach(async () => {
  code = `BOOT_${randomId()}`;
  organisationId = (await db.organisation.create({ data: { code, name: "Bootstrap test" } })).id;
});

const POLICY = Object.fromEntries(Object.entries(SETTINGS).filter(([, v]) => v !== null));
const run = (over: Partial<BootstrapInput> = {}) =>
  bootstrapAdministrator({
    organisationCode: code,
    mode: "FIRST",
    loginName: `admin.${randomId()}`,
    password: randomPassword(),
    person: { name: "Test Administrator" },
    policy: POLICY,
    ...over,
  });

describe("the first administrator", () => {
  it("creates the person, the account and the settings, audits each as the bootstrap command, and the password signs in", async () => {
    const password = randomPassword();
    const loginName = `Admin.${randomId()}`;
    const result = await run({ loginName, password });
    expect(result).toMatchObject({ ok: true, mode: "FIRST" });
    if (!result.ok) return;

    const account = await db.staffAccount.findUniqueOrThrow({ where: { id: result.accountId }, include: { person: true } });
    expect(account).toMatchObject({ isAdministrator: true, status: "ACTIVE", loginName, loginKey: loginName.toLowerCase(), organisationId });
    expect(account.person.name).toBe("Test Administrator");
    expect((await verifyPassword(account.passwordHash, password)).ok).toBe(true);
    expect(account.passwordHash).not.toContain(password);

    const policy = await db.securityPolicy.findUniqueOrThrow({ where: { organisationId } });
    expect(policy).toMatchObject({ staffIdleMinutes: SETTINGS.staffIdleMinutes, concurrentSessionAction: SETTINGS.concurrentSessionAction, passwordMinLength: 12 });
    expect(policy.paperSignatureRecording).toBeNull();

    const audit = await db.auditEntry.findMany({ where: { organisationId }, orderBy: { at: "asc" } });
    expect(audit.map((a) => a.entity).sort()).toEqual(["Person", "SecurityPolicy", "StaffAccount"]);
    for (const row of audit) expect(row).toMatchObject({ unattributed: false, actorKind: "SYSTEM", actorSystemLabel: "bootstrap command", actorPersonId: null });
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain("$scrypt$");
    expect(await db.signInEvent.count({ where: { staffAccountId: result.accountId, kind: "ACCOUNT_CREATED" } })).toBe(1);

    // History reads these rows as the system, by what ran: not as "Unknown", and not as a person.
    const shown = await loadAudit(code, { entity: "StaffAccount" });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ unattributed: false, actorName: "System: bootstrap command" });
  });

  it("refuses to run again once an administrator exists, and says which flag to use", async () => {
    expect((await run()).ok).toBe(true);
    const again = await run();
    expect(again).toMatchObject({ ok: false, code: "ADMINISTRATOR_EXISTS" });
    expect((again as { message: string }).message).toContain("--additional");
    expect((again as { message: string }).message).toContain("--recover");
    expect(await db.staffAccount.count({ where: { organisationId } })).toBe(1);
  });

  it("lets only one of two operators be the first", async () => {
    const results = await Promise.all([run(), run(), run()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.staffAccount.count({ where: { organisationId, isAdministrator: true } })).toBe(1);
  });

  it("needs the organisation to exist", async () => {
    expect(await run({ organisationCode: "NO_SUCH_ORG" })).toMatchObject({ ok: false, code: "NO_ORGANISATION" });
  });

  it("refuses while a setting that sign-in needs is unset, names it, and leaves nothing behind", async () => {
    const result = await run({ policy: { ...POLICY, lockoutMinutes: undefined, concurrentSessionAction: undefined } });
    expect(result).toMatchObject({ ok: false, code: "POLICY_NOT_SET", unset: ["concurrentSessionAction", "lockoutMinutes"] });
    expect(await db.person.count({ where: { organisationId } })).toBe(0);
    expect(await db.staffAccount.count({ where: { organisationId } })).toBe(0);
    expect(await db.securityPolicy.count({ where: { organisationId } })).toBe(0);
    expect(await db.auditEntry.count({ where: { organisationId } })).toBe(0);
  });

  it("ships no default: with nothing supplied there is no policy", async () => {
    expect(await run({ policy: {} })).toMatchObject({ ok: false, code: "POLICY_NOT_SET" });
    expect(await db.securityPolicy.count({ where: { organisationId } })).toBe(0);
  });

  it("refuses a password that is too short for the setting it has just been given, and a settings pair that contradicts", async () => {
    expect(await run({ password: "short" })).toMatchObject({ ok: false, code: "BAD_PASSWORD" });
    expect(await run({ policy: { ...POLICY, staffIdleMinutes: 500 } })).toMatchObject({ ok: false, code: "POLICY_FAULT" });
    expect(await db.securityPolicy.count({ where: { organisationId } })).toBe(0);
  });

  it("refuses a sign-in name that is not one word, and one already taken", async () => {
    expect(await run({ loginName: "a b" })).toMatchObject({ ok: false, code: "BAD_LOGIN_NAME" });
    expect(await run({ loginName: "ab" })).toMatchObject({ ok: false, code: "BAD_LOGIN_NAME" });
    const name = `taken.${randomId()}`;
    expect((await run({ loginName: name })).ok).toBe(true);
    expect(await run({ mode: "ADDITIONAL", loginName: name.toUpperCase() })).toMatchObject({ ok: false, code: "LOGIN_NAME_TAKEN" });
  });
});

describe("a person who holds an office", () => {
  const person = () => db.person.create({ data: { organisationId, name: "Holder" } });
  const past = new Date(Date.now() - 86_400_000 * 90);

  it("is refused, whether they hold an office, a seat or a delegation", async () => {
    const withOffice = await person();
    await db.roleAssignment.create({ data: { personId: withOffice.id, roleCode: "HOD", effectiveFrom: past } });
    expect(await run({ person: { existingPersonId: withOffice.id } })).toMatchObject({ ok: false, code: "PERSON_HOLDS_OFFICE" });

    const committee = await db.committee.create({ data: { organisationId, code: `C_${randomId()}`, nameEn: "Committee", mandate: "test", governingSource: "test" } as never });
    const withSeat = await person();
    await db.committeeMember.create({ data: { committeeId: committee.id, personId: withSeat.id, effectiveFrom: past } as never });
    expect(await run({ person: { existingPersonId: withSeat.id } })).toMatchObject({ ok: false, code: "PERSON_HOLDS_OFFICE" });

    const grantor = await person();
    const delegate = await person();
    await db.delegation.create({ data: { organisationId, fromPersonId: grantor.id, toPersonId: delegate.id, roleCode: "HOD", capabilityCodes: [], effectiveFrom: past } as never });
    expect(await run({ person: { existingPersonId: delegate.id } })).toMatchObject({ ok: false, code: "PERSON_HOLDS_OFFICE" });
    expect(await run({ person: { existingPersonId: grantor.id } })).toMatchObject({ ok: false, code: "PERSON_HOLDS_OFFICE" });
    expect(await db.staffAccount.count({ where: { organisationId } })).toBe(0);
  });

  it("is accepted once what they held has ended", async () => {
    const former = await person();
    await db.roleAssignment.create({ data: { personId: former.id, roleCode: "HOD", effectiveFrom: past, effectiveTo: new Date(Date.now() - 86_400_000) } });
    const r = await run({ person: { existingPersonId: former.id } });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  });

  it("is accepted if they hold nothing, and then cannot be given a second account", async () => {
    const plain = await person();
    expect((await run({ person: { existingPersonId: plain.id } })).ok).toBe(true);
    expect(await run({ mode: "ADDITIONAL", person: { existingPersonId: plain.id } })).toMatchObject({ ok: false, code: "PERSON_HAS_ACCOUNT" });
  });

  it("must be in this organisation, and active", async () => {
    const other = await db.organisation.create({ data: { code: `OTHER_${randomId()}`, name: "Other" } });
    const stranger = await db.person.create({ data: { organisationId: other.id, name: "Stranger" } });
    expect(await run({ person: { existingPersonId: stranger.id } })).toMatchObject({ ok: false, code: "NO_PERSON" });
    const left = await db.person.create({ data: { organisationId, name: "Leaver", isActive: false } });
    expect(await run({ person: { existingPersonId: left.id } })).toMatchObject({ ok: false, code: "PERSON_INACTIVE" });
  });
});

describe("--additional and --recover", () => {
  it("--additional adds a second administrator and says so in the audit label; without one it refuses", async () => {
    expect(await run({ mode: "ADDITIONAL" })).toMatchObject({ ok: false, code: "NO_ADMINISTRATOR" });
    expect((await run()).ok).toBe(true);
    const second = await run({ mode: "ADDITIONAL", policy: {} });
    expect(second).toMatchObject({ ok: true, mode: "ADDITIONAL" });
    const labels = await db.auditEntry.findMany({ where: { organisationId, entity: "StaffAccount" }, select: { actorSystemLabel: true } });
    expect(labels.map((l) => l.actorSystemLabel).sort()).toEqual(["bootstrap command", "bootstrap command (--additional)"]);
    expect(await db.staffAccount.count({ where: { organisationId, isAdministrator: true } })).toBe(2);
  });

  it("never changes a setting that is already set", async () => {
    expect((await run()).ok).toBe(true);
    expect((await run({ mode: "ADDITIONAL", policy: { ...POLICY, staffIdleMinutes: 5, lockoutMinutes: 1 } })).ok).toBe(true);
    expect(await db.securityPolicy.findUniqueOrThrow({ where: { organisationId } })).toMatchObject({ staffIdleMinutes: SETTINGS.staffIdleMinutes, lockoutMinutes: SETTINGS.lockoutMinutes });
  });

  it("--recover sets a new password for the locked-out administrator, clears the lock, ends every session, and leaves the notice", async () => {
    const loginName = `admin.${randomId()}`;
    const first = await run({ loginName });
    if (!first.ok) throw new Error("bootstrap failed");
    await db.staffAccount.update({ where: { id: first.accountId }, data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) } });
    const session = await db.staffSession.create({ data: { organisationId, accountId: first.accountId, tokenHash: `t_${randomId()}`, lastSeenAt: new Date(), absoluteExpiresAt: new Date(Date.now() + 600_000) } });

    const password = randomPassword();
    const recovered = await run({ mode: "RECOVER", loginName: loginName.toUpperCase(), password, policy: {} });
    expect(recovered).toMatchObject({ ok: true, mode: "RECOVER", accountId: first.accountId });
    const account = await db.staffAccount.findUniqueOrThrow({ where: { id: first.accountId } });
    expect(account).toMatchObject({ failedAttempts: 0, lockedUntil: null, resetNoticePending: true });
    expect((await verifyPassword(account.passwordHash, password)).ok).toBe(true);
    expect((await db.staffSession.findUniqueOrThrow({ where: { id: session.id } })).revokedReason).toBe("ACCOUNT_CHANGED");
    const audit = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "StaffAccount", action: "UPDATE" } });
    expect(audit.actorSystemLabel).toBe("bootstrap command (--recover)");
    expect(JSON.stringify(audit)).not.toContain(password);
  });

  it("--recover refuses a name that is not an administrator's", async () => {
    expect((await run()).ok).toBe(true);
    const plain = await db.person.create({ data: { organisationId, name: "Plain" } });
    const plainName = `plain.${randomId()}`;
    await db.staffAccount.create({ data: { organisationId, personId: plain.id, loginName: plainName, loginKey: plainName, passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } });
    expect(await run({ mode: "RECOVER", loginName: plainName, policy: {} })).toMatchObject({ ok: false, code: "NOT_AN_ADMINISTRATOR" });
    expect(await run({ mode: "RECOVER", loginName: "nobody.here", policy: {} })).toMatchObject({ ok: false, code: "NOT_AN_ADMINISTRATOR" });
  });

  it("names the flag in its labels", () => {
    expect(bootstrapLabel("FIRST")).toBe("bootstrap command");
    expect(bootstrapLabel("ADDITIONAL")).toBe("bootstrap command (--additional)");
    expect(bootstrapLabel("RECOVER")).toBe("bootstrap command (--recover)");
  });
});
