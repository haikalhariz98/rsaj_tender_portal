import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * An editor's save from the screen to the table, with the real wrappers, the real registry and the real editor (Phase 5b), against the scratch database: the numbering
 * editor is proposed by one person (nothing is written), applied by a second (written, in the decision's transaction, with the second person as the actor of the trail),
 * and declined, withdrawn and made stale as the rule says. Only the request is stood in for: who is signed in, the cookies, and the cache.
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

import { applyChangeAction, declineChangeAction, withdrawChangeAction } from "./actions";
import { saveSeries } from "../numbering/actions";

let organisationId = "";
beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `ST_${randomId()}`, name: "Staged edit", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
});

async function signedIn() {
  const person = await makeAccount(organisationId, { admin: true });
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
const form = (fields: Record<string, string>, password?: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (password) f.set(actFieldNames("personId").password, password);
  return f;
};
const state = { ok: false } as const;
const seriesForm = (key: string, pattern = "TST/{YEAR}/{SERIAL}") => ({ key, nameEn: `Series ${key}`, pattern, padding: "3", resetOn: "CALENDAR_YEAR", financialYearStartMonth: "1", provenance: "ASSUMED", notes: "" });
const seriesOf = (key: string) => db.numberingSeries.findFirst({ where: { organisationId, key } });
const latestChange = () => db.configurationChange.findFirstOrThrow({ where: { organisationId }, orderBy: { proposedAt: "desc" } });

describe("an editor's save through the screen's own action", () => {
  it("proposes, and writes nothing, until a second person applies it with their password", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const key = `st_${randomId()}`;
    as(a);
    const proposed = await saveSeries(state, form({ ...seriesForm(key), reason: "Starting the series" }, a.password));
    expect(proposed).toMatchObject({ ok: true, notice: expect.stringContaining("Nothing has changed yet") });
    expect(await seriesOf(key)).toBeNull();
    const change = await latestChange();
    expect(change).toMatchObject({ kind: "CONFIGURATION_EDIT", status: "PROPOSED", proposedByPersonId: a.person.id, reason: "Starting the series" });
    expect(change.payload).toMatchObject({ operation: "numbering.saveSeries" });
    // The proposer cannot decide it; a second person with a wrong password cannot either.
    expect(await applyChangeAction(state, form({ changeId: change.id }, a.password))).toMatchObject({ ok: false, message: expect.stringContaining("you cannot decide it") });
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change.id }, "not the password"))).toMatchObject({ ok: false });
    expect(await seriesOf(key)).toBeNull();
    // The second person applies it: written, with them as the actor of the trail and the proposer's reason beside it.
    expect(await applyChangeAction(state, form({ changeId: change.id }, b.password))).toMatchObject({ ok: true });
    expect(await seriesOf(key)).toMatchObject({ pattern: "TST/{YEAR}/{SERIAL}", nameEn: `Series ${key}` });
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "NumberingSeries", entityLabel: `Series ${key}` } });
    expect(trail).toMatchObject({ action: "CREATE", actorPersonId: b.person.id });
    expect(trail.reason).toContain("Starting the series");
    expect(trail.reason).toContain(a.person.name);
    expect(await db.configurationChange.findUniqueOrThrow({ where: { id: change.id } })).toMatchObject({ status: "APPLIED", decidedByPersonId: b.person.id });
  });

  it("answers the editor's own refusals to the proposer at once, beside the field, and keeps nothing", async () => {
    const a = await signedIn();
    await signedIn();
    as(a);
    const before = await db.configurationChange.count({ where: { organisationId } });
    const out = await saveSeries(state, form({ ...seriesForm(`st_${randomId()}`, "NO-SERIAL-HERE") }, a.password));
    expect(out).toMatchObject({ ok: false, errors: { pattern: expect.stringContaining("SHORTYEAR") } });
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
  });

  it("is declined by a second person with a reason, and withdrawn by the proposer, and neither writes the series", async () => {
    const a = await signedIn();
    const b = await signedIn();
    as(a);
    const k1 = `st_${randomId()}`;
    await saveSeries(state, form(seriesForm(k1), a.password));
    const c1 = await latestChange();
    as(b);
    expect(await declineChangeAction(state, form({ changeId: c1.id, reason: "" }, b.password))).toMatchObject({ ok: false });
    expect(await declineChangeAction(state, form({ changeId: c1.id, reason: "Not this one" }, b.password))).toMatchObject({ ok: true });
    expect(await seriesOf(k1)).toBeNull();
    as(a);
    const k2 = `st_${randomId()}`;
    await saveSeries(state, form(seriesForm(k2), a.password));
    const c2 = await latestChange();
    expect(await withdrawChangeAction(state, form({ changeId: c2.id }, a.password))).toMatchObject({ ok: true });
    expect(await db.configurationChange.findUniqueOrThrow({ where: { id: c2.id } })).toMatchObject({ status: "WITHDRAWN" });
    expect(await seriesOf(k2)).toBeNull();
  });

  it("is stale, and applies nothing, when the series moved after it was proposed", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const key = `st_${randomId()}`;
    // The series exists; the proposal changes its pattern.
    await db.numberingSeries.create({ data: { organisationId, key, nameEn: `Series ${key}`, pattern: "OLD/{SERIAL}", padding: 3, resetOn: "NEVER", serialPeriod: "" } });
    const id = (await seriesOf(key))!.id;
    as(a);
    expect(await saveSeries(state, form({ ...seriesForm(key, "NEW/{YEAR}/{SERIAL}"), id }, a.password))).toMatchObject({ ok: true });
    const change = await latestChange();
    await db.numberingSeries.update({ where: { id }, data: { pattern: "MOVED/{SERIAL}" } });
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change.id }, b.password))).toMatchObject({ ok: false, message: expect.stringContaining("changed since it was proposed") });
    expect(await seriesOf(key)).toMatchObject({ pattern: "MOVED/{SERIAL}" });
    expect(await db.configurationChange.findUniqueOrThrow({ where: { id: change.id } })).toMatchObject({ status: "STALE" });
  });

  it("is refused to a person who does not hold the drafting permission, and the proposal says a second person is needed where nobody else could decide it", async () => {
    const lone = await db.organisation.create({ data: { code: `ST_${randomId()}`, name: "Lone", timeZone: "Asia/Kuala_Lumpur" } });
    await setPolicy(lone.id, SETTINGS);
    const person = await makeAccount(lone.id, { admin: true });
    const token = randomBytes(32).toString("base64url");
    await createStaffSession(db, { organisationId: lone.id, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
    const read = await readStaffSession(token, { sourceAddress: null });
    if (!read.ok) throw new Error("no session");
    who.actor = read.actor as StaffActor;
    expect(await saveSeries(state, form(seriesForm(`st_${randomId()}`), person.password))).toMatchObject({ ok: false, message: expect.stringContaining("A second person is needed") });
    const officer = await signedIn();
    who.actor = { ...officer.actor, isAdministrator: false, permissions: new Set() };
    expect(await saveSeries(state, form(seriesForm(`st_${randomId()}`), officer.password))).toMatchObject({ ok: false, message: expect.stringContaining("Not permitted") });
  });
});
