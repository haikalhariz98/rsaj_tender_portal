import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * How documents are sold, and the demonstration payment simulator with the methods it offers, are saved with the window rules (SR-10, rulings 16 and 17), against the scratch database: each is
 * three-way and "not set" is not "off"; the methods are one per line, trimmed, in the order typed, and a repeated or over-long one is refused; the trail says all three in words.
 * (The editor is held for a second person by `stageEdit`; this is the editor's own run, which the second person's decision calls.)
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveWindowPolicy } from "./core";

let organisationId = "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `SS_${randomId()}`, name: "Sale settings", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  const person = await makeAccount(organisationId, { admin: true });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error("session");
  who.actor = read.actor as StaffActor;
});

describe("saving how documents are sold and the payment simulator", () => {
  it("saves the three, trims and orders the methods, and writes them to the trail in words", async () => {
    const out = await saveWindowPolicy({ ok: false }, form({ documentSaleMode: "ONLINE", paymentSimulatorOn: "yes", paymentMethodsText: "  Online banking (FPX) \r\n\r\nCredit or debit card\nE-wallet  \n", electronicDocumentRelease: "yes" }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
    const row = await db.windowPolicy.findUniqueOrThrow({ where: { organisationId } });
    expect(row).toMatchObject({ documentSaleMode: "ONLINE", paymentSimulatorOn: true, electronicDocumentRelease: true });
    expect(row.simulatedPaymentMethods).toEqual(["Online banking (FPX)", "Credit or debit card", "E-wallet"]);
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "WindowPolicy" }, orderBy: { at: "desc" } });
    const text = JSON.stringify(trail.changes);
    expect(text).toContain("Online, through the supplier portal");
    expect(text).toContain("On (a demonstration, not a payment provider)");
    expect(text).toContain("Online banking (FPX), Credit or debit card, E-wallet");
    expect(text).not.toMatch(/ONLINE/);
  });

  it("not set is not off: an unset switch and an unset mode stay null", async () => {
    const out = await saveWindowPolicy({ ok: false }, form({ documentSaleMode: "unset", paymentSimulatorOn: "unset", paymentMethodsText: "" }));
    expect(out).toMatchObject({ ok: true });
    const row = await db.windowPolicy.findUniqueOrThrow({ where: { organisationId } });
    expect(row).toMatchObject({ documentSaleMode: null, paymentSimulatorOn: null });
    expect(row.simulatedPaymentMethods).toEqual([]);
    const off = await saveWindowPolicy({ ok: false }, form({ documentSaleMode: "COUNTER", paymentSimulatorOn: "no", paymentMethodsText: "Card" }));
    expect(off).toMatchObject({ ok: true });
    expect(await db.windowPolicy.findUniqueOrThrow({ where: { organisationId } })).toMatchObject({ documentSaleMode: "COUNTER", paymentSimulatorOn: false });
  });

  it("refuses a method listed twice, one over the length, and more than twelve, in words, and saves nothing", async () => {
    const before = await db.windowPolicy.findUniqueOrThrow({ where: { organisationId } });
    for (const [text, words] of [
      ["Card\ncard", "listed twice"],
      [`${"x".repeat(81)}`, "at most 80"],
      [Array.from({ length: 13 }, (_, i) => `Method ${i}`).join("\n"), "At most 12"],
    ] as const) {
      const out = await saveWindowPolicy({ ok: false }, form({ documentSaleMode: "ONLINE", paymentSimulatorOn: "yes", paymentMethodsText: text }));
      expect(out).toMatchObject({ ok: false });
      expect(JSON.stringify(out)).toContain(words);
    }
    expect(await db.windowPolicy.findUniqueOrThrow({ where: { organisationId } })).toMatchObject({ documentSaleMode: before.documentSaleMode, paymentSimulatorOn: before.paymentSimulatorOn });
  });
});
