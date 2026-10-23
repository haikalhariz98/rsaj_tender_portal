import { beforeAll, describe, expect, it, vi } from "vitest";

// The public register reads the deployment's organisation: point it at this file's own fresh organisation, never the shared AUTH_TEST.
const { CODE } = vi.hoisted(() => ({ CODE: `PACK_${Date.now().toString(36).toUpperCase()}` }));
vi.mock("@/lib/portal/deployment", async (orig) => ({
  ...(await orig<typeof import("@/lib/portal/deployment")>()),
  deploymentOrganisation: (client: typeof import("@/lib/db").db) => client.organisation.findUnique({ where: { code: CODE }, select: { id: true, code: true, timeZone: true } }),
}));

import GENERIC_PACK from "../../../prisma/packs/generic";
import { unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { bootstrapAdministrator } from "@/lib/auth/bootstrap";
import { db } from "@/lib/db";
import { loadRegisterSettings } from "@/lib/portal/apply-repo";
import { APPLY } from "@/lib/portal/labels";
import { randomId, randomPassword } from "@/lib/test-db/auth-fixtures";

import { loadPacks } from "./apply";

/**
 * The generic pack into a fresh organisation (plan step 4.3): a dry run writes nothing; a load fills sign-in, the register's settings and
 * the lists, each write audited as the pack; what the register still lacks is the customer's own texts, its document types and the
 * deployment's four values; an administrator can be bootstrapped; and a second load writes nothing. A live organisation refuses.
 */
let orgId = "";
const audits = () => db.auditEntry.count({ where: { organisationId: orgId } });

beforeAll(async () => {
  orgId = (await db.organisation.create({ data: { code: CODE, name: "Pack test organisation" }, select: { id: true } })).id;
});

describe("loading the generic pack", () => {
  it("writes nothing on a dry run", async () => {
    const r = await loadPacks(db, orgId, [GENERIC_PACK], { apply: false });
    expect(r.faults).toEqual([]);
    expect(r.writes.length).toBeGreaterThan(50);
    expect(r.applied).toBe(false);
    expect(await audits()).toBe(0);
    expect(await db.securityPolicy.count({ where: { organisationId: orgId } })).toBe(0);
  });

  it("loads, creating the security settings with approval by another admin off, one audit row per write as the pack", async () => {
    const r = await loadPacks(db, orgId, [GENERIC_PACK], { apply: true });
    expect(r.faults).toEqual([]);
    expect(r.applied).toBe(true);
    const rows = await db.auditEntry.findMany({ where: { organisationId: orgId }, select: { actorKind: true, actorSystemLabel: true } });
    expect(rows).toHaveLength(r.writes.length);
    expect(new Set(rows.map((x) => `${x.actorKind} ${x.actorSystemLabel}`))).toEqual(new Set(["SYSTEM Starter pack: Generic v1"]));
    expect((await db.securityPolicy.findUniqueOrThrow({ where: { organisationId: orgId } })).twoPersonChanges).toBe(false);
    expect(unsetSettings(await loadSecurityPolicy(db, orgId), "SIGN_IN", "SUPPLIER_SIGN_IN", "SET_PASSWORD", "ISSUE_CODE", "SET_OFFICER_SHARE")).toEqual([]);
  });

  it("shows no code in the trail: no key, kind or list column, and no value of the schema's own codes", async () => {
    const rows = await db.auditEntry.findMany({ where: { organisationId: orgId }, select: { changes: true } });
    const changes = rows.flatMap((r) => r.changes as { field: string; after: unknown }[]);
    expect(changes.map((c) => c.field)).not.toContain("kind");
    expect(changes.map((c) => c.field)).not.toContain("code");
    expect(changes.filter((c) => typeof c.after === "string" && /^[A-Z][A-Z0-9_]+$/.test(c.after) && !/^name|^label/.test(c.field))).toEqual([]);
    // A name in capitals is words, not a code: the SULIT class keeps its name.
    expect(changes).toContainEqual(expect.objectContaining({ field: "nameEn", after: "SULIT" }));
  });

  it("leaves the register lacking only the customer's texts, its document types and the deployment's values", async () => {
    // An empty environment: the store driver has a default (the local disk), so three of the four deployment values read missing.
    const register = await loadRegisterSettings(db, {});
    const m = APPLY.missing;
    expect(register?.missing).toEqual([m.notice, m.termsText, m.falseDeclarationText, m.giroText, m.documentTypes, m.ceiling, m.formKey, m.bodyCap]);
  });

  it("lets an administrator be bootstrapped with no settings typed", async () => {
    const r = await bootstrapAdministrator({ organisationCode: CODE, mode: "FIRST", loginName: `pack.${randomId()}`, password: randomPassword(), person: { name: "Pack Administrator" } });
    expect(r).toMatchObject({ ok: true, policyFilled: [], policyStillUnset: [] });
  });

  it("writes nothing the second time", async () => {
    const before = await audits();
    const r = await loadPacks(db, orgId, [GENERIC_PACK], { apply: true });
    expect(r.faults).toEqual([]);
    expect(r.writes).toEqual([]);
    expect(r.applied).toBe(false);
    expect(await audits()).toBe(before);
  });
});

describe("a live organisation", () => {
  it("refuses, writing nothing, while approval by another admin is on", async () => {
    const live = await db.organisation.create({ data: { code: `${CODE}_LIVE`, name: "Live", securityPolicy: { create: {} } }, select: { id: true } });
    const r = await loadPacks(db, live.id, [GENERIC_PACK], { apply: true });
    expect(r.faults[0]).toMatch(/is on/);
    expect(await db.auditEntry.count({ where: { organisationId: live.id } })).toBe(0);
    expect(await db.documentClass.count({ where: { organisationId: live.id } })).toBe(0);
  });

  it("refuses the development fill on a database without the demonstration", async () => {
    const fill = { name: "dev-fill" as const, version: 1, provenance: "ASSUMED" as const, groups: [], lists: [], setsTwoPersonOff: "DEMO_DATABASE_ONLY" as const };
    const r = await loadPacks(db, orgId, [fill], { apply: true, demoIsLoaded: async () => false });
    expect(r.faults[0]).toMatch(/demonstration/);
  });
});
