import { describe, expect, it } from "vitest";

import { APPEND_ONLY_TABLES, grantStatements, notYetPresent, roleNameFault, RUNTIME_ROLE_WORDS, runtimeRoleVerdict, WITHHELD } from "./db-role";

// BlobContent joined the protected tables in the Phase 1d review (stored bytes are never rewritten), so the "every table exists" set has it.
const ALL = new Set(["Organisation", "AuditEntry", "SignInEvent", "SignInEventDetail", "DocumentAccessEvent", "SulitAccessEvent", "BlobContent", "_prisma_migrations"]);
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

  it("revokes UPDATE and TRUNCATE on stored bytes, and leaves DELETE so an orphan can be cleared", () => {
    const s = grants();
    expect(s).toContain(`REVOKE UPDATE, TRUNCATE ON TABLE "public"."BlobContent" FROM "perolehan_app"`);
    expect(s.some((x) => x.startsWith("REVOKE") && x.includes("BlobContent") && x.includes("DELETE"))).toBe(false);
  });

  it("the runtime check asks about exactly what the script revokes", () => {
    for (const w of WITHHELD) {
      if (w.revoke !== "ALL") expect(w.held).toBe(w.revoke);
    }
    expect(WITHHELD.map((w) => w.table)).toEqual(["_prisma_migrations", ...APPEND_ONLY_TABLES, "BlobContent"]);
  });

  it("skips a listed table that does not exist yet, and reports it", () => {
    // BlobContent is in this set since the Phase 1d review, so the one table still to come is SulitAccessEvent, as before.
    const now = new Set(["AuditEntry", "SignInEvent", "SignInEventDetail", "DocumentAccessEvent", "BlobContent"]);
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
  const app = { name: "perolehan_app", isSuperuser: false, ownsSchemaObjects: false, withheldHeld: [] as string[] };
  it("the separate role is safe", () => {
    expect(runtimeRoleVerdict(app, true)).toEqual({ safe: true });
    expect(runtimeRoleVerdict(app, false)).toEqual({ safe: true });
  });
  it("a superuser refuses sign-in in production, and only warns in development", () => {
    const su = { ...app, name: "perolehan", isSuperuser: true };
    // `tables` joined the verdict in the Phase 1d review (it names what a TRAIL_WRITABLE login holds); empty here.
    expect(runtimeRoleVerdict(su, true)).toEqual({ safe: false, reason: "SUPERUSER", name: "perolehan", refuseSignIn: true, tables: [] });
    expect(runtimeRoleVerdict(su, false)).toEqual({ safe: false, reason: "SUPERUSER", name: "perolehan", refuseSignIn: false, tables: [] });
  });
  it("an owner that is not a superuser is refused the same way", () => {
    const owner = { ...app, name: "owner", ownsSchemaObjects: true };
    expect(runtimeRoleVerdict(owner, true)).toMatchObject({ safe: false, reason: "OWNER", refuseSignIn: true });
    expect(runtimeRoleVerdict(owner, false)).toMatchObject({ safe: false, reason: "OWNER", refuseSignIn: false });
  });
  it("a separate login that can still change the trail is refused the same way, and named for what it holds", () => {
    const wide = { ...app, withheldHeld: ["DocumentAccessEvent"] };
    expect(runtimeRoleVerdict(wide, true)).toEqual({ safe: false, reason: "TRAIL_WRITABLE", name: "perolehan_app", refuseSignIn: true, tables: ["DocumentAccessEvent"] });
    expect(runtimeRoleVerdict(wide, false)).toMatchObject({ safe: false, reason: "TRAIL_WRITABLE", refuseSignIn: false });
  });
  it("superuser, then owner, then the grants: the strongest reason is the one given", () => {
    expect(runtimeRoleVerdict({ ...app, isSuperuser: true, ownsSchemaObjects: true, withheldHeld: ["AuditEntry"] }, true)).toMatchObject({ reason: "SUPERUSER" });
    expect(runtimeRoleVerdict({ ...app, ownsSchemaObjects: true, withheldHeld: ["AuditEntry"] }, true)).toMatchObject({ reason: "OWNER" });
  });
  it("the owner and superuser sentences on the accounts screen are the ones it showed before the words moved here", () => {
    // The screen renders "It runs as " + words + ".". These are the sentences its JSX rendered before the Phase 1d review.
    expect(`It runs as ${RUNTIME_ROLE_WORDS.OWNER}.`).toBe(
      "It runs as the owner of the tables, not as the app's own database role, so nothing but the trail's triggers stops a change to the audit trail or the sign-in log.",
    );
    expect(`It runs as ${RUNTIME_ROLE_WORDS.SUPERUSER}.`).toBe(
      "It runs as the database superuser, not as the app's own database role, so nothing but the trail's triggers stops a change to the audit trail or the sign-in log.",
    );
  });
  it("every reason has words for the screen, and none of them is a code", () => {
    for (const words of Object.values(RUNTIME_ROLE_WORDS)) expect(words).not.toMatch(/[A-Z]{2,}_|[a-z]+[A-Z][a-z]+[A-Z]|_prisma/);
  });
});
