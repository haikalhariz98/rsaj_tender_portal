import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { ensureAdministrator, facts, makeAccount, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { applyAppRole } from "../../../scripts/db-role-apply";
import { redeemOneTimeCode } from "./account-store";
import { authenticateStaff } from "./identity";
import { RUNTIME_ROLE_WORDS, runtimeRoleVerdict } from "./db-role";
import { readRuntimeRole } from "./runtime-role-store";

/**
 * Phase 1d, `assertRuntimeRole` (ADR 0034 D11) above the pure verdict. In production, sign-in and a one-time code are refused while the
 * app runs as the owner or a superuser: the scratch connection here is a superuser, so both must answer UNSAFE_DATABASE_ROLE, before any
 * password is looked at. Outside production they go on as before.
 *
 * And membership counts: a role that does not own a table itself, but is a member of one that does (or of a superuser), could SET ROLE
 * to it and drop a trigger, so it reads as owner. The roles here are this file's own and dropped afterwards; nothing is granted the
 * real owner.
 */

const kept = globalThis as unknown as { perolehanRuntimeRole?: unknown };
const APP = "perolehan_app_test";

let organisationId = "";
beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
  await db.$transaction((tx) => applyAppRole(tx, { role: APP, password: null }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  kept.perolehanRuntimeRole = undefined;
});

describe("sign-in refuses in production while the app runs as the owner or a superuser", () => {
  it("a password sign-in and a one-time code both answer UNSAFE_DATABASE_ROLE", async () => {
    const { loginName, password } = await makeAccount(organisationId);
    kept.perolehanRuntimeRole = undefined;
    vi.stubEnv("NODE_ENV", "production");
    expect(await authenticateStaff({ loginName, password }, facts(), null)).toEqual({ ok: false, kind: "UNSAFE_DATABASE_ROLE" });
    expect(await redeemOneTimeCode({ loginName, code: "ABCD-EFGH-JKLM", password }, facts())).toEqual({ ok: false, kind: "UNSAFE_DATABASE_ROLE" });
    // Refused before the password was judged: nothing was logged against the account.
    expect(await db.signInEvent.count({ where: { staffAccount: { loginName } } })).toBe(0);
  });

  it("outside production the same sign-in goes on", async () => {
    const { loginName, password } = await makeAccount(organisationId);
    kept.perolehanRuntimeRole = undefined;
    const outcome = await authenticateStaff({ loginName, password }, facts(), null);
    expect(outcome.ok).toBe(true);
  });
});

describe("membership in the owner or in a superuser reads as unsafe", () => {
  const OWNER = `perolehan_owner_test_${Date.now().toString(36)}`;

  it("a role that owns nothing itself, but is a member of a role that owns a table, reads as owner", async () => {
    try {
      await db.$executeRawUnsafe(`CREATE ROLE ${OWNER} NOLOGIN`);
      await db.$executeRawUnsafe(`CREATE TABLE "${OWNER}" (x int)`);
      await db.$executeRawUnsafe(`ALTER TABLE "${OWNER}" OWNER TO ${OWNER}`);
      const before = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP}`);
        return readRuntimeRole(tx);
      });
      expect(before.ownsSchemaObjects).toBe(false);
      await db.$executeRawUnsafe(`GRANT ${OWNER} TO ${APP}`);
      const after = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP}`);
        return readRuntimeRole(tx);
      });
      expect(after.ownsSchemaObjects).toBe(true);
    } finally {
      await db.$executeRawUnsafe(`REVOKE ${OWNER} FROM ${APP}`).catch(() => undefined);
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${OWNER}"`);
      await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${OWNER}`);
    }
  });

  it("a role that is a member of a superuser reads as a superuser", async () => {
    const SUPER = `perolehan_super_test_${Date.now().toString(36)}`;
    try {
      await db.$executeRawUnsafe(`CREATE ROLE ${SUPER} NOLOGIN SUPERUSER`);
      await db.$executeRawUnsafe(`GRANT ${SUPER} TO ${APP}`);
      const facts = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP}`);
        return readRuntimeRole(tx);
      });
      expect(facts.isSuperuser).toBe(true);
    } finally {
      await db.$executeRawUnsafe(`REVOKE ${SUPER} FROM ${APP}`).catch(() => undefined);
      await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${SUPER}`);
    }
  });
});

describe("a separate login that can still change the trail reads as unsafe (Phase 1d review)", () => {
  const asApp = () =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP}`);
      return readRuntimeRole(tx);
    });

  it("UPDATE granted by hand on DocumentAccessEvent (grants are its only wall) is found, and refuses sign-in in production", async () => {
    try {
      const before = await asApp();
      expect(before).toMatchObject({ isSuperuser: false, ownsSchemaObjects: false, withheldHeld: [] });
      expect(runtimeRoleVerdict(before, true)).toEqual({ safe: true });

      await db.$executeRawUnsafe(`GRANT UPDATE ON "DocumentAccessEvent" TO ${APP}`);
      const after = await asApp();
      expect(after.withheldHeld).toEqual(["DocumentAccessEvent"]);
      expect(runtimeRoleVerdict(after, true)).toMatchObject({ safe: false, reason: "TRAIL_WRITABLE", refuseSignIn: true, tables: ["DocumentAccessEvent"] });
    } finally {
      await db.$executeRawUnsafe(`REVOKE UPDATE ON "DocumentAccessEvent" FROM ${APP}`);
    }
  });

  it("a right held through PUBLIC, or by a role the login is a member of, counts too; so does reading Prisma's table", async () => {
    const HOLDER = `perolehan_holder_test_${Date.now().toString(36)}`;
    try {
      await db.$executeRawUnsafe(`GRANT TRUNCATE ON "AuditEntry" TO PUBLIC`);
      expect((await asApp()).withheldHeld).toEqual(["AuditEntry"]);
      await db.$executeRawUnsafe(`REVOKE TRUNCATE ON "AuditEntry" FROM PUBLIC`);

      await db.$executeRawUnsafe(`CREATE ROLE ${HOLDER} NOLOGIN`);
      await db.$executeRawUnsafe(`GRANT UPDATE ON "BlobContent" TO ${HOLDER}`);
      await db.$executeRawUnsafe(`GRANT SELECT ON "_prisma_migrations" TO ${HOLDER}`);
      expect((await asApp()).withheldHeld).toEqual([]);
      await db.$executeRawUnsafe(`GRANT ${HOLDER} TO ${APP}`);
      expect((await asApp()).withheldHeld).toEqual(["BlobContent", "_prisma_migrations"]);
    } finally {
      await db.$executeRawUnsafe(`REVOKE TRUNCATE ON "AuditEntry" FROM PUBLIC`);
      await db.$executeRawUnsafe(`REVOKE ${HOLDER} FROM ${APP}`).catch(() => undefined);
      await db.$executeRawUnsafe(`DROP OWNED BY ${HOLDER}`).catch(() => undefined);
      await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${HOLDER}`);
    }
  });
});

describe("a login that can still make temporary tables is a warning (build plan step 19, security audit 1)", () => {
  const asApp = () =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP}`);
      return readRuntimeRole(tx);
    });
  const database = async () => (await db.$queryRaw<{ name: string }[]>`SELECT current_database()::text AS "name"`)[0].name;

  it("reads false after db:roles, and true where TEMPORARY is granted back, to the login, to PUBLIC or to a role it is a member of, with the verdict's words", async () => {
    const db_ = await database();
    const HOLDER = `perolehan_temp_test_${Date.now().toString(36)}`;
    try {
      const clean = await asApp();
      expect(clean.temporaryHeld).toBe(false);
      expect(runtimeRoleVerdict(clean, true)).toEqual({ safe: true });

      for (const grant of [`GRANT TEMPORARY ON DATABASE "${db_}" TO ${APP}`, `GRANT TEMPORARY ON DATABASE "${db_}" TO PUBLIC`]) {
        await db.$executeRawUnsafe(grant);
        const held = await asApp();
        expect(held.temporaryHeld, grant).toBe(true);
        const verdict = runtimeRoleVerdict(held, true);
        expect(verdict, grant).toMatchObject({ safe: false, reason: "TEMPORARY_HELD", refuseSignIn: false });
        // The words the verdict itself points to, not the constant by name.
        expect(RUNTIME_ROLE_WORDS[(verdict as { reason: keyof typeof RUNTIME_ROLE_WORDS }).reason], grant).toMatch(/temporary tables.*db:roles|db:roles.*temporary tables/);
        await db.$executeRawUnsafe(`REVOKE TEMPORARY ON DATABASE "${db_}" FROM ${APP}`);
        await db.$executeRawUnsafe(`REVOKE TEMPORARY ON DATABASE "${db_}" FROM PUBLIC`);
        expect((await asApp()).temporaryHeld, `${grant} taken back`).toBe(false);
      }

      // A member role: the login is NOINHERIT, so only a check through membership finds it.
      await db.$executeRawUnsafe(`CREATE ROLE ${HOLDER} NOLOGIN`);
      await db.$executeRawUnsafe(`GRANT TEMPORARY ON DATABASE "${db_}" TO ${HOLDER}`);
      expect((await asApp()).temporaryHeld).toBe(false);
      await db.$executeRawUnsafe(`GRANT ${HOLDER} TO ${APP}`);
      expect((await asApp()).temporaryHeld).toBe(true);
    } finally {
      await db.$executeRawUnsafe(`REVOKE ${HOLDER} FROM ${APP}`).catch(() => undefined);
      await db.$executeRawUnsafe(`REVOKE TEMPORARY ON DATABASE "${db_}" FROM ${APP}`).catch(() => undefined);
      await db.$executeRawUnsafe(`REVOKE TEMPORARY ON DATABASE "${db_}" FROM PUBLIC`).catch(() => undefined);
      await db.$executeRawUnsafe(`DROP OWNED BY ${HOLDER}`).catch(() => undefined);
      await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${HOLDER}`).catch(() => undefined);
    }
  });
});
