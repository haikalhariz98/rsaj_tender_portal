import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import { dayToDate, todayIn } from "@/lib/dates";

/**
 * Audit fix batch A #1, against the scratch database: a transfer between budget codes is judged on the locked source, inside the
 * transaction that writes it, on the organisation's day. Two transfers racing for one balance cannot both take it; a transfer dated
 * after today, or made while no time zone is set, is refused. The editor is the real one (`core.ts`, which a second person's decision runs).
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { transferBetweenCodes } from "./core";

const ZONE = "Asia/Kuala_Lumpur";
let organisationId = "";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function signIn(orgId: string) {
  const person = await makeAccount(orgId, { admin: false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: orgId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error("session");
  who.actor = read.actor as StaffActor;
}

/// Two codes in the organisation, the source holding exactly `original`.
async function codes(orgId: string, original: string) {
  const tag = randomId();
  const from = await db.budgetCode.create({ data: { organisationId: orgId, code: `SRC_${tag}`, descriptionEn: "Source", effectiveFrom: dayToDate("2026-01-01") } });
  const to = await db.budgetCode.create({ data: { organisationId: orgId, code: `DST_${tag}`, descriptionEn: "Destination", effectiveFrom: dayToDate("2026-01-01") } });
  await db.budgetMovement.create({ data: { budgetCodeId: from.id, kind: "ORIGINAL", amount: original, occurredOn: dayToDate("2026-01-01") } });
  return { from, to };
}

const today = () => todayIn(new Date(), ZONE)!;

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `BT_${randomId()}`, name: "Budget transfer", timeZone: ZONE } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  await signIn(organisationId);
});

describe("moving allocation between budget codes", () => {
  it("two transfers racing for the same balance: one goes through, the other is refused, and the source never goes below nothing", async () => {
    const { from, to } = await codes(organisationId, "1000.00");
    const post = () => transferBetweenCodes({ ok: false }, form({ fromCodeId: from.id, toCodeId: to.id, amount: "1000.00", occurredOn: today(), reference: "BT/1" }));
    const results = await Promise.all([post(), post()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.find((r) => !r.ok)!;
    expect(refused.errors?.amount).toContain("available");
    const outs = await db.budgetMovement.findMany({ where: { budgetCodeId: from.id, kind: "TRANSFER_OUT" } });
    const ins = await db.budgetMovement.findMany({ where: { budgetCodeId: to.id, kind: "TRANSFER_IN" } });
    expect([outs.length, ins.length]).toEqual([1, 1]);
  });

  it("a transfer dated after the organisation's today is refused, and nothing is written", async () => {
    const { from, to } = await codes(organisationId, "1000.00");
    const tomorrow = new Date(dayToDate(today()).getTime() + 86_400_000).toISOString().slice(0, 10);
    const out = await transferBetweenCodes({ ok: false }, form({ fromCodeId: from.id, toCodeId: to.id, amount: "10.00", occurredOn: tomorrow }));
    expect(out).toMatchObject({ ok: false, errors: { occurredOn: "A transfer cannot be dated after today." } });
    expect(await db.budgetMovement.count({ where: { budgetCodeId: { in: [from.id, to.id] }, kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } })).toBe(0);
  });

  it("with no time zone set there is no today to judge the balance on: refused, never judged on UTC's day", async () => {
    const org = await db.organisation.create({ data: { code: `BTZ_${randomId()}`, name: "Budget transfer, no zone", timeZone: null } });
    await setPolicy(org.id, SETTINGS);
    await signIn(org.id);
    try {
      const { from, to } = await codes(org.id, "1000.00");
      const out = await transferBetweenCodes({ ok: false }, form({ fromCodeId: from.id, toCodeId: to.id, amount: "10.00", occurredOn: "2026-02-01" }));
      expect(out).toMatchObject({ ok: false });
      expect(out.message).toContain("time zone is not set");
      expect(await db.budgetMovement.count({ where: { budgetCodeId: { in: [from.id, to.id] }, kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } })).toBe(0);
    } finally {
      await signIn(organisationId);
    }
  });
});
