import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { loadDraftMakers, noteDraftMaker } from "@/lib/auth/draft-makers";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * An evaluation model is drafted and then issued by someone who did not make the draft (ADR 0034 D15, Phase 5a), against the scratch database: each accepted
 * edit of a draft makes its maker, the issue is refused to a maker (before the password is asked) and to nobody-on-record, and the database refuses an issue that
 * breaks the rule whatever writes it. The actions are the real ones; only the request is stood in for.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    staffForPermission: async (key: string) => (who.actor!.permissions.has(key as never) ? { ok: true as const, actor: who.actor! } : { ok: false as const, state: { ok: false as const, message: `Not permitted: ${key}` } }),
  };
});
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

import { adoptModelDraft, discardDraft, issueModel, newModelVersion, saveBandSet, saveModel, saveStage } from "./actions";

let organisationId = "";
beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `EV_${randomId()}`, name: "Evaluation issue", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
});

async function signedIn(opts: { admin?: boolean } = {}) {
  const person = await makeAccount(organisationId, { admin: opts.admin ?? true });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}
type Person = Awaited<ReturnType<typeof signedIn>>;
const as = (p: Person) => {
  who.actor = p.actor;
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const state = { ok: false } as const;

async function aDraft(maker: Person) {
  as(maker);
  const code = `m_${randomId()}`;
  expect(await saveModel(state, form({ code, nameEn: "A model", route: "TRADITIONAL", provenance: "ASSUMED", governingSource: "test", notes: "" }))).toMatchObject({ ok: true });
  return db.evaluationModel.findFirstOrThrow({ where: { organisationId, code } });
}
const makersOf = async (id: string) => (await loadDraftMakers(db, "EvaluationModel", id)).personIds;

describe("the makers of an evaluation model's draft", () => {
  it("are the people whose edits were accepted, once each, and not those whose edit was refused", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const draft = await aDraft(a);
    expect(await makersOf(draft.id)).toEqual([a.person.id]);
    // A refused edit (an order that is not a number) makes nobody a maker.
    as(b);
    expect(await saveStage(state, form({ modelId: draft.id, stageId: "", order: "x", labelEn: "Stage" }))).toMatchObject({ ok: false });
    expect(await makersOf(draft.id)).toEqual([a.person.id]);
    expect(await saveStage(state, form({ modelId: draft.id, stageId: "", order: "1", labelEn: "Stage one", code: "s1", kind: "SCORED", side: "IMPLEMENTING_DEPARTMENT", provenance: "ASSUMED", governingSource: "test" }))).toMatchObject({ ok: true });
    expect(await makersOf(draft.id)).toEqual([a.person.id, b.person.id]);
    as(a);
    await saveStage(state, form({ modelId: draft.id, stageId: "", order: "2", labelEn: "Stage two", code: "s2", kind: "SCORED", side: "IMPLEMENTING_DEPARTMENT", provenance: "ASSUMED", governingSource: "test" }));
    expect(await makersOf(draft.id)).toEqual([a.person.id, b.person.id]);
  });

  it("is a person who holds the drafting permission, so a person who does not cannot edit a draft", async () => {
    const a = await signedIn();
    const draft = await aDraft(a);
    const officer = await signedIn({ admin: false });
    as(officer);
    expect(await saveModel(state, form({ id: draft.id, nameEn: "Renamed", route: "TRADITIONAL", provenance: "ASSUMED" }))).toMatchObject({ ok: false, message: expect.stringContaining("Not permitted") });
    expect(await newModelVersion(state, form({ id: draft.id }))).toMatchObject({ ok: false, message: expect.stringContaining("Not permitted") });
    expect(await makersOf(draft.id)).toEqual([a.person.id]);
  });

  it("go with the draft when it is discarded", async () => {
    const a = await signedIn();
    const draft = await aDraft(a);
    expect(await discardDraft(state, form({ id: draft.id, reason: "Not needed" }))).toMatchObject({ ok: true });
    expect(await makersOf(draft.id)).toEqual([]);
    expect(await db.evaluationModel.count({ where: { id: draft.id } })).toBe(0);
  });
});

// RSAJ answer 11 (2026-10-27): a band set may round a figure half up before banding it. Saved, audited and carried to the next version.
describe("a band set's rounding before banding", () => {
  it("is saved from the drawer's choices only, audited in words, and copied to a new version", async () => {
    const a = await signedIn();
    as(a);
    const code = `r_${randomId()}`;
    const issued = await db.evaluationModel.create({ data: { organisationId, code, version: 1, nameEn: "Rounded", route: "TRADITIONAL", provenance: "ASSUMED", status: "ISSUED", issuedAt: new Date(), contentSnapshot: {} } });
    await db.evaluationBandSet.create({ data: { organisationId, modelId: issued.id, code: "cpr", nameEn: "CPR bands", roundPlaces: 0 } });
    expect(await newModelVersion(state, form({ id: issued.id }))).toMatchObject({ ok: true });
    const draft = await db.evaluationModel.findFirstOrThrow({ where: { organisationId, code, version: 2 }, include: { bandSets: true } });
    expect(draft.bandSets.map((b) => [b.code, b.roundPlaces])).toEqual([["cpr", 0]]);
    const set = draft.bandSets[0];
    const save = (roundPlaces: string) => saveBandSet(state, form({ modelId: draft.id, setId: set.id, nameEn: "CPR bands", roundPlaces, provenance: "STATED", governingSource: "answer 11" }));
    expect(await save("4")).toMatchObject({ ok: false, errors: { roundPlaces: expect.any(String) } });
    expect(await save("")).toMatchObject({ ok: true });
    expect((await db.evaluationBandSet.findUniqueOrThrow({ where: { id: set.id } })).roundPlaces).toBeNull();
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entityId: draft.id, action: "UPDATE", entityLabel: { endsWith: "CPR bands" } }, orderBy: { at: "desc" } });
    expect(trail.changes).toContainEqual(expect.objectContaining({ field: "rounding", before: "To a whole number", after: "Not rounded" }));
  });
});

describe("issuing", () => {
  it("is refused to a maker, before the password is asked, and to a draft nobody made until it is adopted", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const draft = await aDraft(a);
    as(a);
    expect(await issueModel(state, form({ id: draft.id, [actFieldNames("personId").password]: a.password }))).toMatchObject({ ok: false, message: expect.stringContaining("You made this draft") });
    expect(await db.signInEvent.count({ where: { staffAccountId: a.account.id, kind: { in: ["STEP_UP_OK", "STEP_UP_FAILED"] } } })).toBe(0);
    // A draft with nobody on record (what existed when this rule landed): not issued by anyone until someone has edited or adopted it.
    const orphan = await db.evaluationModel.create({ data: { organisationId, code: `o_${randomId()}`, version: 1, nameEn: "Orphan", route: "TRADITIONAL", provenance: "ASSUMED" } });
    as(b);
    expect(await issueModel(state, form({ id: orphan.id, [actFieldNames("personId").password]: b.password }))).toMatchObject({ ok: false, message: expect.stringContaining("Nobody is recorded") });
    expect(await adoptModelDraft(state, form({ id: orphan.id }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect(await adoptModelDraft(state, form({ id: orphan.id, reason: "I reviewed it" }))).toEqual({ ok: true });
    expect(await makersOf(orphan.id)).toEqual([b.person.id]);
    expect(await adoptModelDraft(state, form({ id: orphan.id, reason: "me too" }))).toMatchObject({ ok: false, message: expect.stringContaining("already has a maker") });
    // Having adopted it, the adopter is a maker and may not issue it.
    expect(await issueModel(state, form({ id: orphan.id, [actFieldNames("personId").password]: b.password }))).toMatchObject({ ok: false, message: expect.stringContaining("You made this draft") });
  });

  it("is let through to the draft's own checks for a different person with their password, which is then spent", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const draft = await aDraft(a);
    as(b);
    // An empty model does not pass its own checks: that is the next refusal, which proves the maker's rule was passed.
    expect(await issueModel(state, form({ id: draft.id, [actFieldNames("personId").password]: b.password }))).toMatchObject({ ok: false, message: expect.stringContaining("Not issued:") });
    expect(await db.signInEvent.count({ where: { staffAccountId: b.account.id, kind: "STEP_UP_OK" } })).toBe(1);
    expect(await db.evaluationModel.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "DRAFT", issuedByPersonId: null });
    // A wrong password is refused and counted.
    expect(await issueModel(state, form({ id: draft.id, [actFieldNames("personId").password]: "not the password" }))).toMatchObject({ ok: false });
    expect(await db.signInEvent.count({ where: { staffAccountId: b.account.id, kind: "STEP_UP_FAILED" } })).toBe(1);
  });

  it("is refused to a person who does not hold the permission to issue", async () => {
    const a = await signedIn();
    const draft = await aDraft(a);
    const officer = await signedIn({ admin: false });
    as(officer);
    expect(await issueModel(state, form({ id: draft.id, [actFieldNames("personId").password]: officer.password }))).toMatchObject({ ok: false, message: expect.stringContaining("Not permitted") });
  });
});

describe("the database holds the same rule, whatever writes it", () => {
  const code = (e: unknown) => {
    const cause = (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } }).meta?.driverAdapterError?.cause;
    return cause?.originalCode ?? cause?.code ?? String(e);
  };
  const attempt = (work: Promise<unknown>) => work.then(() => null, code);

  it("refuses an evaluation model put into force with no issuer, with no maker on record, or by one of its makers; and lets a different person do it", async () => {
    const maker = await makeAccount(organisationId, { admin: true });
    const issuer = await makeAccount(organisationId, { admin: true });
    const draft = await db.evaluationModel.create({ data: { organisationId, code: `t_${randomId()}`, version: 1, nameEn: "T", route: "TRADITIONAL", provenance: "ASSUMED" } });
    const put = (issuedByPersonId: string | null) => db.evaluationModel.update({ where: { id: draft.id }, data: { status: "ISSUED", issuedAt: new Date(), contentSnapshot: {}, issuedByPersonId } });
    expect(await attempt(put(null))).toBe("PA005");
    expect(await attempt(put(issuer.person.id))).toBe("PA005");
    await noteDraftMaker(db, { organisationId, entity: "EvaluationModel", entityId: draft.id, actor: { personId: maker.person.id, system: undefined } });
    expect(await attempt(put(null))).toBe("PA005");
    expect(await attempt(put(maker.person.id))).toBe("PA005");
    expect(await attempt(put(issuer.person.id))).toBeNull();
    // Who issued it is never changed.
    expect(await attempt(db.evaluationModel.update({ where: { id: draft.id }, data: { issuedByPersonId: maker.person.id } }))).toBe("PA005");
  });

  it("does not judge a model written already in force (a loader's history) or a change that is not an issue", async () => {
    const row = await db.evaluationModel.create({ data: { organisationId, code: `h_${randomId()}`, version: 1, nameEn: "History", route: "TRADITIONAL", provenance: "ASSUMED", status: "ISSUED", issuedAt: new Date(), contentSnapshot: {} } });
    expect(await attempt(db.evaluationModel.update({ where: { id: row.id }, data: { notes: "a note" } }))).toBeNull();
    expect(await attempt(db.evaluationModel.update({ where: { id: row.id }, data: { status: "RETIRED", retiredAt: new Date() } }))).toBeNull();
  });

  it("refuses a rate schedule put into force by one of its makers as well, with the same rule", async () => {
    const maker = await makeAccount(organisationId, { admin: true });
    const issuer = await makeAccount(organisationId, { admin: true });
    const draft = await db.rateSchedule.create({ data: { organisationId, label: `Rates ${randomId()}`, issueNo: 1, provenance: "ASSUMED" } });
    const put = (issuedByPersonId: string | null) => db.rateSchedule.update({ where: { id: draft.id }, data: { status: "ISSUED", issuedOn: new Date(), effectiveFrom: new Date(), issuedByPersonId } });
    expect(await attempt(put(issuer.person.id))).toBe("PA005");
    await noteDraftMaker(db, { organisationId, entity: "RateSchedule", entityId: draft.id, actor: { personId: maker.person.id, system: undefined } });
    expect(await attempt(put(maker.person.id))).toBe("PA005");
    expect(await attempt(put(issuer.person.id))).toBeNull();
  });

  it("holds only the two drafts it knows, and one maker once per person", async () => {
    const p = await makeAccount(organisationId, { admin: true });
    expect(await attempt(db.configurationDraftMaker.create({ data: { organisationId, entity: "Something", entityId: "x", personId: p.person.id } }))).toBe("23514");
    const id = `d_${randomId()}`;
    await db.configurationDraftMaker.create({ data: { organisationId, entity: "RateSchedule", entityId: id, personId: p.person.id } });
    expect(await attempt(db.configurationDraftMaker.create({ data: { organisationId, entity: "RateSchedule", entityId: id, personId: p.person.id } }))).toBe("23505");
  });
});
