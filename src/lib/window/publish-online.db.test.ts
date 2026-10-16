import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { buildPublishableOnline, type PublishableOnline } from "./online-publish.fixture";

/**
 * Ruling 20br (wave 3c step 1): the ONLINE path of the real `publishWindow`, run whole against the scratch database and its triggers, on every day of the week (the fixture's calendar
 * makes the test day a working day, so this file holds no day check of its own: 20cl). The organisation is this file's own and holds editor-settable configuration only. The key and the
 * shares come from the product's own ceremony act (`setOfficerShare`); the window is published by `publishWindow`; nothing is set that the act would refuse.
 *
 * What is proved: it refuses while the key is not made; it then freezes the mode, the rules and the channel together with the key's fingerprint, before the exercise is moved to
 * ADVERTISED; the key and the shares exist before that move; and from the move on the database (trigger 11, PA025) refuses a change of the channel or of the rules.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff,
    staffForAct: async (act: import("@/lib/auth/administration-conflict").AdministratorAct) => {
      const actor = who.actor!;
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
  };
});
vi.mock("@/app/_auth/cookies", () => ({
  refuseForeignPost: async () => null,
  currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "vitest" }),
}));
vi.mock("@/app/_auth/act", async () => {
  const begin = await import("@/lib/auth/act-begin");
  const { attributeAct } = await import("@/lib/auth/attribution-store");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  const deps: import("@/lib/auth/act-begin").ActDeps = {
    now: () => new Date(),
    paperSignatureRecording: async () => null,
    stepUp: async (actor, password) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "vitest" });
      return r.ok ? r : { ok: false, message: r.kind };
    },
    attribute: attributeAct,
  };
  return {
    beginAct: (actor: StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { setOfficerShare } from "@/app/sourcing/[id]/scope/key-actions";
import { publishWindow } from "@/app/sourcing/[id]/window/actions";

const PEPPER_ENV = ["SEALING_PEPPER", "SEALING_PEPPER_ID"] as const;
const saved = Object.fromEntries(PEPPER_ENV.map((k) => [k, process.env[k]]));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
async function signedIn(organisationId: string) {
  const person = await makeAccount(organisationId, { admin: false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}

let fx: PublishableOnline;
let publisher: Awaited<ReturnType<typeof signedIn>>;
const officers: (Awaited<ReturnType<typeof signedIn>> & { passphrase: string })[] = [];

beforeAll(async () => {
  vi.stubEnv("SEALED_BIDS_DEMONSTRATION_ALLOWED", "true");
  for (const k of PEPPER_ENV) delete process.env[k];
  fx = await buildPublishableOnline();
  // Stands in for the approving step, which is the only writer of the closing and of the pack's frozen dates: the exercise approved for tendering, its start and closing recorded, the pack approved.
  const approvedAt = new Date();
  await db.sourcingExercise.update({ where: { id: fx.exerciseId }, data: { status: "APPROVED_FOR_TENDERING", tenderingStartOn: dayToDate(fx.today), closingAt: fx.closes, approvedForTenderingAt: approvedAt } });
  await db.tenderPack.update({ where: { id: fx.packId }, data: { status: "APPROVED", submittedAt: approvedAt, frozenAt: approvedAt, approvedStartOn: dayToDate(fx.today), approvedClosingAt: fx.closes, approvedAt } });
  await setPolicy(fx.organisationId, { ...SETTINGS, sealingPassphraseMinLength: 12 });
  // The test organisation needs an administrator to sign anyone in (the fixture is the account helper's).
  await makeAccount(fx.organisationId, { admin: true });
  publisher = await signedIn(fx.organisationId);
  for (let i = 0; i < 2; i++) {
    const o = await signedIn(fx.organisationId);
    await db.exerciseOpeningOfficer.create({ data: { organisationId: fx.organisationId, exerciseId: fx.exerciseId, personId: o.person.id, seatLabelSnapshot: `Member ${i + 1}`, namedAt: new Date(), namedByPersonId: o.person.id } });
    officers.push({ ...o, passphrase: `unseal passphrase number ${i + 1} ${randomId()}` });
  }
});

afterAll(() => {
  vi.unstubAllEnvs();
  for (const k of PEPPER_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const publish = () => {
  who.actor = publisher.actor;
  return publishWindow({ ok: false }, form({ exerciseId: fx.exerciseId, [actFieldNames("personId").password]: publisher.password }));
};
const exercise = () => db.sourcingExercise.findUniqueOrThrow({ where: { id: fx.exerciseId } });

describe("publishWindow on an ONLINE exercise (20br)", () => {
  it("is refused while the officers' key is not made, and writes nothing", async () => {
    const result = await publish();
    expect(result.ok, JSON.stringify(result)).toBe(false);
    const ex = await exercise();
    expect(ex.status).toBe("APPROVED_FOR_TENDERING");
    expect(ex.onlineBidRules).toBeNull();
    expect(ex.publishedKeyFingerprint).toBeNull();
    expect((await db.exerciseWindow.findUniqueOrThrow({ where: { exerciseId: fx.exerciseId } })).publishedAt).toBeNull();
  });

  it("the officers' own acts make the key and the shares", async () => {
    for (const o of officers) {
      who.actor = o.actor;
      const r = await setOfficerShare({ ok: false }, form({ exerciseId: fx.exerciseId, passphrase: o.passphrase, repeat: o.passphrase, [actFieldNames("personId").password]: o.password }));
      expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    }
    const key = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: fx.exerciseId, retiredAt: null } });
    expect(key.officerCount).toBe(2);
    expect(await db.exerciseKeyShare.count({ where: { keyId: key.id, sealedShare: { not: null } } })).toBe(2);
  });

  it("publishes: mode, rules, channel and key fingerprint frozen together, the key and shares first, and the rules then refuse a change", async () => {
    const key = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: fx.exerciseId, retiredAt: null }, select: { id: true, fingerprint: true, createdAt: true } });
    const shares = await db.exerciseKeyShare.findMany({ where: { keyId: key.id }, select: { createdAt: true } });

    const result = await publish();
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });

    const ex = await exercise();
    expect(ex).toMatchObject({ status: "ADVERTISED", submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION", publishedKeyFingerprint: key.fingerprint });
    const rules = ex.onlineBidRules as { v: number; parts: { packPartId: string; mandatory: boolean }[] };
    expect(rules.v).toBe(1);
    expect(rules.parts).toHaveLength(1);
    expect(rules.parts[0].mandatory).toBe(true);
    // The window carries the act's stamp and no key change was recorded: the first fingerprint is the published one.
    const window = await db.exerciseWindow.findUniqueOrThrow({ where: { exerciseId: fx.exerciseId }, select: { publishedAt: true, advertisementDay: true, policySnapshot: true } });
    expect(window.publishedAt).not.toBeNull();
    expect(window.advertisementDay).not.toBeNull();
    expect(window.policySnapshot).not.toBeNull();
    expect(await db.publishedKeyChange.count({ where: { exerciseId: fx.exerciseId } })).toBe(0);

    // The freeze is audited once under the act's own label, and before the move to ADVERTISED is audited; the key and every share were made before both.
    const freezeRows = await db.auditEntry.findMany({ where: { entity: "SourcingExercise", entityId: fx.exerciseId, entityLabel: { contains: "How bids are submitted" } }, select: { at: true } });
    expect(freezeRows).toHaveLength(1);
    const moved = await db.auditEntry.findMany({ where: { entity: "SourcingExercise", entityId: fx.exerciseId, action: "UPDATE" }, select: { at: true, changes: true } });
    const toAdvertised = moved.find((r) => JSON.stringify(r.changes).includes("ADVERTISED"));
    expect(toAdvertised).toBeDefined();
    expect(freezeRows[0].at.getTime()).toBeLessThanOrEqual(toAdvertised!.at.getTime());
    expect(key.createdAt.getTime()).toBeLessThanOrEqual(freezeRows[0].at.getTime());
    for (const s of shares) expect(s.createdAt.getTime()).toBeLessThanOrEqual(freezeRows[0].at.getTime());

    // From the move on the database refuses a change of the channel or the rules, for the owner as well (trigger 11, PA025).
    const refusal = async (sql: string) => {
      try {
        await db.$executeRawUnsafe(sql, fx.exerciseId);
        return "allowed";
      } catch (e) {
        return String(e).includes("PA025") || JSON.stringify(e).includes("PA025") ? "PA025" : String(e).slice(0, 200);
      }
    };
    expect(await refusal(`UPDATE "SourcingExercise" SET "submissionChannel" = 'PAPER' WHERE "id" = $1`)).toBe("PA025");
    expect(await refusal(`UPDATE "SourcingExercise" SET "onlineBidRules" = '{"v":1,"frozenAt":"x","parts":[]}'::jsonb WHERE "id" = $1`)).toBe("PA025");
    expect((await exercise()).submissionChannel).toBe("ONLINE");
  });
});
