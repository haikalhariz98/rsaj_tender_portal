import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { unpackGcm } from "@/lib/sealing/aead";
import { officerKeyAad, shareAad } from "@/lib/sealing/ceremony-seal";
import { unpackHpke } from "@/lib/sealing/hpke";
import { unwrapKey } from "@/lib/sealing/kdf";
import { hpkeOpen } from "@/lib/sealing/open";
import { combineShares } from "@/lib/sealing/split";
import { publishSealingFaults, publishSealingWords } from "@/lib/sealing/ceremony";
import { onlineSubmissionAllowed } from "@/lib/sealing/switch";
import { rekeyAfterRosterChange } from "@/lib/sealing/store";
import { FreezeRefused, freezeOnlineSealing } from "@/lib/sealing/freeze-store";
import { loadSealingFacts } from "@/lib/window/repo";
import { facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

/**
 * Wave 3b step 8 against the scratch database, through the real actions and the real triggers: each named officer sets their own share with a passphrase, the exercise key is
 * made when the last has, a roster change before publication retires it and shreds its shares, a published exercise re-keys before any bid and the change is recorded, and no
 * secret reaches an audit row, an attribution or an access event. Only the request is stood in for: who is signed in, the cookies and the cache.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff,
    // The real rule, for whoever is signed in now.
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

import { takeSubmissionChannel } from "../window/actions";
import { rekeyExercise, setOfficerShare } from "./key-actions";

const PEPPER_ENV = ["SEALING_PEPPER", "SEALING_PEPPER_ID"] as const;
const saved = Object.fromEntries(PEPPER_ENV.map((k) => [k, process.env[k]]));
afterAll(() => {
  for (const k of PEPPER_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

let organisationId = "";
let requisitionId = "";
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function signedIn(admin = false) {
  const person = await makeAccount(organisationId, { admin });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}
type Officer = Awaited<ReturnType<typeof signedIn>> & { rosterId: string; passphrase: string };

/// An ONLINE exercise, not yet published, with `n` named officers who have each an account to sign in with.
async function exerciseWith(n: number) {
  const ex = await db.sourcingExercise.create({
    data: { organisationId, reference: `KC/EX/${randomId()}`, requisitionId, title: "Key ceremony", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + 3 * 86_400_000), submissionChannel: "ONLINE", saleMode: "COUNTER" },
  });
  const officers: Officer[] = [];
  for (let i = 0; i < n; i++) {
    const o = await signedIn();
    const row = await db.exerciseOpeningOfficer.create({ data: { organisationId, exerciseId: ex.id, personId: o.person.id, seatLabelSnapshot: `Member ${i + 1}`, namedAt: new Date(), namedByPersonId: o.person.id } });
    officers.push({ ...o, rosterId: row.id, passphrase: `unseal passphrase number ${i + 1} ${randomId()}` });
  }
  return { id: ex.id, officers };
}

const share = (exerciseId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return setOfficerShare({ ok: false }, form({ exerciseId, passphrase: o.passphrase, repeat: o.passphrase, [actFieldNames("personId").password]: o.password, ...over }));
};

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `KC_${randomId()}`, name: "Key ceremony", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, { ...SETTINGS, sealingPassphraseMinLength: 12 });
  const admin = await makeAccount(organisationId, { admin: true });
  void admin;
  await db.bidSealingPolicy.create({ data: { organisationId, onlineSubmission: "DEMONSTRATION" } });
  const namer = await db.person.create({ data: { organisationId, name: `Namer ${randomId()}` } });
  requisitionId = (
    await db.requisition.create({
      data: { organisationId, reference: `KC/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: namer.id, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  delete process.env.SEALING_PEPPER;
  delete process.env.SEALING_PEPPER_ID;
});

describe("setting a share", () => {
  it("is refused an administrator account, a person not named, a short or unrepeated passphrase and a wrong password, and writes nothing", async () => {
    const ex = await exerciseWith(2);
    const admin = await signedIn(true);
    who.actor = admin.actor;
    const refusedAdmin = await setOfficerShare({ ok: false }, form({ exerciseId: ex.id, passphrase: "a long enough passphrase", repeat: "a long enough passphrase", [actFieldNames("personId").password]: admin.password }));
    expect(refusedAdmin).toMatchObject({ ok: false });
    const stranger = await signedIn();
    expect(await share(ex.id, { ...stranger, rosterId: "", passphrase: "a long enough passphrase" })).toMatchObject({ ok: false, message: expect.stringContaining("named on this exercise") });
    const [a] = ex.officers;
    expect(await share(ex.id, a, { passphrase: "short", repeat: "short" })).toMatchObject({ ok: false, errors: { passphrase: expect.stringContaining("shorter than") } });
    expect(await share(ex.id, a, { repeat: "something else entirely" })).toMatchObject({ ok: false, errors: { repeat: expect.stringContaining("not the same") } });
    expect(await share(ex.id, a, { passphrase: a.password, repeat: a.password })).toMatchObject({ ok: false, errors: { passphrase: expect.stringContaining("sign-in password") } });
    expect(await share(ex.id, a, { [actFieldNames("personId").password]: "not the password" })).toMatchObject({ ok: false });
    expect(await db.officerExerciseKey.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect(await db.exerciseSealingKey.count({ where: { exerciseId: ex.id } })).toBe(0);
    // Every refusal by a signed-in actor leaves one sealed-access row (ADR 0036), and none is a grant.
    const refusedRows = await db.sealedAccessEvent.findMany({ where: { exerciseId: ex.id }, select: { kind: true, outcome: true, reasonCode: true, staffPersonId: true } });
    expect(refusedRows.filter((r) => r.staffPersonId === admin.person.id)).toEqual([{ kind: "SHARE_SET", outcome: "REFUSED", reasonCode: "ADMINISTRATOR", staffPersonId: admin.person.id }]);
    expect(refusedRows.filter((r) => r.staffPersonId === stranger.person.id)).toEqual([{ kind: "SHARE_SET", outcome: "REFUSED", reasonCode: "NOT_NAMED_OFFICER", staffPersonId: stranger.person.id }]);
    expect(refusedRows.every((r) => r.outcome === "REFUSED")).toBe(true);
  });

  it("the last officer's setting makes the key; the shares recombine to its private key, and nothing secret is in an audit row", async () => {
    const ex = await exerciseWith(2);
    const [a, b] = ex.officers;
    const first = await share(ex.id, a);
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true, message: expect.stringContaining("One officer has still to set theirs") });
    expect(await db.exerciseSealingKey.count({ where: { exerciseId: ex.id } })).toBe(0);
    const second = await share(ex.id, b);
    expect(second, JSON.stringify(second)).toMatchObject({ ok: true, message: expect.stringContaining("the key is made") });

    const key = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    expect(key.officerCount).toBe(2);
    const shares = await db.exerciseKeyShare.findMany({ where: { keyId: key.id }, include: { officerKey: true } });
    expect(shares).toHaveLength(2);
    expect(shares.every((s) => s.sealedShare !== null)).toBe(true);

    // Each officer's passphrase opens their own share, and the two together give the exercise key's private half (the unseal's first steps, step 13).
    const opened = [];
    for (const s of shares) {
      const o = ex.officers.find((x) => x.rosterId === s.openingOfficerId)!;
      const k = s.officerKey;
      const priv = await unwrapKey({ params: { log2N: k.kdfLog2N, r: k.kdfR, p: k.kdfP, salt: new Uint8Array(k.kdfSalt) }, pepperId: k.pepperId, sealed: unpackGcm(new Uint8Array(k.wrappedPrivateKey)) }, o.passphrase, null, officerKeyAad({ organisationId, exerciseId: ex.id, officerKeyId: k.id, rosterRowId: s.openingOfficerId }));
      expect(priv).not.toBeNull();
      opened.push(hpkeOpen(priv!, unpackHpke(new Uint8Array(s.sealedShare!)), shareAad({ organisationId, exerciseId: ex.id, keyId: key.id, shareId: s.id })));
    }
    expect(combineShares(opened, new Uint8Array(key.publicKey)).ok).toBe(true);

    // No secret anywhere in what was written for the audit: the passphrases, the password, nor any key material in hex or base64.
    const secrets = [...ex.officers.flatMap((o) => [o.passphrase, o.password])];
    for (const s of shares) {
      for (const bytes of [s.sealedShare!, s.officerKey.wrappedPrivateKey, s.officerKey.kdfSalt, s.officerKey.publicKey]) {
        const b = Buffer.from(bytes);
        secrets.push(b.toString("hex"), b.toString("base64"), b.toString("base64url"));
      }
    }
    const trail = JSON.stringify([
      await db.auditEntry.findMany({ where: { organisationId, entityLabel: { contains: "KC/EX" } } }),
      await db.auditEntry.findMany({ where: { organisationId, entityId: { in: [key.id, ...shares.map((s) => s.officerKeyId)] } } }),
      await db.actAttribution.findMany({ where: { organisationId, entityId: { in: shares.map((s) => s.officerKeyId) } } }),
      await db.sealedAccessEvent.findMany({ where: { exerciseId: ex.id } }),
    ]);
    for (const s of secrets) expect(trail.includes(s), `a secret of ${s.length} characters is in the trail`).toBe(false);
    expect(await db.sealedAccessEvent.count({ where: { exerciseId: ex.id, kind: "SHARE_SET", outcome: "GRANTED" } })).toBe(2);
    expect(await db.sealedAccessEvent.count({ where: { exerciseId: ex.id, kind: "KEY_CREATED" } })).toBe(1);
    // Attributed to the officer, signed with the password, in the capacity of their roster row.
    expect(await db.actAttribution.count({ where: { organisationId, entity: "OfficerExerciseKey", slot: "person" } })).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("a share set again replaces the officer's own before publication: the old key is retired and shredded and a new one is made", async () => {
    const ex = await exerciseWith(2);
    const [a, b] = ex.officers;
    await share(ex.id, a);
    await share(ex.id, b);
    const before = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    a.passphrase = `a different unseal passphrase ${randomId()}`;
    expect(await share(ex.id, a)).toMatchObject({ ok: true });
    const after = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    expect(after.id).not.toBe(before.id);
    expect((await db.exerciseSealingKey.findUniqueOrThrow({ where: { id: before.id } })).retiredAt).not.toBeNull();
    expect((await db.exerciseKeyShare.findMany({ where: { keyId: before.id } })).every((s) => s.sealedShare === null && s.endedAt !== null)).toBe(true);
    expect(await db.officerExerciseKey.count({ where: { exerciseId: ex.id, openingOfficerId: a.rosterId, retiredAt: null } })).toBe(1);
  }, 60_000);

  it("a LIVE organisation without the pepper cannot have a share set, in words, and nothing is written", async () => {
    const ex = await exerciseWith(2);
    await db.bidSealingPolicy.update({ where: { organisationId }, data: { onlineSubmission: "LIVE" } });
    try {
      expect(await share(ex.id, ex.officers[0])).toMatchObject({ ok: false, message: expect.stringContaining("pepper is not configured") });
      process.env.SEALING_PEPPER = randomBytes(40).toString("base64");
      process.env.SEALING_PEPPER_ID = "kc-test";
      expect(await share(ex.id, ex.officers[0])).toMatchObject({ ok: true });
      const k = await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id } });
      expect(k.pepperId).toMatch(/^kc-test#/);
    } finally {
      await db.bidSealingPolicy.update({ where: { organisationId }, data: { onlineSubmission: "DEMONSTRATION" } });
      delete process.env.SEALING_PEPPER;
      delete process.env.SEALING_PEPPER_ID;
    }
    expect(await db.officerExerciseKey.count({ where: { exerciseId: ex.id } })).toBe(1);
  }, 60_000);
});

describe("a roster change before publication", () => {
  it("retires the key and shreds every share in the same transaction, retires the departed officer's key and makes the key again when the rest are complete", async () => {
    const ex = await exerciseWith(3);
    for (const o of ex.officers) await share(ex.id, o);
    const key = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    expect(key.officerCount).toBe(3);
    const [, , c] = ex.officers;
    await db.$transaction(async (tx) => {
      await tx.exerciseOpeningOfficer.update({ where: { id: c.rosterId }, data: { endedAt: new Date(), endedByPersonId: c.person.id, endedReason: "test" } });
      const r = await rekeyAfterRosterChange(tx, organisationId, ex.id, "An opening officer was taken off", new Date(), c.person.id);
      expect(r.retiredKey).toBe(key.id);
      expect(r.retiredOfficerKeys).toBe(1);
      expect(r.made).not.toBeNull();
    });
    expect((await db.exerciseKeyShare.findMany({ where: { keyId: key.id } })).every((s) => s.sealedShare === null)).toBe(true);
    const live = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    expect(live.id).not.toBe(key.id);
    expect(live.officerCount).toBe(2);
    expect(await db.officerExerciseKey.count({ where: { exerciseId: ex.id, retiredAt: null } })).toBe(2);
  }, 90_000);

  it("a new officer makes the key stale until they set theirs, and the key is not made with fewer than two officers", async () => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    const extra = await signedIn();
    await db.$transaction(async (tx) => {
      await tx.exerciseOpeningOfficer.create({ data: { organisationId, exerciseId: ex.id, personId: extra.person.id, seatLabelSnapshot: "Member 3", namedAt: new Date(), namedByPersonId: extra.person.id } });
      const r = await rekeyAfterRosterChange(tx, organisationId, ex.id, "An opening officer was named", new Date(), extra.person.id);
      expect(r.retiredKey).not.toBeNull();
      expect(r.made).toBeNull();
    });
    expect(await db.exerciseSealingKey.count({ where: { exerciseId: ex.id, retiredAt: null } })).toBe(0);
    const third: Officer = { ...extra, rosterId: (await db.exerciseOpeningOfficer.findFirstOrThrow({ where: { exerciseId: ex.id, personId: extra.person.id } })).id, passphrase: `third officer passphrase ${randomId()}` };
    expect(await share(ex.id, third)).toMatchObject({ ok: true, message: expect.stringContaining("the key is made") });
    expect((await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } })).officerCount).toBe(3);
  }, 90_000);
});

describe("a published exercise", () => {
  const RULES = [{ packPartId: "part-1", label: "Bill of quantities", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: false }];
  const freeze = (id: string, now = new Date()) =>
    db.$transaction((tx) => freezeOnlineSealing(tx, { organisationId, exerciseId: id, mode: "DEMONSTRATION", rules: RULES, now, actor: { kind: "SYSTEM", label: "key.db.test" }, entityLabel: "KC · How bids are submitted" }));

  /// What publication writes for sealing: the real freeze (`freezeOnlineSealing`, the one `publishWindow` calls, before the move), then the move.
  async function publish(ex: { id: string }, status: "ADVERTISED" | "INVITED" = "ADVERTISED") {
    const live = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    await freeze(ex.id);
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { status } });
    return live;
  }

  it.each(["ADVERTISED", "INVITED"] as const)("the publication freeze (%s path) sets the mode, the rules and the fingerprint together, then the exercise moves and a re-key is recorded", async (status) => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    const live = await publish(ex, status);
    const row = await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } });
    expect(row).toMatchObject({ status, onlineSubmissionMode: "DEMONSTRATION", publishedKeyFingerprint: live.fingerprint });
    expect(row.onlineBidRules).toMatchObject({ v: 1, parts: [{ packPartId: "part-1", returnedByBidder: true }] });
    expect(await db.auditEntry.count({ where: { entity: "SourcingExercise", entityId: ex.id, entityLabel: { contains: "How bids are submitted" } } })).toBe(1);
    const [a] = ex.officers;
    who.actor = a.actor;
    expect(await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "After the freeze", [actFieldNames("personId").password]: a.password }))).toMatchObject({ ok: true });
    const change = await db.publishedKeyChange.findFirstOrThrow({ where: { exerciseId: ex.id } });
    expect(change.fromFingerprint).toBe(live.fingerprint);
  }, 90_000);

  it("a freeze after the move is refused by the database and said in words, not thrown; one with no live key is out of date", async () => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { status: "ADVERTISED" } });
    await expect(freeze(ex.id)).rejects.toMatchObject({ constructor: FreezeRefused, changed: false, message: expect.stringContaining("Not published") });
    const bare = await exerciseWith(2);
    await expect(freeze(bare.id)).rejects.toMatchObject({ changed: true });
  }, 90_000);

  it("re-keys before any bid: the old shares read NULL, the change row exists, the fingerprint is re-frozen, and only a named officer, with a reason, may", async () => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    const old = await publish(ex);
    const [a] = ex.officers;

    who.actor = (await signedIn()).actor;
    expect(await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "x" }))).toMatchObject({ ok: false });
    who.actor = a.actor;
    expect(await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "  ", [actFieldNames("personId").password]: a.password }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect(await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "A passphrase may have been seen", [actFieldNames("personId").password]: "wrong" }))).toMatchObject({ ok: false });
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id } })).toBe(0);

    const done = await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "A passphrase may have been seen", [actFieldNames("personId").password]: a.password }));
    expect(done, JSON.stringify(done)).toMatchObject({ ok: true });
    expect((await db.exerciseKeyShare.findMany({ where: { keyId: old.id } })).every((s) => s.sealedShare === null)).toBe(true);
    const live = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    expect(live.id).not.toBe(old.id);
    const change = await db.publishedKeyChange.findFirstOrThrow({ where: { exerciseId: ex.id } });
    expect(change).toMatchObject({ fromKeyId: old.id, toKeyId: live.id, fromFingerprint: old.fingerprint, toFingerprint: live.fingerprint, byPersonId: a.person.id, reason: "A passphrase may have been seen" });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).publishedKeyFingerprint).toBe(live.fingerprint);
    expect(await db.sealedAccessEvent.count({ where: { exerciseId: ex.id, kind: "KEY_RETIRED" } })).toBeGreaterThanOrEqual(1);
    expect(await db.actAttribution.count({ where: { organisationId, entity: "PublishedKeyChange", entityId: change.id } })).toBe(1);
  }, 90_000);

  it("a published officer who sets their share again re-keys with the change recorded; one named after publication cannot set one", async () => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    const old = await publish(ex);
    const [a] = ex.officers;
    a.passphrase = `a replacement passphrase ${randomId()}`;
    expect(await share(ex.id, a)).toMatchObject({ ok: true });
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id, fromKeyId: old.id } })).toBe(1);
    // The change row carries no second signature (one password entry signs one act): it names the signed share that caused it (review of stage B).
    const change = await db.publishedKeyChange.findFirstOrThrow({ where: { exerciseId: ex.id, fromKeyId: old.id } });
    expect(change.viaOfficerKeyId).not.toBeNull();
    expect(await db.actAttribution.count({ where: { organisationId, entity: "OfficerExerciseKey", entityId: change.viaOfficerKeyId!, slot: "person" } })).toBe(1);
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id, viaOfficerKeyId: null } })).toBe(0);
    const late = await signedIn();
    const row = await db.exerciseOpeningOfficer.create({ data: { organisationId, exerciseId: ex.id, personId: late.person.id, seatLabelSnapshot: "Late", namedAt: new Date(), namedByPersonId: late.person.id } });
    expect(await share(ex.id, { ...late, rosterId: row.id, passphrase: "a late officer passphrase" })).toMatchObject({ ok: false, message: expect.stringContaining("named after the exercise was published") });
  }, 90_000);

  it("a re-key after the closing is refused in words and changes nothing", async () => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    const old = await publish(ex);
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { closingAt: new Date(Date.now() - 60_000) } });
    const [a] = ex.officers;
    who.actor = a.actor;
    const out = await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "Too late", [actFieldNames("personId").password]: a.password }));
    expect(out).toMatchObject({ ok: false, message: expect.stringContaining("closing has passed") });
    expect((await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } })).id).toBe(old.id);
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id } })).toBe(0);
  }, 90_000);
});

describe("taking the organisation's channel (20z)", () => {
  it("copies the setting once, refuses while it is unset, after a pin is set, after publication and on a cancelled exercise, and audits the before and after", async () => {
    const o = await signedIn();
    who.actor = o.actor;
    const make = (data: Record<string, unknown> = {}) =>
      db.sourcingExercise.create({ data: { organisationId, reference: `KC/TK/${randomId()}`, requisitionId, title: "Unpinned", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "DOCUMENTS_IN_PREPARATION", ...data } as never });
    const ex = await make();
    expect(ex.submissionChannel).toBeNull();
    await db.windowPolicy.upsert({ where: { organisationId }, create: { organisationId, submissionChannel: null }, update: { submissionChannel: null } });
    const unset = await takeSubmissionChannel({ ok: false }, form({ exerciseId: ex.id }));
    expect(unset).toMatchObject({ ok: false, message: expect.stringContaining("Configuration, Invitation") });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).submissionChannel).toBeNull();

    await db.windowPolicy.update({ where: { organisationId }, data: { submissionChannel: "ONLINE" } });
    expect(await takeSubmissionChannel({ ok: false }, form({ exerciseId: ex.id }))).toMatchObject({ ok: true });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).submissionChannel).toBe("ONLINE");
    const trail = JSON.stringify((await db.auditEntry.findFirstOrThrow({ where: { entity: "SourcingExercise", entityId: ex.id }, orderBy: { at: "desc" } })).changes);
    expect(trail).toContain("Not set");
    expect(trail).toContain("Online, sealed in the portal");

    // A pin that is set is never changed, even when the setting has changed since.
    await db.windowPolicy.update({ where: { organisationId }, data: { submissionChannel: "PAPER" } });
    expect(await takeSubmissionChannel({ ok: false }, form({ exerciseId: ex.id }))).toMatchObject({ ok: false, message: expect.stringContaining("already set") });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).submissionChannel).toBe("ONLINE");

    const published = await make({ status: "ADVERTISED" });
    expect(await takeSubmissionChannel({ ok: false }, form({ exerciseId: published.id }))).toMatchObject({ ok: false, message: expect.stringContaining("published") });
    const cancelled = await make({ status: "CANCELLED" });
    expect(await takeSubmissionChannel({ ok: false }, form({ exerciseId: cancelled.id }))).toMatchObject({ ok: false, message: expect.stringContaining("cancelled") });
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: published.id } })).submissionChannel).toBeNull();
  });
});

async function judgedFor(exerciseId: string) {
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId } });
  const window = await db.exerciseWindow.findUnique({ where: { exerciseId } });
  const sealing = await loadSealingFacts(organisationId, ex);
  const found = publishSealingFaults({ channel: ex.submissionChannel, online: onlineSubmissionAllowed(sealing.mode, { demoAllowed: true, liveAllowed: false }, "PUBLISH"), key: sealing.key, rules: sealing.rules, alternativesPermitted: window?.alternativesPermitted ?? null, pepperRequired: sealing.mode === "LIVE", pepperConfigured: sealing.pepper === "SET" });
  return found.map((f) => ({ code: f.code, words: publishSealingWords(f) }));
}

describe("publication judged on the real rows (D3, D7)", () => {
  const judged = judgedFor;

  it("refuses an exercise with no key, then with a stale key, in words; a returned part with no types or size is named; and alternatives stay unstated until said", async () => {
    const ex = await exerciseWith(2);
    const pack = await db.tenderPack.create({ data: { organisationId, exerciseId: ex.id, versionNo: 1, packKind: "TENDER", contractBasisCode: "X", compositionSnapshot: {}, status: "APPROVED", approvedStartOn: new Date("2026-11-01"), approvedClosingAt: new Date("2026-12-01T02:00:00Z"), approvedAt: new Date(), frozenAt: new Date(), submittedAt: new Date() } });
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { packKindSnapshot: "TENDER" } });
    const part = await db.tenderPackPart.create({ data: { organisationId, packId: pack.id, partCode: `P${randomId()}`, printedNumber: "1", sortOrder: 1, labelSnapshot: "Grand Summary", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", mandatory: true, returnedByBidder: true } });
    const none = await judged(ex.id);
    expect(none.map((f) => f.code)).toEqual(expect.arrayContaining(["KEY_NOT_SET", "RULES_NOT_SET", "ALTERNATIVES_NOT_STATED"]));
    expect(none.find((f) => f.code === "KEY_NOT_SET")!.words).toMatch(/2 officers have still to set one/);

    // The part's configured rules: opening check answered, types and size not.
    await db.tenderDocumentPart.create({ data: { organisationId, code: part.partCode, packKind: "TENDER", printedNumber: "1", labelEn: "Grand Summary", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", openingCheck: true, openingCheckProvenance: "STATED" } });
    for (const o of ex.officers) await share(ex.id, o);
    const unset = await judged(ex.id);
    expect(unset.map((f) => f.code)).not.toContain("KEY_NOT_SET");
    expect(unset.filter((f) => f.code === "PART_TYPES_NOT_SET" || f.code === "PART_SIZE_NOT_SET").map((f) => f.words).join(" ")).toContain("Grand Summary");
    expect(unset.map((f) => f.code)).toContain("ALTERNATIVES_NOT_STATED");

    // A new officer is named: the key is retired, so the exercise is not ready again until they set theirs.
    const extra = await signedIn();
    await db.$transaction(async (tx) => {
      await tx.exerciseOpeningOfficer.create({ data: { organisationId, exerciseId: ex.id, personId: extra.person.id, seatLabelSnapshot: "Member 3", namedAt: new Date(), namedByPersonId: extra.person.id } });
      await rekeyAfterRosterChange(tx, organisationId, ex.id, "An opening officer was named", new Date(), extra.person.id);
    });
    const stale = await judged(ex.id);
    expect(stale.find((f) => f.code === "KEY_NOT_SET")!.words).toMatch(/One officer has still to set one/);
  }, 90_000);

  it("an exercise made while the organisation's channel was unset is refused at publication, naming where to take it; a paper one has no sealing refusal", async () => {
    const unpinned = await db.sourcingExercise.create({ data: { organisationId, reference: `KC/UN/${randomId()}`, requisitionId, title: "Unpinned", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "DOCUMENTS_IN_PREPARATION" } });
    const refused = await judged(unpinned.id);
    expect(refused.map((f) => f.code)).toEqual(["CHANNEL_NOT_SET"]);
    expect(refused[0].words).toMatch(/Take the organisation's setting under Notice and fee/);
    const paper = await db.sourcingExercise.create({ data: { organisationId, reference: `KC/PP/${randomId()}`, requisitionId, title: "Paper", estimatedValue: "1000.00", sourcingMethodCode: "M", status: "DOCUMENTS_IN_PREPARATION", submissionChannel: "PAPER" } });
    expect(await judged(paper.id)).toEqual([]);
  });
});

describe("the cases only the rows can make", () => {
  it("an unset organisation mode is refused at publication in words", async () => {
    const ex = await exerciseWith(2);
    await db.bidSealingPolicy.update({ where: { organisationId }, data: { onlineSubmission: null } });
    try {
      const refused = await judgedFor(ex.id);
      expect(refused.find((f) => f.code === "ONLINE_NOT_SET")?.words).toMatch(/not set for the organisation/);
    } finally {
      await db.bidSealingPolicy.update({ where: { organisationId }, data: { onlineSubmission: "DEMONSTRATION" } });
    }
  });

  it("a key that no longer matches the officers is stale, said in words at publication, and cannot be changed by a re-key", async () => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    const old = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    // The owner ends a roster row and does not touch the key (a defect or a hand edit): the key now names someone who is gone.
    await db.exerciseOpeningOfficer.update({ where: { id: ex.officers[1].rosterId }, data: { endedAt: new Date(), endedByPersonId: ex.officers[0].person.id, endedReason: "test" } });
    expect((await judgedFor(ex.id)).find((f) => f.code === "KEY_STALE")?.words).toMatch(/no longer matches/);
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { onlineSubmissionMode: "DEMONSTRATION", onlineBidRules: { v: 1, frozenAt: new Date().toISOString(), parts: [] }, publishedKeyFingerprint: old.fingerprint } });
    const [a] = ex.officers;
    who.actor = a.actor;
    const out = await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "Try", [actFieldNames("personId").password]: a.password }));
    expect(out).toMatchObject({ ok: false });
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id } })).toBe(0);
  }, 90_000);

  it("a re-key with a submission already taken is refused in words and writes nothing", async () => {
    const ex = await exerciseWith(2);
    for (const o of ex.officers) await share(ex.id, o);
    const key = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { onlineSubmissionMode: "DEMONSTRATION", onlineBidRules: { v: 1, frozenAt: new Date().toISOString(), parts: [] }, publishedKeyFingerprint: key.fingerprint, status: "ADVERTISED" } });
    const s = await makeSupplierAccount(organisationId);
    const hex = (n: number) => randomBytes(n).toString("hex");
    await db.$transaction(async (tx) => {
      const envelopeId = `env_${randomId()}${randomId()}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "BidEnvelope" ("id","organisationId","exerciseId","sequence","kind","channel","receivedAt","receivedSource","markings","late","recordedAfterClosing")
         VALUES ($1,$2,$3,1,'BID','ONLINE',date_trunc('second', "sealed_clock"()),'PORTAL','',false,false)`,
        envelopeId, organisationId, ex.id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "OnlineBid" ("id","organisationId","exerciseId","keyId","envelopeId","supplierId","submittedBySupplierAccountId","kind","sealedManifest","manifestDek","manifestCipherSha256","sealedDeclaration","declarationDek","declarationCipherSha256","receiptDigest")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'BID',decode($8,'hex'),decode($9,'hex'),$10,decode($11,'hex'),decode($12,'hex'),$13,$14)`,
        `bid_${randomId()}${randomId()}`, organisationId, ex.id, key.id, envelopeId, s.supplier.id, s.account!.id, hex(200), hex(80), hex(32), hex(60), hex(80), hex(32), hex(32),
      );
    });
    const [a] = ex.officers;
    who.actor = a.actor;
    const out = await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "Too late", [actFieldNames("personId").password]: a.password }));
    expect(out).toMatchObject({ ok: false, message: expect.stringContaining("A bid has been submitted") });
    expect((await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } })).id).toBe(key.id);
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id } })).toBe(0);
  }, 90_000);
});
