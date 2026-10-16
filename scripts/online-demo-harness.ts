import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

/**
 * The proof that the online demonstration can be opened (wave 3b step 18, "the demo officers can unseal, and one of them can finalise"). It is NOT a test of the scratch database: it
 * is run, as a child process, by `src/lib/demo/demo-additive.db.test.ts` against the THROWAWAY database that test made and loaded, after `demo:accounts` has given the demonstration's
 * people their accounts (`vitest.demo-harness.config.mts`; run on its own it does nothing). Through the real actions, the real keys and the real triggers, with the passphrases the
 * demonstration prints: the two opening officers start the opening, each authorise the unseal with the sign-in password and their own passphrase, the prices are written at the
 * finalise by one of them, and the late bid stays unopened. Only the request is stood in for: who is signed in, the cookies and the cache.
 */

const who = vi.hoisted(() => ({ actor: null as unknown }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff,
    staffForAct: async (act: import("@/lib/auth/administration-conflict").AdministratorAct) => {
      const actor = who.actor as import("@/lib/auth/types").StaffActor;
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
    stepUp: async (actor: import("@/lib/auth/types").StaffActor, password: string) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "harness" });
      return r.ok ? r : { ok: false as const, message: "That password is not right." };
    },
  };
});
vi.mock("@/app/_auth/cookies", () => ({ refuseForeignPost: async () => null, currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "harness" }) }));
vi.mock("@/app/_auth/act", async () => {
  const begin = await import("@/lib/auth/act-begin");
  const { attributeAct } = await import("@/lib/auth/attribution-store");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  const deps: import("@/lib/auth/act-begin").ActDeps = {
    now: () => new Date(),
    paperSignatureRecording: async () => null,
    stepUp: async (actor, password) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "harness" });
      return r.ok ? r : { ok: false, message: r.kind };
    },
    attribute: attributeAct,
  };
  return {
    beginAct: (actor: import("@/lib/auth/types").StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { checklistFromSnapshot } from "@/lib/opening/checklist";
import { DEMO_UNSEAL_PASSPHRASES } from "@/lib/demo/online-demo";

import { recordChecklistAnswer, recordInitial, recordScheduleDetails, recordVerdict, startOpening } from "@/app/sourcing/[id]/opening/actions";
import { finaliseOnline, signOnlineFinalise } from "@/app/sourcing/[id]/opening/online-finalise-actions";
import { authoriseOnlineUnseal } from "@/app/sourcing/[id]/opening/unseal-actions";

const PASSWORD_FIELD = actFieldNames("personId").password;
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? "";
const ONLINE_REFERENCE = process.env.DEMO_ONLINE_REFERENCE ?? "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const message = (r: { message?: string; errors?: Record<string, string> }) => r.message ?? JSON.stringify(r.errors);

describe.skipIf(!ONLINE_REFERENCE || !PASSWORD)("the demonstration's online exercise opens (run by demo-additive.db.test.ts)", () => {
  it("the opening officers unseal with the printed passphrases, and one of them finalises", async () => {
    const ex = await db.sourcingExercise.findFirstOrThrow({ where: { reference: ONLINE_REFERENCE } });
    const roster = await db.exerciseOpeningOfficer.findMany({ where: { exerciseId: ex.id, endedAt: null }, orderBy: [{ namedAt: "asc" }, { id: "asc" }] });
    expect(roster.length).toBeGreaterThanOrEqual(2);
    const officers: { actor: StaffActor; passphrase: string; personId: string }[] = [];
    for (const [i, r] of roster.entries()) {
      const account = await db.staffAccount.findFirstOrThrow({ where: { personId: r.personId } });
      const token = randomBytes(32).toString("base64url");
      await createStaffSession(db, { organisationId: ex.organisationId, accountId: account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: { sourceAddress: null, userAgent: "harness" }, now: new Date() });
      const read = await readStaffSession(token, { sourceAddress: null });
      if (!read.ok) throw new Error(`the officer's session did not read: ${read.reason}`);
      officers.push({ actor: read.actor as StaffActor, passphrase: DEMO_UNSEAL_PASSPHRASES[i], personId: r.personId });
    }
    const [o1, o2] = officers;

    // The opening starts once the database clock is past the closing by the skew; the demonstration's late bid was made just after the closing, so wait for it.
    for (let waited = 0; ; waited += 5) {
      const [row] = await db.$queryRaw<{ ok: boolean }[]>`SELECT clock_timestamp() > ${ex.closingAt}::timestamptz + interval '90 seconds' AS ok`;
      if (row.ok) break;
      if (waited > 300) throw new Error("the closing did not pass in time");
      await new Promise((r) => setTimeout(r, 5000));
    }

    who.actor = o1.actor;
    const started = await startOpening({ ok: false }, form({ exerciseId: ex.id }));
    expect(started.ok, message(started)).toBe(true);
    const opening = await db.opening.findFirstOrThrow({ where: { exerciseId: ex.id, kind: "MAIN" } });
    for (const o of officers) {
      who.actor = o.actor;
      const r = await authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, passphrase: o.passphrase, [PASSWORD_FIELD]: PASSWORD }));
      expect(r.ok, message(r)).toBe(true);
    }
    // The two bids standing in time are opened; the late one waits for its own opening.
    const offers = await db.openedBid.findMany({ where: { openingId: opening.id }, orderBy: { listingNo: "asc" } });
    expect(offers).toHaveLength(2);
    for (const o of offers) expect(o.priceAsRead).toBeNull();

    // What a finalise needs: every checklist item answered, every officer's initial, a verdict on each offer, and the pages.
    const items = checklistFromSnapshot((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).checklistSnapshot).items;
    for (const offer of offers) {
      who.actor = o1.actor;
      for (const item of items) {
        const r = await recordChecklistAnswer({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id, itemKey: item.key, answer: "PRESENT" }));
        expect(r.ok, message(r)).toBe(true);
      }
      for (const o of officers) {
        who.actor = o.actor;
        const r = await recordInitial({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id }));
        expect(r.ok, message(r)).toBe(true);
      }
      who.actor = o1.actor;
      const v = await recordVerdict({ ok: false }, form({ exerciseId: ex.id, openedBidId: offer.id, verdict: "PASS" }));
      expect(v.ok, message(v)).toBe(true);
    }
    who.actor = o1.actor;
    const pages = await recordScheduleDetails({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, schedulePages: "3", minutes: "" }));
    expect(pages.ok, message(pages)).toBe(true);

    for (const o of officers) {
      who.actor = o.actor;
      const s = await signOnlineFinalise({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, [PASSWORD_FIELD]: PASSWORD }));
      expect(s.ok, message(s)).toBe(true);
    }
    who.actor = o2.actor;
    const done = await finaliseOnline({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, passphrase: o2.passphrase, [PASSWORD_FIELD]: PASSWORD }));
    expect(done.ok, message(done)).toBe(true);

    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).not.toBeNull();
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).status).toBe("OPENED");
    const priced = await db.openedBid.findMany({ where: { openingId: opening.id } });
    expect(priced.map((p) => p.priceAsRead?.toString()).sort()).toEqual(["368900", "376400"].map((p) => `${p}`).sort());
  }, 900_000);
});
