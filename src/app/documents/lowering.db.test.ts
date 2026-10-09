import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * Lowering a classification is two people's (BD-DS-11, Phase 5a), against the scratch database, through the screen's own actions: a document's lowered by a change a
 * holder of `corrections.decide` decides, a class's by a change a holder of `configuration.issue` decides. A raise or a first setting stays one officer's.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    staffForPermission: async (key: string) => (who.actor!.permissions.has(key as never) ? { ok: true as const, actor: who.actor! } : { ok: false as const, state: { ok: false as const, message: `Not permitted: ${key}` } }),
    staffForAct: async () => (who.actor!.isAdministrator ? { ok: false as const, state: { ok: false as const, message: "An administrator account does not do this." } } : { ok: true as const, actor: who.actor! }),
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

import { applyChangeAction } from "../configuration/changes/actions";
import { lowerClassClassification } from "../configuration/documents/actions";
import { reclassifyDocument } from "./actions";

let organisationId = "";
beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `LW_${randomId()}`, name: "Lowering", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
});

async function signedIn(opts: { admin?: boolean; permissions?: ("configuration.draft" | "configuration.issue" | "corrections.decide")[] } = {}) {
  const person = await makeAccount(organisationId, { admin: opts.admin ?? false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  if (opts.permissions?.length) {
    const roleCode = `LW_${randomId()}`;
    await db.authorityRole.create({ data: { organisationId, code: roleCode, nameEn: `Role ${roleCode}`, nameMs: "Peranan" } });
    for (const permissionKey of opts.permissions) await db.rolePermission.create({ data: { organisationId, permissionKey, roleCode, decision: "GRANTED" } });
    await db.roleAssignment.create({ data: { personId: person.person.id, roleCode, effectiveFrom: new Date("2020-01-01") } });
  }
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}
type Person = Awaited<ReturnType<typeof signedIn>>;
const as = (p: Person) => {
  who.actor = p.actor;
};
const form = (fields: Record<string, string>, password?: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (password) f.set(actFieldNames("personId").password, password);
  return f;
};
const state = { ok: false } as const;
const latestChange = () => db.configurationChange.findFirstOrThrow({ where: { organisationId }, orderBy: { proposedAt: "desc" } });

async function aDocument(classification: "PUBLIC" | "INTERNAL" | "SULIT" | null, classClassification: "PUBLIC" | "INTERNAL" | "SULIT" | null = classification) {
  const cls = await db.documentClass.create({ data: { organisationId, code: `lw_${randomId()}`, nameEn: "A class", classification: classClassification } });
  return db.document.create({ data: { organisationId, title: `Doc ${randomId()}`, documentClassId: cls.id, classificationSnapshot: classification, retentionSnapshot: {} } });
}
const snapshotOf = async (id: string) => (await db.document.findUniqueOrThrow({ where: { id } })).classificationSnapshot;

describe("a document's classification", () => {
  it("is lowered by a change a holder of corrections.decide applies, and not before", async () => {
    const maker = await signedIn();
    const checker = await signedIn({ permissions: ["corrections.decide"] });
    const doc = await aDocument("INTERNAL");
    as(maker);
    const proposed = await reclassifyDocument(state, form({ documentId: doc.id, classification: "PUBLIC", reason: "Published on the website" }, maker.password));
    expect(proposed).toMatchObject({ ok: true, notice: expect.stringContaining("Nothing has changed yet") });
    expect(await snapshotOf(doc.id)).toBe("INTERNAL");
    const change = await latestChange();
    expect(change).toMatchObject({ kind: "CLASSIFICATION_DOWNGRADE", status: "PROPOSED", proposedByPersonId: maker.person.id, reason: "Published on the website" });
    as(checker);
    expect(await applyChangeAction(state, form({ changeId: change.id }, checker.password))).toMatchObject({ ok: true });
    expect(await snapshotOf(doc.id)).toBe("PUBLIC");
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "Document", entityId: doc.id, action: "UPDATE" } });
    expect(trail).toMatchObject({ actorPersonId: checker.person.id });
    expect(trail.reason).toContain("Classification lowered");
    expect(trail.reason).toContain("Published on the website");
  });

  it("is decided by no one who merely holds the permission to issue configuration, nor by an administrator account, nor by the proposer", async () => {
    const maker = await signedIn({ permissions: ["corrections.decide"] });
    const configurer = await signedIn({ permissions: ["configuration.draft", "configuration.issue"] });
    const admin = await signedIn({ admin: true });
    const checker = await signedIn({ permissions: ["corrections.decide"] });
    const doc = await aDocument("SULIT");
    as(maker);
    expect(await reclassifyDocument(state, form({ documentId: doc.id, classification: "INTERNAL", reason: "No longer secret" }, maker.password))).toMatchObject({ ok: true });
    const change = await latestChange();
    for (const who2 of [maker, configurer, admin]) {
      as(who2);
      expect(await applyChangeAction(state, form({ changeId: change.id }, who2.password)), who2.loginName).toMatchObject({ ok: false });
    }
    expect(await snapshotOf(doc.id)).toBe("SULIT");
    as(checker);
    expect(await applyChangeAction(state, form({ changeId: change.id }, checker.password))).toMatchObject({ ok: true });
    expect(await snapshotOf(doc.id)).toBe("INTERNAL");
  });

  it("is not lowered alone: an administrator account proposes nothing, and the proposal needs its reason, said at once", async () => {
    const maker = await signedIn();
    await signedIn({ permissions: ["corrections.decide"] });
    const admin = await signedIn({ admin: true });
    const doc = await aDocument("SULIT");
    as(admin);
    expect(await reclassifyDocument(state, form({ documentId: doc.id, classification: "PUBLIC", reason: "x" }, admin.password))).toMatchObject({ ok: false });
    as(maker);
    const before = await db.configurationChange.count({ where: { organisationId } });
    expect(await reclassifyDocument(state, form({ documentId: doc.id, classification: "PUBLIC", reason: "" }, maker.password))).toMatchObject({ ok: false, message: expect.any(String) });
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
    expect(await snapshotOf(doc.id)).toBe("SULIT");
  });

  it("is set, or raised, by one officer at once, as before", async () => {
    const officer = await signedIn();
    const unset = await aDocument(null, "PUBLIC");
    const internal = await aDocument("INTERNAL");
    as(officer);
    const before = await db.configurationChange.count({ where: { organisationId } });
    expect(await reclassifyDocument(state, form({ documentId: unset.id, classification: "INTERNAL", reason: "First setting" }, officer.password))).toMatchObject({ ok: true });
    expect(await snapshotOf(unset.id)).toBe("INTERNAL");
    expect(await reclassifyDocument(state, form({ documentId: internal.id, classification: "SULIT", reason: "Now secret" }, officer.password))).toMatchObject({ ok: true });
    expect(await snapshotOf(internal.id)).toBe("SULIT");
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
  });
});

describe("a document class's classification", () => {
  it("is lowered by a change a second administrator applies, and the old form still refuses a lowering", async () => {
    const a = await signedIn({ admin: true });
    const b = await signedIn({ admin: true });
    const cls = await db.documentClass.create({ data: { organisationId, code: `lw_${randomId()}`, nameEn: "A class to lower", classification: "SULIT" } });
    as(a);
    expect(await lowerClassClassification(state, form({ id: cls.id, classification: "INTERNAL", reason: "The class is no longer secret" }, a.password))).toMatchObject({ ok: true });
    expect((await db.documentClass.findUniqueOrThrow({ where: { id: cls.id } })).classification).toBe("SULIT");
    const change = await latestChange();
    expect(change).toMatchObject({ kind: "CLASSIFICATION_DOWNGRADE", status: "PROPOSED" });
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change.id }, b.password))).toMatchObject({ ok: true });
    expect((await db.documentClass.findUniqueOrThrow({ where: { id: cls.id } })).classification).toBe("INTERNAL");
    // A raise is not a lowering: this editor refuses it at the proposal.
    as(a);
    expect(await lowerClassClassification(state, form({ id: cls.id, classification: "SULIT", reason: "Back up" }, a.password))).toMatchObject({ ok: false, errors: { classification: expect.stringContaining("lowers a classification") } });
  });
});
