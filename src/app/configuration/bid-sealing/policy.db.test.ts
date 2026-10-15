import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * Wave 3b step 7 against the scratch database: the bid sealing policy editor and the organisation's submission channel.
 * (The editors are held for a second person by `stageEdit`; this is each editor's own run, which the second person's decision calls.)
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null, admin: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor, toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { saveWindowPolicy } from "../invitation/core";
import { saveBidSealingPolicy } from "./core";

const FLAGS = ["SEALED_BIDS_DEMONSTRATION_ALLOWED", "SEALED_BIDS_LIVE_ALLOWED"] as const;
const before = Object.fromEntries(FLAGS.map((k) => [k, process.env[k]]));
afterAll(() => {
  for (const k of FLAGS) {
    if (before[k] === undefined) delete process.env[k];
    else process.env[k] = before[k];
  }
});

let organisationId = "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `BS_${randomId()}`, name: "Bid sealing", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  const adminPerson = await makeAccount(organisationId, { admin: true });
  const adminToken = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: adminPerson.account.id, tokenHash: hashToken(adminToken), absoluteMinutes: 480, request: facts(), now: new Date() });
  const adminRead = await readStaffSession(adminToken, { sourceAddress: null });
  if (!adminRead.ok) throw new Error("session");
  who.admin = adminRead.actor as StaffActor;
  // An office holder, not the administrator: an administrator account is refused the attestation (no `administratorMay`, NFR-SEC-004).
  const person = await makeAccount(organisationId, { admin: false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error("session");
  who.actor = read.actor as StaffActor;
});

describe("the bid sealing policy editor", () => {
  it("LIVE cannot be issued while any condition is missing, and every missing one is said", async () => {
    const out = await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "LIVE", cryptoReviewReference: "R-1" }));
    expect(out).toMatchObject({ ok: false });
    const text = JSON.stringify(out);
    expect(text).toContain("amendment");
    expect(text).toContain("malware scanner");
    expect(text).toContain("pepper");
    expect(text).toContain("attested");
    expect(await db.bidSealingPolicy.findUnique({ where: { organisationId } })).toBeNull();
  });

  it("DEMONSTRATION saves, stamps a reference when it changes and records who attested, in the trail's words", async () => {
    const out = await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "DEMONSTRATION", cryptoReviewReference: "R-1", publicRoleAttestation: "Role checked on 1 October", provenance: "STATED" }));
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true });
    const row = await db.bidSealingPolicy.findUniqueOrThrow({ where: { organisationId } });
    expect(row).toMatchObject({ onlineSubmission: "DEMONSTRATION", cryptoReviewReference: "R-1", publicRoleAttestedByPersonId: who.actor!.personId });
    expect(row.cryptoReviewRecordedAt).not.toBeNull();
    expect(row.publicRoleAttestedAt).not.toBeNull();
    expect(row.hardeningAttestedAt).toBeNull();
    const trail = JSON.stringify((await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "BidSealingPolicy" }, orderBy: { at: "desc" } })).changes);
    expect(trail).toContain("Attested, not checked by the portal");
    expect(trail).not.toMatch(/DEMONSTRATION/);
  });

  it("an unchanged reference keeps the day it was recorded; a cleared one loses it", async () => {
    const first = await db.bidSealingPolicy.findUniqueOrThrow({ where: { organisationId } });
    await new Promise((r) => setTimeout(r, 20));
    expect(await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "DEMONSTRATION", cryptoReviewReference: "R-1", publicRoleAttestation: "Role checked on 1 October", notes: "x" }))).toMatchObject({ ok: true });
    const kept = await db.bidSealingPolicy.findUniqueOrThrow({ where: { organisationId } });
    expect(kept.cryptoReviewRecordedAt).toEqual(first.cryptoReviewRecordedAt);
    expect(kept.publicRoleAttestedAt).toEqual(first.publicRoleAttestedAt);
    expect(await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "unset" }))).toMatchObject({ ok: true });
    const cleared = await db.bidSealingPolicy.findUniqueOrThrow({ where: { organisationId } });
    expect(cleared).toMatchObject({ onlineSubmission: null, cryptoReviewReference: "", cryptoReviewRecordedAt: null, publicRoleAttestedAt: null, publicRoleAttestedByPersonId: null });
  });
});

describe("an administrator account", () => {
  it("is refused the attestation and nothing is written (NFR-SEC-004)", async () => {
    const office = who.actor;
    who.actor = who.admin;
    try {
      const out = await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "DEMONSTRATION", hardeningAttestation: "Hardened on 2 October", provenance: "STATED" }));
      expect(out).toMatchObject({ ok: false });
      expect(JSON.stringify(out)).toContain("administrator");
      expect((await db.bidSealingPolicy.findUniqueOrThrow({ where: { organisationId } })).hardeningAttestedAt).toBeNull();
    } finally {
      who.actor = office;
    }
  });
});

describe("the organisation's submission channel (ruling 13)", () => {
  const save = (channel: string) => saveWindowPolicy({ ok: false }, form({ submissionChannel: channel }));

  it("ONLINE is refused while online submission is not allowed, PAPER and not set never are", async () => {
    delete process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED;
    delete process.env.SEALED_BIDS_LIVE_ALLOWED;
    await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "DEMONSTRATION" }));
    const out = await save("ONLINE");
    expect(out).toMatchObject({ ok: false });
    expect(JSON.stringify(out)).toContain("online submission is not allowed");
    expect(await save("PAPER")).toMatchObject({ ok: true });
    expect(await save("unset")).toMatchObject({ ok: true });
    expect((await db.windowPolicy.findUniqueOrThrow({ where: { organisationId } })).submissionChannel).toBeNull();
  });

  it("ONLINE saves once the deployment allows demonstration bids and the mode is set; the trail says it in words", async () => {
    process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED = "true";
    expect(await save("ONLINE")).toMatchObject({ ok: true });
    expect((await db.windowPolicy.findUniqueOrThrow({ where: { organisationId } })).submissionChannel).toBe("ONLINE");
    const trail = JSON.stringify((await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "WindowPolicy" }, orderBy: { at: "desc" } })).changes);
    expect(trail).toContain("Online, sealed in the portal");
    // Already ONLINE, a save that leaves it is not refused when the flag is later cleared.
    delete process.env.SEALED_BIDS_DEMONSTRATION_ALLOWED;
    expect(await save("ONLINE")).toMatchObject({ ok: true });
  });
});

describe("the trail and the attester (review of stage B)", () => {
  it("words the provenance and reads the day in the organisation's zone in the trail, never the code (review of stage B)", async () => {
    await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "DEMONSTRATION", cryptoReviewReference: "R-9", provenance: "OBSERVED" }));
    const trail = JSON.stringify((await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "BidSealingPolicy" }, orderBy: { at: "desc" } })).changes);
    expect(trail).toContain("Observed");
    expect(trail).not.toMatch(/OBSERVED|STATED/);
  });

  it("an attestation naming another person is refused and nothing is written (the form is the proposer's own)", async () => {
    const before = await db.bidSealingPolicy.findUnique({ where: { organisationId } });
    const out = await saveBidSealingPolicy({ ok: false }, form({ onlineSubmission: "DEMONSTRATION", hardeningAttestation: "Hardened by someone else", provenance: "STATED", attestedByPersonId: who.admin!.personId }));
    expect(out).toMatchObject({ ok: false });
    const after = await db.bidSealingPolicy.findUnique({ where: { organisationId } });
    expect(after?.hardeningAttestation ?? "").toBe(before?.hardeningAttestation ?? "");
  });
});
