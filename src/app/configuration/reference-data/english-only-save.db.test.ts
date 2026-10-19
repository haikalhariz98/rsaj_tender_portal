import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * Founder, 2026-10-19: every screen is English only. The Configuration editors no longer show a Malay input; each carries the stored Malay through as a hidden field
 * (`{ kind: "hidden", name: "nameMs" }`, posted from the row's own values). Saving an edit must therefore leave a stored Malay name exactly as it was, and an edit that
 * changes the English name must not touch it. Held against the scratch database, through the real save.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveFundingRoute } from "./core";

let organisationId = "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `EO_${randomId()}`, name: "English only", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  const person = await makeAccount(organisationId, { admin: true });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error("session");
  who.actor = read.actor as StaffActor;
});

describe("English-only editors keep the stored Malay", () => {
  it("saving a funding route with its hidden Malay leaves the stored Malay as it was", async () => {
    const row = await db.fundingRoute.create({ data: { organisationId, code: `FR_${randomId()}`, nameEn: "Federal grant", nameMs: "Pemberian persekutuan", provenance: "ASSUMED" } });
    // What the editor posts: the visible fields, and the row's own Malay in the hidden input.
    const out = await saveFundingRoute({ ok: false }, form({ id: row.id, nameEn: "Federal grant (revised)", nameMs: row.nameMs ?? "", organisationProcures: "on", provenance: "ASSUMED" }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
    const after = await db.fundingRoute.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.nameEn).toBe("Federal grant (revised)");
    expect(after.nameMs).toBe("Pemberian persekutuan");
  });
});
