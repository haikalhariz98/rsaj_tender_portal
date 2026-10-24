import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import { SUPPLIER_EXPIRY_EVENT } from "@/lib/suppliers/expiry";

/** The supplier-expiry rule is read by suppliers in the portal, so it saves active with no office; any other active rule still needs one. */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveNotificationRule } from "./core";

let organisationId = "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `NX_${randomId()}`, name: "Notification expiry" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  const person = await makeAccount(organisationId, { admin: false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error("session");
  who.actor = read.actor as StaffActor;
});

describe("an active notification rule with no recipient offices", () => {
  const base = { nameEn: "Rule", isActive: "on", provenance: "ASSUMED", recipientRoleCodes: "", reminderOffsetDays: "30" };
  it("is saved for the supplier-expiry event", async () => {
    // Loaded by the RSAJ pack, so it exists before it is re-saved.
    const rule = await db.notificationRule.create({ data: { organisationId, eventKey: SUPPLIER_EXPIRY_EVENT, nameEn: "Supplier document expiring", recipientRoleCodes: [], reminderOffsetDays: [90], isActive: true } });
    const out = await saveNotificationRule({ ok: false }, form({ ...base, id: rule.id }));
    expect(out.errors ?? out.message).toBeUndefined();
    expect(await db.notificationRule.count({ where: { organisationId, eventKey: SUPPLIER_EXPIRY_EVENT, isActive: true } })).toBe(1);
  });
  it("is still refused for any other event", async () => {
    const out = await saveNotificationRule({ ok: false }, form({ ...base, eventKey: "other.event" }));
    expect(out.errors?.recipientRoleCodes).toContain("at least one recipient");
  });
});
