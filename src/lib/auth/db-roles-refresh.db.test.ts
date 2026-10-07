import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";

import { applyAppRole, refreshAppGrants } from "../../../scripts/db-role-apply";

/**
 * Phase 1d review: `db:roles` with APP_DB_PASSWORD unset (a migration job that holds only the owner's login) still brings the grants of
 * an existing app role into line, and never touches the role itself. Before, it returned without connecting, so a trail table made by
 * the migration kept the UPDATE and DELETE that default privileges give the moment a table is created.
 *
 * The role here is this file's own, a real LOGIN role with a password generated here and never printed, so "the login and the password
 * are kept" is a real check (read from pg_authid; the scratch connection is a superuser). The newly made trail table is SulitAccessEvent,
 * which Phase 3a has not made yet; both are removed afterwards, whatever happens, so 3a's migration finds neither.
 */

const ROLE = `perolehan_refresh_test_${Date.now().toString(36)}`;
const NEW_TRAIL_TABLE = "SulitAccessEvent";

const authid = async () =>
  (await db.$queryRawUnsafe<{ login: boolean; secret: string | null }[]>(`SELECT rolcanlogin AS login, rolpassword AS secret FROM pg_authid WHERE rolname = $1`, ROLE))[0];
const can = async (right: string) =>
  (await db.$queryRawUnsafe<{ yes: boolean }[]>(`SELECT has_table_privilege($1, format('%I.%I', current_schema(), $2::text), $3) AS yes`, ROLE, NEW_TRAIL_TABLE, right))[0].yes;

describe("db:roles without a password keeps the role and still revokes (Phase 1d review)", () => {
  it("a second run with no password keeps LOGIN and the password, and revokes on a trail table made since the first", { timeout: 120_000 }, async () => {
    const [present] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM pg_tables WHERE schemaname = current_schema() AND tablename = $1`, NEW_TRAIL_TABLE);
    // If Phase 3a has made the table, this test must pick another not-yet-made trail table rather than drop a real one.
    expect(Number(present.n), `${NEW_TRAIL_TABLE} exists now: choose another table this test may make and remove`).toBe(0);
    try {
      const first = await db.$transaction((tx) => applyAppRole(tx, { role: ROLE, password: randomBytes(24).toString("base64url") }));
      expect(first).toMatchObject({ ok: true, created: true });
      expect(first.ok && first.notYetPresent).toContain(NEW_TRAIL_TABLE);
      const before = await authid();
      expect(before.login).toBe(true);
      expect(before.secret).toBeTruthy();

      // The migration makes the table, as the owner: default privileges hand the role every write on it at once.
      await db.$executeRawUnsafe(`CREATE TABLE "${NEW_TRAIL_TABLE}" ("id" text PRIMARY KEY)`);
      expect(await can("UPDATE")).toBe(true);
      expect(await can("DELETE")).toBe(true);

      const second = await db.$transaction((tx) => refreshAppGrants(tx, { role: ROLE }));
      expect(second).toMatchObject({ ok: true });
      expect(second.ok && second.notYetPresent).not.toContain(NEW_TRAIL_TABLE);
      expect(await can("UPDATE")).toBe(false);
      expect(await can("DELETE")).toBe(false);
      expect(await can("TRUNCATE")).toBe(false);
      expect(await can("INSERT")).toBe(true);
      expect(await can("SELECT")).toBe(true);

      // The role itself is as it was: still a login, with the same password.
      expect(await authid()).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${NEW_TRAIL_TABLE}"`);
      // DROP OWNED takes the role's grants and its default privileges with it, so DROP ROLE can go through.
      await db.$executeRawUnsafe(`DROP OWNED BY ${ROLE}`).catch(() => undefined);
      await db.$executeRawUnsafe(`DROP ROLE IF EXISTS ${ROLE}`);
    }
  });

  it("makes nothing for a role that does not exist, and refuses the owner's own login", async () => {
    expect(await db.$transaction((tx) => refreshAppGrants(tx, { role: `perolehan_absent_${Date.now().toString(36)}` }))).toMatchObject({ ok: false, fault: "ROLE_ABSENT" });
    const [{ owner }] = await db.$queryRawUnsafe<{ owner: string }[]>(`SELECT current_user::text AS owner`);
    expect(await db.$transaction((tx) => refreshAppGrants(tx, { role: owner }))).toMatchObject({ ok: false, fault: "ROLE_IS_OWNER" });
  });
});
