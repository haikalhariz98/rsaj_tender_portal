import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * A value a supplier's registration offers (a grade, a category, a specialisation) is changed by a second person (the plan's 5b line, ruling 1909(A)): the proposal
 * carries the reason the audited direct save asks for, the guard that refuses what the editor refuses is the editor's own and speaks at the proposal, and nothing is
 * written until a different person applies it. Real wrappers, real registry, real editor; only the request is stood in for.
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

import { applyChangeAction } from "../changes/actions";
import { saveRegistrationValue, setRegistrationValueRetired } from "./actions";

let organisationId = "";
let bodyId = "";
beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `RV_${randomId()}`, name: "Registration values", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  bodyId = (await db.registrationBody.create({ data: { organisationId, code: `b_${randomId()}`, labelEn: "A registration body" } })).id;
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
const latestChange = () => db.configurationChange.findFirstOrThrow({ where: { organisationId }, orderBy: { proposedAt: "desc" } });

describe("a registration value, proposed and applied", () => {
  it("is added by a second person's decision, with the proposer's reason in the trail, and not before", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const code = `g_${randomId()}`;
    as(a);
    const proposed = await saveRegistrationValue(state, form({ bodyId, kind: "GRADE", code, nameEn: "Grade G9", rank: "9", provenance: "STATED", reason: "The body published a ninth grade" }, a.password));
    expect(proposed).toMatchObject({ ok: true, notice: expect.stringContaining("Nothing has changed yet") });
    expect(await db.registrationValue.findFirst({ where: { organisationId, code } })).toBeNull();
    const change = await latestChange();
    expect(change).toMatchObject({ kind: "CONFIGURATION_EDIT", status: "PROPOSED", reason: "The body published a ninth grade" });
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change.id }, b.password))).toMatchObject({ ok: true });
    expect(await db.registrationValue.findFirst({ where: { organisationId, code } })).toMatchObject({ rank: 9, nameEn: "Grade G9" });
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "RegistrationValue", action: "CREATE" } });
    expect(trail).toMatchObject({ actorPersonId: b.person.id });
  });

  it("is refused at the proposal when the editor refuses it, in the editor's own words, and a retirement asks its reason", async () => {
    const a = await signedIn();
    await signedIn();
    as(a);
    // A value with no name is the editor's refusal: the proposer is told at once, beside the field, and nothing is held.
    const before = await db.configurationChange.count({ where: { organisationId } });
    const refused = await saveRegistrationValue(state, form({ bodyId, kind: "GRADE", code: `g_${randomId()}`, nameEn: "", rank: "2", provenance: "STATED" }, a.password));
    expect(refused).toMatchObject({ ok: false, errors: { nameEn: expect.any(String) } });
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
    const value = await db.registrationValue.create({ data: { organisationId, bodyId, kind: "GRADE", code: `g_${randomId()}`, nameEn: "Grade", rank: 3, provenance: "STATED" } });
    const noReason = await setRegistrationValueRetired(state, form({ id: value.id, retire: "yes" }, a.password));
    expect(noReason).toMatchObject({ ok: false });
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
  });

  it("is retired by a second person, with the reason the proposer gave", async () => {
    const a = await signedIn();
    const b = await signedIn();
    const value = await db.registrationValue.create({ data: { organisationId, bodyId, kind: "GRADE", code: `g_${randomId()}`, nameEn: "Grade to retire", rank: 4, provenance: "STATED" } });
    as(a);
    const proposed = await setRegistrationValueRetired(state, form({ id: value.id, retire: "yes", retiredOn: "2026-10-10", reason: "The body withdrew it" }, a.password));
    expect(proposed).toMatchObject({ ok: true });
    expect((await db.registrationValue.findUniqueOrThrow({ where: { id: value.id } })).retiredOn).toBeNull();
    const change = await latestChange();
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change.id }, b.password))).toMatchObject({ ok: true });
    expect((await db.registrationValue.findUniqueOrThrow({ where: { id: value.id } })).retiredOn).not.toBeNull();
  });
});
