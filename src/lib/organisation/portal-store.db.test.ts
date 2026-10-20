import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { testOrganisation } from "@/lib/test-db/auth-fixtures";

import { storePortalPage } from "./portal-store";

/**
 * The supplier portal's front-door words, written against the scratch database (design note 0006, rulings L3 and L4): one row per organisation, stored as given
 * after tidying, the address kept as its origin, and every change recorded with its before and after in the same transaction.
 */

let organisationId: string;
let who: { organisationId: string; organisationName: string; actor: { kind: "SYSTEM"; label: string } };

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  who = { organisationId, organisationName: "Example", actor: { kind: "SYSTEM", label: "test" } };
});

describe("saving the supplier portal's words", () => {
  it("writes one row, keeps the address as its origin, and records it", async () => {
    expect(await db.organisationPortalPage.findUnique({ where: { organisationId } })).toBeNull();
    const out = await storePortalPage(db, who, { publicAddress: "https://suppliers.example.com/path?x=1", headline: "Join us", highlight1: "Register", highlight1Icon: "Building" }, "First setting");
    expect(out).toEqual({ ok: true, changed: true });
    const row = await db.organisationPortalPage.findUniqueOrThrow({ where: { organisationId } });
    expect(row.publicAddress).toBe("https://suppliers.example.com");
    expect(row.highlight1Icon).toBe("building");
    expect(row.line).toBeNull();
    const trail = await db.auditEntry.findMany({ where: { entity: "OrganisationPortalPage", entityId: row.id } });
    expect(trail).toHaveLength(1);
    expect(trail[0]!.action).toBe("CREATE");
    expect(trail[0]!.reason).toBe("First setting");
  });

  it("the same words again change nothing and record nothing; a change records its before and after", async () => {
    const row = await db.organisationPortalPage.findUniqueOrThrow({ where: { organisationId } });
    expect(await storePortalPage(db, who, { publicAddress: "https://suppliers.example.com", headline: "Join us", highlight1: "Register", highlight1Icon: "building" })).toEqual({ ok: true, changed: false });
    expect(await db.auditEntry.count({ where: { entity: "OrganisationPortalPage", entityId: row.id } })).toBe(1);
    expect(await storePortalPage(db, who, { publicAddress: "https://suppliers.example.com", headline: "Join the register", highlight1: "Register", highlight1Icon: "building" })).toEqual({ ok: true, changed: true });
    const trail = await db.auditEntry.findMany({ where: { entity: "OrganisationPortalPage", entityId: row.id }, orderBy: { at: "asc" } });
    expect(trail).toHaveLength(2);
    expect(trail[1]!.action).toBe("UPDATE");
    expect(JSON.stringify(trail[1]!.changes)).toContain("Join the register");
  });

  it("refuses a script address, a long headline and an icon outside the set, writes nothing, and says which field", async () => {
    const before = await db.organisationPortalPage.findUniqueOrThrow({ where: { organisationId } });
    const out = await storePortalPage(db, who, { publicAddress: "javascript:alert(1)", headline: "x".repeat(61), highlight2Icon: "skull" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(Object.keys(out.errors).sort()).toEqual(["headline", "highlight2Icon", "publicAddress"]);
    expect(await db.organisationPortalPage.findUniqueOrThrow({ where: { organisationId } })).toEqual(before);
  });

  it("blank clears a setting", async () => {
    expect(await storePortalPage(db, who, {})).toEqual({ ok: true, changed: true });
    const row = await db.organisationPortalPage.findUniqueOrThrow({ where: { organisationId } });
    expect([row.publicAddress, row.headline, row.line, row.highlight1, row.highlight1Icon]).toEqual([null, null, null, null, null]);
  });

  it("a blank save for an organisation with no row writes no row and records nothing", async () => {
    const other = (await db.organisation.create({ data: { code: `portal-blank-${Date.now()}`, name: "Portal blank" }, select: { id: true } })).id;
    expect(await storePortalPage(db, { ...who, organisationId: other }, {})).toEqual({ ok: true, changed: false });
    expect(await db.organisationPortalPage.findUnique({ where: { organisationId: other } })).toBeNull();
  });
});
