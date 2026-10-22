import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { loadProjectClassChoices, loadStorePolicy } from "@/lib/documents/service";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Configuration, Documents: the class for project files (simple Project workspace, step 3), against the scratch database. It must be one of this organisation's classes, classified,
 * and not SULIT; a save that does not post the field leaves it as it was (a proposal staged before the field existed, decided later); the trail names the class before and after.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => h.who! };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveStorePolicy } from "./core";

const run = randomId();
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const base = { provenance: "ASSUMED", notes: "" };
let organisationId = "";
let internalClass = "";
let publicClass = "";
let sulitClass = "";
let unclassified = "";
let foreignClass = "";

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `PC_${run}`, name: "Project class test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  const other = await db.organisation.create({ data: { code: `PD_${run}`, name: "Another organisation", timeZone: "Asia/Kuala_Lumpur" } });
  const admin = await makePerson(organisationId, `Config admin ${run}`);
  h.who = { kind: "STAFF", accountId: "a", sessionId: "s", personId: admin.id, personName: "Admin", jobTitle: null, isAdministrator: true, organisationId, organisationCode: org.code, organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false } as unknown as StaffActor;
  internalClass = (await db.documentClass.create({ data: { organisationId, code: "pc_int", nameEn: "Project files class", classification: "INTERNAL", sortOrder: 2 } })).id;
  publicClass = (await db.documentClass.create({ data: { organisationId, code: "pc_pub", nameEn: "Public class", classification: "PUBLIC", sortOrder: 1 } })).id;
  sulitClass = (await db.documentClass.create({ data: { organisationId, code: "pc_sul", nameEn: "Sulit class", classification: "SULIT" } })).id;
  unclassified = (await db.documentClass.create({ data: { organisationId, code: "pc_un", nameEn: "Unclassified class" } })).id;
  foreignClass = (await db.documentClass.create({ data: { organisationId: other.id, code: "pc_for", nameEn: "Foreign class", classification: "INTERNAL" } })).id;
});

const stored = () => db.documentStorePolicy.findUnique({ where: { organisationId } });
const trail = () => db.auditEntry.findMany({ where: { organisationId, entity: "DocumentStorePolicy" }, orderBy: { at: "asc" } });

describe("the class for project files", () => {
  it("refuses a SULIT class, an unclassified class and another organisation's class, and writes nothing", async () => {
    const sulit = await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: sulitClass }));
    expect(sulit).toMatchObject({ ok: false, errors: { projectDocumentClassId: "A contractor downloads project files, so their class cannot be SULIT. Choose another class." } });
    const none = await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: unclassified }));
    expect(none).toMatchObject({ ok: false, errors: { projectDocumentClassId: "Set this class's classification first. A project file is downloaded by the contractor, so its class must be classified." } });
    const foreign = await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: foreignClass }));
    expect(foreign).toMatchObject({ ok: false, errors: { projectDocumentClassId: "Choose one of this organisation's document classes." } });
    expect(await stored()).toBeNull();
  });

  it("saves a classified, non-SULIT class and the audit row names it, before and after", async () => {
    expect((await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: "" }))).ok).toBe(true);
    expect((await stored())?.projectDocumentClassId).toBeNull();
    expect((await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: internalClass, reason: "Set the class" }))).ok).toBe(true);
    expect((await stored())?.projectDocumentClassId).toBe(internalClass);
    const last = (await trail()).at(-1)!;
    expect(last.action).toBe("UPDATE");
    expect(last.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "projectDocumentClass", before: "Not set", after: "Project files class" })]));
    expect(JSON.stringify(last.changes)).not.toContain(internalClass);
    expect((await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: publicClass }))).ok).toBe(true);
    expect((await trail()).at(-1)!.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "projectDocumentClass", before: "Project files class", after: "Public class" })]));
  });

  it("a save that does not post the field leaves the stored class unchanged, as a proposal staged without it does when decided", async () => {
    await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: internalClass }));
    const out = await saveStorePolicy({ ok: true }, form({ ...base, notes: "Edited without the field" }));
    expect(out.ok).toBe(true);
    expect(await stored()).toMatchObject({ projectDocumentClassId: internalClass, notes: "Edited without the field" });
    const last = (await trail()).at(-1)!;
    expect(JSON.stringify(last.changes)).not.toContain("projectDocumentClass");
  });

  it("an empty field posted unsets it", async () => {
    expect((await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: "" }))).ok).toBe(true);
    expect((await stored())?.projectDocumentClassId).toBeNull();
  });

  it("the loaders return the stored class and offer only this organisation's classified, non-SULIT classes", async () => {
    await saveStorePolicy({ ok: true }, form({ ...base, projectDocumentClassId: publicClass }));
    expect((await loadStorePolicy(organisationId)).projectDocumentClassId).toBe(publicClass);
    expect(await loadProjectClassChoices(organisationId)).toEqual([
      { value: publicClass, label: "Public class" },
      { value: internalClass, label: "Project files class" },
    ]);
  });
});
