import { describe, expect, it } from "vitest";

import { APPEND_ONLY_TABLES, grantStatements, notYetPresent, roleNameFault, runtimeRoleVerdict } from "./db-role";

const ALL = new Set(["Organisation", "AuditEntry", "SignInEvent", "SignInEventDetail", "DocumentAccessEvent", "SulitAccessEvent", "_prisma_migrations"]);
const grants = (existing: ReadonlySet<string> = ALL) => grantStatements({ role: "perolehan_app", owner: "perolehan", schema: "public", existing });

describe("the app role's grants (ADR 0034 D11)", () => {
  it("revokes UPDATE, DELETE and TRUNCATE on every append-only table, including the O-1 side table", () => {
    const s = grants();
    for (const t of APPEND_ONLY_TABLES) expect(s).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "public"."${t}" FROM "perolehan_app"`);
    expect(APPEND_ONLY_TABLES).toEqual(expect.arrayContaining(["AuditEntry", "SignInEvent", "SignInEventDetail", "SulitAccessEvent", "DocumentAccessEvent"]));
  });

  it("revokes only after the broad grant, so a re-run never leaves the trail writable", () => {
    const s = grants();
    const broad = s.findIndex((x) => x.startsWith("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"));
    const firstRevoke = s.findIndex((x) => x.startsWith("REVOKE"));
    expect(broad).toBeGreaterThanOrEqual(0);
    expect(firstRevoke).toBeGreaterThan(broad);
    expect(s.slice(firstRevoke).every((x) => x.startsWith("REVOKE"))).toBe(true);
  });

  it("never grants TRUNCATE, and takes everything away on Prisma's migrations table", () => {
    const s = grants();
    expect(s.filter((x) => x.startsWith("GRANT")).some((x) => x.includes("TRUNCATE"))).toBe(false);
    expect(s).toContain(`REVOKE ALL ON TABLE "public"."_prisma_migrations" FROM "perolehan_app"`);
  });

  it("sets default privileges for tables the owner makes later, named for that owner", () => {
    expect(grants()).toContain(`ALTER DEFAULT PRIVILEGES FOR ROLE "perolehan" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "perolehan_app"`);
  });

  it("skips a listed table that does not exist yet, and reports it", () => {
    const now = new Set(["AuditEntry", "SignInEvent", "SignInEventDetail", "DocumentAccessEvent"]);
    expect(grants(now).some((x) => x.includes("SulitAccessEvent"))).toBe(false);
    expect(notYetPresent(now)).toEqual(["SulitAccessEvent"]);
    expect(notYetPresent(ALL)).toEqual([]);
  });
});

describe("the role's name", () => {
  it("accepts a plain lower-case name", () => expect(roleNameFault("perolehan_app", "perolehan")).toBeNull());
  it("refuses anything that would need quoting", () => {
    for (const bad of ["", "App", "a-b", 'x"; DROP ROLE perolehan; --', "9app", "a".repeat(64)]) expect(roleNameFault(bad, "perolehan")).toBe("ROLE_NAME_INVALID");
  });
  it("refuses the owner's own login, which the script would otherwise strip of its rights", () => expect(roleNameFault("perolehan", "perolehan")).toBe("ROLE_IS_OWNER"));
});

describe("who the running app is", () => {
  const app = { name: "perolehan_app", isSuperuser: false, ownsSchemaObjects: false };
  it("the separate role is safe", () => {
    expect(runtimeRoleVerdict(app, true)).toEqual({ safe: true });
    expect(runtimeRoleVerdict(app, false)).toEqual({ safe: true });
  });
  it("a superuser refuses sign-in in production, and only warns in development", () => {
    const su = { ...app, name: "perolehan", isSuperuser: true };
    expect(runtimeRoleVerdict(su, true)).toEqual({ safe: false, reason: "SUPERUSER", name: "perolehan", refuseSignIn: true });
    expect(runtimeRoleVerdict(su, false)).toEqual({ safe: false, reason: "SUPERUSER", name: "perolehan", refuseSignIn: false });
  });
  it("an owner that is not a superuser is refused the same way", () => {
    const owner = { ...app, name: "owner", ownsSchemaObjects: true };
    expect(runtimeRoleVerdict(owner, true)).toMatchObject({ safe: false, reason: "OWNER", refuseSignIn: true });
    expect(runtimeRoleVerdict(owner, false)).toMatchObject({ safe: false, reason: "OWNER", refuseSignIn: false });
  });
});
