import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, randomPassword, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

import { loadMakers, noteMaker } from "./maker-store";

/**
 * Issuing the approval matrix against the scratch database (ADR 0034 D15, Phase 2c): each draft edit makes its maker; a draft nobody is on record as having made
 * must be adopted first; the one who issues is never a maker, asks the password, and is written down; and the database refuses an issue that breaks it, whatever
 * writes it. The actions are the real ones. Only the request is stood in for: who is signed in, and the cache.
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
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`); } }));

import { adoptDraft, issueDraft, saveCoreLevel, startRevision } from "@/app/configuration/approval-matrix/actions";

let organisationId = "";
let organisationCode = "";

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `MX_${randomId()}`, name: "Matrix issue", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  organisationCode = org.code;
  await setPolicy(organisationId, SETTINGS);
  await db.authorityRole.create({ data: { organisationId, code: "MX_OFFICER", nameEn: "Matrix officer", nameMs: "Pegawai" } });
});

async function signedIn(opts: { admin?: boolean; org?: string } = {}) {
  const org = opts.org ?? organisationId;
  const person = await makeAccount(org, { admin: opts.admin ?? false });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: org, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
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

/// A draft no maker is on record for (what existed when sign-in landed), with one rule so that it could be issued.
async function unknownDraft(org = organisationId) {
  const label = `Draft ${randomId()}`;
  const m = await db.authorityMatrix.create({
    data: { organisationId: org, label, effectiveFrom: new Date("2030-01-01T00:00:00Z"), boundaryValue: "500000.00", quotationFloor: "50000.00", tenderFloor: "500000.00", requisitionBoundary: "500000.00", makersUnknownAtLanding: true },
  });
  await db.authorityRule.create({ data: { authorityMatrixId: m.id, ruleKey: `r_${randomId()}`, domain: "requisition", labelEn: "A rule", clause: "cl. 1", approverCode: "MX_OFFICER" } });
  return m;
}
// Issues follow one another in one organisation, each from a later day than the last: every issue here starts a year after the one before it.
let year = 2031;
const issueForm = (id: string, password: string, from = `${year++}-01-01`) => form({ id, effectiveFrom: from, reason: "The resolution", [actFieldNames("personId").password]: password });
const stored = (id: string) => db.authorityMatrix.findUniqueOrThrow({ where: { id } });

describe("a draft with nobody on record as having made it", () => {
  it("cannot be issued by anyone, administrator or not, until it is adopted; and the refusal says so before it asks for a password", async () => {
    const draft = await unknownDraft();
    const a = await signedIn({ admin: true });
    as(a);
    const outcome = await issueDraft({ ok: false }, issueForm(draft.id, a.password));
    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining("Nobody is recorded") });
    expect((await stored(draft.id)).issuedAt).toBeNull();
    // No password was asked: no step-up was counted for or against the administrator.
    expect(await db.signInEvent.count({ where: { staffAccountId: a.account.id, kind: { in: ["STEP_UP_OK", "STEP_UP_FAILED"] } } })).toBe(0);
  });

  it("is adopted by a person, who becomes its maker and is audited, and once only", async () => {
    const draft = await unknownDraft();
    const a = await signedIn({ admin: true });
    as(a);
    expect(await adoptDraft({ ok: false }, form({ id: draft.id }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect(await adoptDraft({ ok: false }, form({ id: draft.id, reason: "I reviewed it" }))).toEqual({ ok: true });
    expect((await loadMakers(db, draft.id)).personIds).toEqual([a.person.id]);
    // The flag records what was true when sign-in landed: it is a fact of history, and adopting does not rewrite it.
    expect((await stored(draft.id)).makersUnknownAtLanding).toBe(true);
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "AuthorityMatrix", entityId: draft.id, action: "UPDATE" } });
    expect(audit).toMatchObject({ actorPersonId: a.person.id, reason: "Adopted: I reviewed it" });
    const b = await signedIn({ admin: true });
    as(b);
    expect(await adoptDraft({ ok: false }, form({ id: draft.id, reason: "me too" }))).toMatchObject({ ok: false, message: expect.stringContaining("already has a maker") });
    expect((await loadMakers(db, draft.id)).personIds).toEqual([a.person.id]);
  });

  it("is refused to a person who may not draft", async () => {
    const draft = await unknownDraft();
    const officer = await signedIn();
    as(officer);
    expect(await adoptDraft({ ok: false }, form({ id: draft.id, reason: "x" }))).toMatchObject({ ok: false, message: expect.stringContaining("Not permitted") });
    expect((await loadMakers(db, draft.id)).personIds).toEqual([]);
  });
});

describe("issuing", () => {
  it("is refused to the one who adopted it, and done by a different person with their password, who is written down as the issuer", async () => {
    const draft = await unknownDraft();
    const a = await signedIn({ admin: true });
    const b = await signedIn({ admin: true });
    as(a);
    expect(await adoptDraft({ ok: false }, form({ id: draft.id, reason: "reviewed" }))).toEqual({ ok: true });
    expect(await issueDraft({ ok: false }, issueForm(draft.id, a.password))).toMatchObject({ ok: false, message: expect.stringContaining("You made this draft") });
    expect((await stored(draft.id)).issuedAt).toBeNull();

    as(b);
    // The wrong password signs nothing, and counts.
    const wrong = await issueDraft({ ok: false }, issueForm(draft.id, randomPassword()));
    expect(wrong).toMatchObject({ ok: false, errors: expect.any(Object) });
    expect((await stored(draft.id)).issuedAt).toBeNull();
    expect(await db.signInEvent.count({ where: { staffAccountId: b.account.id, kind: "STEP_UP_FAILED" } })).toBe(1);
    // The password blank is not the password.
    expect(await issueDraft({ ok: false }, issueForm(draft.id, ""))).toMatchObject({ ok: false });
    expect((await stored(draft.id)).issuedAt).toBeNull();

    expect(await issueDraft({ ok: false }, issueForm(draft.id, b.password))).toEqual({ ok: true });
    const issued = await stored(draft.id);
    expect(issued.issuedAt).not.toBeNull();
    expect(issued.issuedByPersonId).toBe(b.person.id);
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "AuthorityMatrix", entityId: draft.id, slot: "issuedByPerson" } });
    expect(attribution).toMatchObject({ mode: "SIGNED", subjectPersonId: b.person.id, recordedByPersonId: b.person.id, documentEntity: "AuthorityMatrix", documentId: draft.id });
    expect(attribution.stepUpAt).not.toBeNull();
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "AuthorityMatrix", entityId: draft.id, reason: "The resolution" } });
    expect(audit).toMatchObject({ actorPersonId: b.person.id });
    expect(JSON.stringify(audit.changes)).toContain(a.person.name);
    // And it is final: issued once, by the second person, and nobody issues it again.
    expect(await issueDraft({ ok: false }, issueForm(draft.id, b.password))).toMatchObject({ ok: false, message: expect.stringContaining("already been issued") });
  });

  it("with one person who could issue it, says a second person is needed, and nothing fakes an approval", async () => {
    const org = await db.organisation.create({ data: { code: `MX_${randomId()}`, name: "One person", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    await db.authorityRole.create({ data: { organisationId: org.id, code: "MX_OFFICER", nameEn: "Matrix officer", nameMs: "Pegawai" } });
    const only = await signedIn({ admin: true, org: org.id });
    const draft = await unknownDraft(org.id);
    as(only);
    expect(await adoptDraft({ ok: false }, form({ id: draft.id, reason: "reviewed" }))).toEqual({ ok: true });
    const outcome = await issueDraft({ ok: false }, issueForm(draft.id, only.password));
    expect(outcome).toMatchObject({ ok: false, message: expect.stringMatching(/second person is needed/) });
    expect((await stored(draft.id)).issuedAt).toBeNull();
    // Once a second person holds the permission, they issue it.
    const second = await signedIn({ admin: true, org: org.id });
    as(second);
    expect(await issueDraft({ ok: false }, issueForm(draft.id, second.password))).toEqual({ ok: true });
  });

  it("is refused to a person who does not hold the permission to issue, before anything is asked", async () => {
    const draft = await unknownDraft();
    const officer = await signedIn();
    as(officer);
    expect(await issueDraft({ ok: false }, issueForm(draft.id, officer.password))).toMatchObject({ ok: false, message: expect.stringContaining("Not permitted") });
  });
});

describe("an edit of a draft makes its maker", () => {
  it("an edit makes the editor a maker once, a refused edit makes nobody, and a person never makes themselves a maker through a form", async () => {
    const draft = await unknownDraft();
    const a = await signedIn({ admin: true });
    as(a);
    // A refused edit (no such office) is rolled back or answers a refusal: it makes nobody a maker.
    const refused = await saveCoreLevel({ ok: false }, form({ authorityMatrixId: draft.id, approverCode: "NO_SUCH_OFFICE", provenance: "STATED", clause: "c" }));
    expect(refused.ok).toBe(false);
    expect((await loadMakers(db, draft.id)).personIds).toEqual([]);

    const done = await saveCoreLevel({ ok: false }, form({ authorityMatrixId: draft.id, approverCode: "MX_OFFICER", provenance: "STATED", clause: "c" }));
    expect(done).toEqual({ ok: true });
    expect((await loadMakers(db, draft.id)).personIds).toEqual([a.person.id]);
    // The same editor again, changing the row: still one maker.
    const level = await db.coreRoutingLevel.findFirstOrThrow({ where: { authorityMatrixId: draft.id } });
    expect(await saveCoreLevel({ ok: false }, form({ id: level.id, authorityMatrixId: draft.id, approverCode: "MX_OFFICER", provenance: "OBSERVED", clause: "c2" }))).toEqual({ ok: true });
    expect(await db.authorityMatrixMaker.count({ where: { matrixId: draft.id } })).toBe(1);
    // A second editor is a second maker; and the first, now a maker, may not issue.
    const b = await signedIn({ admin: true });
    as(b);
    expect(await saveCoreLevel({ ok: false }, form({ id: level.id, authorityMatrixId: draft.id, approverCode: "MX_OFFICER", provenance: "STATED", clause: "c3" }))).toEqual({ ok: true });
    expect((await loadMakers(db, draft.id)).personIds.sort()).toEqual([a.person.id, b.person.id].sort());
    // Neither maker issues it, and a third person does.
    for (const maker of [a, b]) {
      as(maker);
      expect(await issueDraft({ ok: false }, issueForm(draft.id, maker.password)), maker.account.loginName).toMatchObject({ ok: false, message: expect.stringContaining("You made this draft") });
    }
    const c = await signedIn({ admin: true });
    as(c);
    expect(await issueDraft({ ok: false }, issueForm(draft.id, c.password))).toEqual({ ok: true });
  });

  it("noteMaker is idempotent, keeps the time of the first edit, and a loader run makes no maker", async () => {
    const draft = await unknownDraft();
    const a = await signedIn({ admin: true });
    const first = new Date("2026-10-07T01:00:00Z");
    await db.$transaction(async (tx) => {
      expect(await noteMaker(tx, { matrixId: draft.id, actor: a.actor, now: first })).toBe(true);
      expect(await noteMaker(tx, { matrixId: draft.id, actor: a.actor, now: new Date("2026-10-07T02:00:00Z") })).toBe(false);
      expect(await noteMaker(tx, { matrixId: draft.id, actor: { ...a.actor, system: { label: "demo loader" } } })).toBe(false);
    });
    const rows = await db.authorityMatrixMaker.findMany({ where: { matrixId: draft.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].firstAt.toISOString()).toBe(first.toISOString());
  });
});

describe("a revision started from an issue", () => {
  it("is a draft with no issuer: the issue it copies was issued by a second person, and the draft is made by whoever started it and issued by another (review of Phase 2c)", async () => {
    // Its own organisation: one draft at a time, and the others in this file leave theirs.
    const org = await db.organisation.create({ data: { code: `MX_${randomId()}`, name: "Revision", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    await db.authorityRole.create({ data: { organisationId: org.id, code: "MX_OFFICER", nameEn: "Matrix officer", nameMs: "Pegawai" } });
    const a = await signedIn({ admin: true, org: org.id });
    const b = await signedIn({ admin: true, org: org.id });
    const c = await signedIn({ admin: true, org: org.id });
    const first = await unknownDraft(org.id);
    as(a);
    expect(await adoptDraft({ ok: false }, form({ id: first.id, reason: "reviewed" }))).toEqual({ ok: true });
    as(b);
    expect(await issueDraft({ ok: false }, issueForm(first.id, b.password))).toEqual({ ok: true });
    expect((await stored(first.id)).issuedByPersonId).toBe(b.person.id);

    // Anyone starts a revision from that issue. Before the fix, the issuer was carried onto the draft and the database refused it (23514).
    as(c);
    const started = await startRevision({ ok: false }, form({ fromId: first.id, label: `Revision ${randomId()}`, effectiveFrom: "2060-01-01" })).catch((e: Error) => e);
    const draftId = /issue=([^&\s]+)/.exec(String((started as Error).message))?.[1];
    expect(draftId, String(started)).toBeTruthy();
    const draft = await stored(draftId!);
    expect(draft).toMatchObject({ issuedAt: null, issuedByPersonId: null, makersUnknownAtLanding: false });
    expect((await loadMakers(db, draft.id)).personIds).toEqual([c.person.id]);

    // The starter made it, so the starter does not issue it; a person who did not make it does, and is written down.
    expect(await issueDraft({ ok: false }, form({ id: draft.id, effectiveFrom: "2060-01-01", reason: "The resolution", [actFieldNames("personId").password]: c.password }))).toMatchObject({ ok: false, message: expect.stringContaining("You made this draft") });
    as(a);
    expect(await issueDraft({ ok: false }, form({ id: draft.id, effectiveFrom: "2060-01-01", reason: "The resolution", [actFieldNames("personId").password]: a.password }))).toEqual({ ok: true });
    expect((await stored(draft.id)).issuedByPersonId).toBe(a.person.id);
  });

  it("a revision of a landing draft is not itself a landing draft: the flag is a fact about the draft that existed when sign-in landed", async () => {
    const org = await db.organisation.create({ data: { code: `MX_${randomId()}`, name: "Revision of a landing draft", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(org.id, SETTINGS);
    await db.authorityRole.create({ data: { organisationId: org.id, code: "MX_OFFICER", nameEn: "Matrix officer", nameMs: "Pegawai" } });
    const a = await signedIn({ admin: true, org: org.id });
    const source = await db.authorityMatrix.create({
      data: { organisationId: org.id, label: `Landing ${randomId()}`, effectiveFrom: new Date("2020-01-01T00:00:00Z"), issuedAt: new Date("2020-01-01T00:00:00Z"), boundaryValue: "1.00", quotationFloor: "1.00", tenderFloor: "1.00", requisitionBoundary: "1.00", makersUnknownAtLanding: true },
    });
    as(a);
    const started = await startRevision({ ok: false }, form({ fromId: source.id, label: `Revision ${randomId()}`, effectiveFrom: "2060-01-01" })).catch((e: Error) => e);
    const draftId = /issue=([^&\s]+)/.exec(String((started as Error).message))?.[1];
    expect(draftId, String(started)).toBeTruthy();
    expect(await stored(draftId!)).toMatchObject({ makersUnknownAtLanding: false });
  });
});

describe("the database refuses an issue that breaks the rule, whatever writes it", () => {
  function sqlState(error: unknown): string {
    const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
    return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
  }
  async function refusal(work: Promise<unknown>): Promise<string | null> {
    try {
      await work;
      return null;
    } catch (error) {
      return sqlState(error);
    }
  }

  it("names no issuer, has no maker on record, or names a maker as the issuer: refused (PA005)", async () => {
    const draft = await unknownDraft();
    const maker = await signedIn({ admin: true });
    const other = await signedIn({ admin: true });
    const issue = (issuer: string | null) => db.authorityMatrix.update({ where: { id: draft.id }, data: { issuedAt: new Date(), issuedByPersonId: issuer } });
    // Nobody on record.
    expect(await refusal(issue(other.person.id))).toBe("PA005");
    await db.authorityMatrixMaker.create({ data: { matrixId: draft.id, personId: maker.person.id } });
    // No issuer, then a maker as issuer.
    expect(await refusal(issue(null))).toBe("PA005");
    expect(await refusal(issue(maker.person.id))).toBe("PA005");
    expect((await stored(draft.id)).issuedAt).toBeNull();
    // A different person issues it.
    expect(await refusal(issue(other.person.id))).toBeNull();
    // Who issued it is never changed after.
    expect(await refusal(db.authorityMatrix.update({ where: { id: draft.id }, data: { issuedByPersonId: maker.person.id } }))).toBe("PA005");
    expect((await stored(draft.id)).issuedByPersonId).toBe(other.person.id);
  });

  it("a row written already issued (a seed, a loader) is not an issue, and an issue made before sign-in keeps no issuer", async () => {
    const m = await db.authorityMatrix.create({
      data: { organisationId, label: `History ${randomId()}`, effectiveFrom: new Date("2020-01-01T00:00:00Z"), issuedAt: new Date("2020-01-01T00:00:00Z"), boundaryValue: "1.00", quotationFloor: "1.00", tenderFloor: "1.00", requisitionBoundary: "1.00" },
    });
    expect(await refusal(db.authorityMatrix.update({ where: { id: m.id }, data: { effectiveTo: new Date("2030-01-01T00:00:00Z") } }))).toBeNull();
    expect((await stored(m.id)).issuedByPersonId).toBeNull();
  });
});

void organisationCode;
