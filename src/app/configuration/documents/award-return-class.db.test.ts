import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { AWARD_RETURN_CLASS_NOT_OURS, AWARD_RETURN_CLASS_NOT_SULIT } from "@/lib/documents/award-return-class";
import { loadStorePolicy } from "@/lib/documents/service";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Configuration, Documents: the class for returned award documents (ADR 0045, WV-5), against the scratch database. It must be one of this organisation's classes and SULIT
 * (`awardReturnClassFault`: the acceptance page holds an identity card number); a save that does not post the field leaves it as it was; the trail names the class.
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
let sulitClass = "";
let internalClass = "";
let unclassified = "";
let foreignSulit = "";

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `AR_${run}`, name: "Award return class test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  const other = await db.organisation.create({ data: { code: `AS_${run}`, name: "Another organisation", timeZone: "Asia/Kuala_Lumpur" } });
  const admin = await makePerson(organisationId, `Config admin ${run}`);
  h.who = { kind: "STAFF", accountId: "a", sessionId: "s", personId: admin.id, personName: "Admin", jobTitle: null, isAdministrator: true, organisationId, organisationCode: org.code, organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false } as unknown as StaffActor;
  sulitClass = (await db.documentClass.create({ data: { organisationId, code: "ar_sul", nameEn: "Returned awards", classification: "SULIT" } })).id;
  internalClass = (await db.documentClass.create({ data: { organisationId, code: "ar_int", nameEn: "Internal class", classification: "INTERNAL" } })).id;
  unclassified = (await db.documentClass.create({ data: { organisationId, code: "ar_un", nameEn: "Unclassified class" } })).id;
  foreignSulit = (await db.documentClass.create({ data: { organisationId: other.id, code: "ar_for", nameEn: "Foreign class", classification: "SULIT" } })).id;
});

const stored = () => db.documentStorePolicy.findUnique({ where: { organisationId } });
const trail = () => db.auditEntry.findMany({ where: { organisationId, entity: "DocumentStorePolicy" }, orderBy: { at: "asc" } });

describe("the class for returned award documents", () => {
  it("refuses a non-SULIT, an unclassified and another organisation's class, with the library's words, and writes nothing", async () => {
    const internal = await saveStorePolicy({ ok: true }, form({ ...base, awardReturnClassId: internalClass }));
    expect(internal).toMatchObject({ ok: false, errors: { awardReturnClassId: AWARD_RETURN_CLASS_NOT_SULIT } });
    const none = await saveStorePolicy({ ok: true }, form({ ...base, awardReturnClassId: unclassified }));
    expect(none).toMatchObject({ ok: false, errors: { awardReturnClassId: AWARD_RETURN_CLASS_NOT_SULIT } });
    const foreign = await saveStorePolicy({ ok: true }, form({ ...base, awardReturnClassId: foreignSulit }));
    expect(foreign).toMatchObject({ ok: false, errors: { awardReturnClassId: AWARD_RETURN_CLASS_NOT_OURS } });
    expect(await stored()).toBeNull();
  });

  it("saves a SULIT class and the audit row names it, before and after, never its id", async () => {
    expect((await saveStorePolicy({ ok: true }, form({ ...base, awardReturnClassId: "" }))).ok).toBe(true);
    expect((await stored())?.awardReturnClassId).toBeNull();
    expect((await saveStorePolicy({ ok: true }, form({ ...base, awardReturnClassId: sulitClass, reason: "Set the class" }))).ok).toBe(true);
    expect((await stored())?.awardReturnClassId).toBe(sulitClass);
    expect((await loadStorePolicy(organisationId)).awardReturnClassId).toBe(sulitClass);
    const last = (await trail()).at(-1)!;
    expect(last.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "awardReturnClass", before: "Not set", after: "Returned awards" })]));
    expect(JSON.stringify(last.changes)).not.toContain(sulitClass);
  });

  it("a save that does not post the field leaves the stored class unchanged; an empty field unsets it", async () => {
    const out = await saveStorePolicy({ ok: true }, form({ ...base, notes: "Edited without the field" }));
    expect(out.ok).toBe(true);
    expect(await stored()).toMatchObject({ awardReturnClassId: sulitClass, notes: "Edited without the field" });
    expect(JSON.stringify((await trail()).at(-1)!.changes)).not.toContain("awardReturnClass");
    expect((await saveStorePolicy({ ok: true }, form({ ...base, awardReturnClassId: "" }))).ok).toBe(true);
    expect((await stored())?.awardReturnClassId).toBeNull();
  });
});
