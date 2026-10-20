import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * Founder, 2026-10-20: documents are English only. The template editor no longer asks for a Malay name, a Malay text or the language to issue in; each is a hidden field that posts the
 * row's stored value. Saving an edit must leave a stored Malay text and primary language exactly as they were, and a template with an English text alone saves with no language set.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveTemplate } from "./core";

let organisationId = "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `TE_${randomId()}`, name: "English only templates", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  const person = await makeAccount(organisationId, { admin: true });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error("session");
  who.actor = read.actor as StaffActor;
});

describe("English-only template editor keeps the stored Malay", () => {
  it("saves a template with an English text alone and no language set", async () => {
    const out = await saveTemplate({ ok: false }, form({ code: `en_${randomId()}`.toLowerCase(), nameEn: "Letter", nameMs: "", bodyMs: "", bodyEn: "Dear {{awardee.name}}.", primaryLanguage: "", provenance: "ASSUMED", sortOrder: "0", formCode: "" }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
  });

  it("an edit that changes the English text leaves the stored Malay text, name and primary language as they were", async () => {
    const row = await db.documentTemplate.create({ data: { organisationId, code: `ms_${randomId()}`.toLowerCase(), nameEn: "Notice", nameMs: "Notis", bodyEn: "Dear {{awardee.name}}.", bodyMs: "Tuan {{awardee.name}}.", primaryLanguage: "MS", provenance: "ASSUMED", bodyVersion: 1 } });
    const out = await saveTemplate({ ok: false }, form({ id: row.id, nameEn: "Notice (revised)", nameMs: row.nameMs ?? "", bodyEn: "Dear sir {{awardee.name}}.", bodyMs: row.bodyMs ?? "", primaryLanguage: row.primaryLanguage ?? "", provenance: "ASSUMED", sortOrder: "0", formCode: "" }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
    const after = await db.documentTemplate.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.nameMs).toBe("Notis");
    expect(after.bodyMs).toBe("Tuan {{awardee.name}}.");
    expect(after.primaryLanguage).toBe("MS");
    expect(after.bodyEn).toBe("Dear sir {{awardee.name}}.");
  });

  it("an English edit saves where the stored Malay text names a field the portal does not fill", async () => {
    const row = await db.documentTemplate.create({ data: { organisationId, code: `lk_${randomId()}`.toLowerCase(), nameEn: "Locked", bodyEn: "Dear {{awardee.name}}.", bodyMs: "Tuan {{no.such.field}} {{clause:gone}}.", primaryLanguage: "MS", provenance: "ASSUMED", bodyVersion: 1 } });
    const out = await saveTemplate({ ok: false }, form({ id: row.id, nameEn: "Locked", nameMs: "", bodyEn: "Dear sir {{awardee.name}}.", bodyMs: row.bodyMs ?? "", primaryLanguage: "MS", provenance: "ASSUMED", sortOrder: "0", formCode: "" }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
  });
});
