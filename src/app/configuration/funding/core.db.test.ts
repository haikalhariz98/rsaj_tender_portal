import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

/**
 * Settings › Funding's editors (ADR 0046, plan step 3), through the real saves: a save audited with its before and after in words, the code
 * fixed once saved, an unknown category refused, "only these" with none refused, and a retirement and a restore audited with their reason.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveFundingSource, saveImpactMeasure, saveProjectCategory, setFundingRowRetired } from "./core";

let organisationId = "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const trail = (entityId: string) => db.auditEntry.findMany({ where: { entityId }, orderBy: { at: "asc" }, select: { action: true, reason: true, changes: true } });

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `FUND_${randomId()}`, name: "Funding settings", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  const person = await makeAccount(organisationId, { admin: true });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error("session");
  who.actor = read.actor as StaffActor;
});

describe("project categories and impact measures", () => {
  it("a category and a measure save, each audited", async () => {
    expect(await saveProjectCategory({ ok: false }, form({ code: "WATER", nameEn: "Water storage", provenance: "ASSUMED" }))).toEqual({ ok: true });
    expect(await saveImpactMeasure({ ok: false }, form({ code: "ML", nameEn: "Storage added", unit: "ML", provenance: "ASSUMED" }))).toEqual({ ok: true });
    const c = await db.projectCategory.findFirstOrThrow({ where: { organisationId, code: "WATER" } });
    const m = await db.impactMeasure.findFirstOrThrow({ where: { organisationId, code: "ML" } });
    expect((await trail(c.id)).map((t) => t.action)).toEqual(["CREATE"]);
    expect((await trail(m.id)).map((t) => t.action)).toEqual(["CREATE"]);
  });
});

describe("funding sources", () => {
  it("saves, audited in words, and its code is fixed once saved", async () => {
    const out = await saveFundingSource({ ok: false }, form({ code: "SUK", nameEn: "Sukuk", envelope: "1,000,000.00", eligibility: "ONLY", eligibleCategoryCodes: "WATER", eligibilityProvenance: "ASSUMED", provenance: "STATED" }));
    expect(out, JSON.stringify(out)).toEqual({ ok: true });
    const row = await db.fundingSource.findFirstOrThrow({ where: { organisationId, code: "SUK" } });
    expect([row.envelope?.toString(), row.categoriesRestricted, row.eligibleCategoryCodes]).toEqual(["1000000", true, ["WATER"]]);
    expect(JSON.stringify((await trail(row.id))[0].changes)).toContain("Water storage");

    // An edit that posts another code changes the name only.
    expect(await saveFundingSource({ ok: false }, form({ id: row.id, code: "OTHER", nameEn: "Sukuk Tranche 1", envelope: "1000000.00", eligibility: "ONLY", eligibleCategoryCodes: "WATER", eligibilityProvenance: "ASSUMED", provenance: "STATED" }))).toEqual({ ok: true });
    const after = await db.fundingSource.findUniqueOrThrow({ where: { id: row.id } });
    expect([after.code, after.nameEn]).toEqual(["SUK", "Sukuk Tranche 1"]);
    expect((await trail(row.id)).map((t) => t.action)).toEqual(["CREATE", "UPDATE"]);
  });

  it("refuses a category the organisation does not have, and 'only these' with none chosen", async () => {
    const unknown = await saveFundingSource({ ok: false }, form({ code: "BAD", nameEn: "Bad", eligibility: "ONLY", eligibleCategoryCodes: "NOPE", provenance: "ASSUMED" }));
    expect(unknown).toMatchObject({ ok: false, errors: { eligibleCategoryCodes: expect.any(String) } });
    const none = await saveFundingSource({ ok: false }, form({ code: "BAD", nameEn: "Bad", eligibility: "ONLY", provenance: "ASSUMED" }));
    expect(none).toMatchObject({ ok: false, errors: { eligibleCategoryCodes: expect.any(String) } });
    expect(await db.fundingSource.count({ where: { organisationId, code: "BAD" } })).toBe(0);
  });

  it("not set keeps no list and no basis; any category keeps no list", async () => {
    expect(await saveFundingSource({ ok: false }, form({ code: "NS", nameEn: "Grant", eligibleCategoryCodes: "WATER", eligibilityProvenance: "STATED", provenance: "ASSUMED" }))).toEqual({ ok: true });
    expect(await saveFundingSource({ ok: false }, form({ code: "ANY", nameEn: "Internal", eligibility: "ANY", eligibleCategoryCodes: "WATER", provenance: "ASSUMED" }))).toEqual({ ok: true });
    const ns = await db.fundingSource.findFirstOrThrow({ where: { organisationId, code: "NS" } });
    const any = await db.fundingSource.findFirstOrThrow({ where: { organisationId, code: "ANY" } });
    expect([ns.categoriesRestricted, ns.eligibleCategoryCodes, ns.eligibilityProvenance, ns.envelope]).toEqual([null, [], null, null]);
    expect([any.categoriesRestricted, any.eligibleCategoryCodes]).toEqual([false, []]);
  });

  it("a retirement and a restore are audited with their reason", async () => {
    const row = await db.fundingSource.findFirstOrThrow({ where: { organisationId, code: "NS" } });
    expect(await setFundingRowRetired({ ok: false }, form({ entity: "FundingSource", id: row.id, retiredOn: "2026-10-01" }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect(await setFundingRowRetired({ ok: false }, form({ entity: "FundingSource", id: row.id, retiredOn: "2026-10-01", reason: "Grant closed" }))).toEqual({ ok: true });
    expect((await db.fundingSource.findUniqueOrThrow({ where: { id: row.id } })).retiredOn?.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(await setFundingRowRetired({ ok: false }, form({ entity: "FundingSource", id: row.id, restore: "1", reason: "Reopened" }))).toEqual({ ok: true });
    expect((await db.fundingSource.findUniqueOrThrow({ where: { id: row.id } })).retiredOn).toBeNull();
    const t = await trail(row.id);
    expect(t.slice(-2).map((x) => [x.action, x.reason])).toEqual([["UPDATE", "Grant closed"], ["UPDATE", "Reopened"]]);
  });
});
