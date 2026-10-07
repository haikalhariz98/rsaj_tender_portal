import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { ensureAdministrator, facts, makeAccount, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { applyAppRole } from "../../../scripts/db-role-apply";
import { redeemOneTimeCode } from "./account-store";
import { authenticateStaff } from "./identity";
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
