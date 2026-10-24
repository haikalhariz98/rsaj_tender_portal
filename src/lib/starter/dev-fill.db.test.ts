import { afterAll, describe, expect, it } from "vitest";

import DEV_FILL_PACK from "../../../prisma/dev-fill";
import { demoIsLoaded } from "../../../prisma/demo-sign-in";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";

import { loadPacks } from "./apply";

/**
 * The development fill (plan step 4.6, SP-23), with the CLI's own marker of a demonstration database: it refuses where the demonstration is not
 * loaded, with approval by another admin on or off, writing nothing; where it is, it turns the switch off with one audit row as its own SYSTEM
 * actor, fills the project document class, the register's classes and the three demo declarations, and a second run writes nothing.
 */
const plain = db as unknown as PrismaClient;
const opts = (apply: boolean) => ({ apply, demoIsLoaded: (tx: unknown, organisationId: string) => demoIsLoaded(tx as PrismaClient, organisationId) });
const ACTOR = "Development fill (founder's instruction 2026-10-23)";
let unitId: string | null = null;
const extraUnits: string[] = [];

const organisation = (twoPersonChanges: boolean) =>
  db.organisation.create({ data: { code: `DEVFILL_${randomId()}`, name: "Dev fill test", timeZone: "Asia/Kuala_Lumpur", securityPolicy: { create: { twoPersonChanges } } }, select: { id: true } });

afterAll(async () => {
  // The marker is any demo_ unit in the database: take it away so later files in this run read no demonstration.
  if (unitId) await db.orgUnit.delete({ where: { id: unitId } });
  if (extraUnits.length > 0) await db.orgUnit.deleteMany({ where: { id: { in: extraUnits } } });
});

describe("the development fill without the demonstration", () => {
  it.each([true, false])("refuses with approval by another admin %s, writing nothing", async (on) => {
    expect(await demoIsLoaded(plain)).toBe(false);
    const org = await organisation(on);
    const r = await loadPacks(db, org.id, [DEV_FILL_PACK], opts(true));
    expect(r.faults).toEqual(["The development fill loads only into a database that holds the demonstration."]);
    expect(r.applied).toBe(false);
    expect((await db.securityPolicy.findUniqueOrThrow({ where: { organisationId: org.id } })).twoPersonChanges).toBe(on);
    expect(await db.auditEntry.count({ where: { organisationId: org.id } })).toBe(0);
  });
});

describe("the development fill on a demonstration database", () => {
  let orgId = "";
  const audits = () => db.auditEntry.findMany({ where: { organisationId: orgId }, select: { entity: true, actorKind: true, actorSystemLabel: true, reason: true } });

  it("turns the switch off with one audit row, then fills what is unset", async () => {
    orgId = (await organisation(true)).id;
    unitId = `demo_ou${randomId()}`;
    await db.orgUnit.create({ data: { id: unitId, organisationId: orgId, code: "DU", nameEn: "Demo unit", kind: "SECTION", effectiveFrom: new Date("2026-01-01") } });
    await db.documentClass.createMany({ data: [
      { id: "demo_dc1", organisationId: orgId, code: "internal", nameEn: "Contract documents", classification: "INTERNAL" },
      { id: "demo_dc2", organisationId: orgId, code: "certificates", nameEn: "Certificates", classification: "SULIT" },
    ] });
    await db.documentStorePolicy.create({ data: { organisationId: orgId, allowedMediaTypes: ["application/pdf"], maxBytes: 1_048_576n } });

    const dry = await loadPacks(db, orgId, [DEV_FILL_PACK], opts(false));
    expect(dry.faults).toEqual([]);
    expect(await db.auditEntry.count({ where: { organisationId: orgId } })).toBe(0);

    const r = await loadPacks(db, orgId, [DEV_FILL_PACK], opts(true));
    expect(r.faults).toEqual([]);
    expect(r.applied).toBe(true);
    expect((await db.securityPolicy.findUniqueOrThrow({ where: { organisationId: orgId } })).twoPersonChanges).toBe(false);

    const rows = await audits();
    expect(rows).toHaveLength(r.writes.length);
    expect(new Set(rows.map((x) => `${x.actorKind} ${x.actorSystemLabel}`))).toEqual(new Set([`SYSTEM ${ACTOR}`]));
    const switchRows = rows.filter((x) => x.entity === "SecurityPolicy");
    expect(switchRows).toHaveLength(1);
    expect(switchRows[0].reason).toMatch(/we don't need second approver until after go live/);

    expect((await db.documentStorePolicy.findUniqueOrThrow({ where: { organisationId: orgId } })).projectDocumentClassId).toBe("demo_dc1");
    expect(await db.supplierPolicy.findUniqueOrThrow({ where: { organisationId: orgId } })).toMatchObject({
      supplierUploadClassId: "demo_dc1",
      supplierBankStatementClassId: "demo_dc2",
      uploadClassProvenance: "ASSUMED",
      personalDataProvenance: "ASSUMED",
      helpProvenance: "ASSUMED",
    });
    const texts = await db.declarationText.findMany({ where: { organisationId: orgId }, select: { kind: true, version: true, provenance: true, bodyEn: true } });
    expect(texts.map((t) => t.kind).sort()).toEqual(["FALSE_DECLARATION", "GIRO_AUTHORISATION", "TERMS_AND_CONDITIONS"]);
    for (const t of texts) expect(t).toMatchObject({ version: 1, provenance: "ASSUMED", bodyEn: expect.stringContaining("demo text, replace before go-live") });
  });

  it("refuses another organisation on the same database, which holds no demonstration of its own (step 4.8 M4)", async () => {
    const other = await organisation(true);
    expect(await demoIsLoaded(plain)).toBe(true);
    const r = await loadPacks(db, other.id, [DEV_FILL_PACK], opts(true));
    expect(r.faults).toEqual(["The development fill loads only into a database that holds the demonstration."]);
    expect((await db.securityPolicy.findUniqueOrThrow({ where: { organisationId: other.id } })).twoPersonChanges).toBe(true);
    expect(await db.auditEntry.count({ where: { organisationId: other.id } })).toBe(0);
  });

  it("faults a literal class id that is another organisation's, writing nothing (step 4.8 M4)", async () => {
    const other = await organisation(true);
    const id = `demo_ou${randomId()}`;
    extraUnits.push(id);
    await db.orgUnit.create({ data: { id, organisationId: other.id, code: "DU", nameEn: "Demo unit", kind: "SECTION", effectiveFrom: new Date("2026-01-01") } });
    const r = await loadPacks(db, other.id, [DEV_FILL_PACK], opts(true));
    expect(r.applied).toBe(false);
    expect(r.faults).toContain("Upload rules · project documents: projectDocumentClassId names a document class that is not this organisation's.");
    expect((await db.securityPolicy.findUniqueOrThrow({ where: { organisationId: other.id } })).twoPersonChanges).toBe(true);
    expect(await db.auditEntry.count({ where: { organisationId: other.id } })).toBe(0);
  });

  it("writes nothing the second time", async () => {
    const before = (await audits()).length;
    const r = await loadPacks(db, orgId, [DEV_FILL_PACK], opts(true));
    expect(r.faults).toEqual([]);
    expect(r.writes).toEqual([]);
    expect((await audits()).length).toBe(before);
  });
});
