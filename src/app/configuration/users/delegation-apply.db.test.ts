import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, makePerson, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { loadAttributions } from "@/lib/auth/attribution-read";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * Ruling 1982(h)(1) (log line 2036): when a second person applies a delegation, the trail names the GRANTOR the form names, never the person who applied it. Against the scratch
 * database, with the real wrappers, the real registry and the real `saveDelegation`; only the request is stood in for (who is signed in, the cookies, the cache).
 *
 *   - the proposer is the grantor: the grantor's own act, made at the proposal, and the applier is on the change as the person who decided it;
 *   - the proposer recorded it from the grantor's letter: recorded on the grantor's behalf BY THE PROPOSER, with the paper reference the proposal kept, and never the password.
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
    // The same dispatch the product's `beginAct` makes: an act an editor begins while a second person applies the change.
    beginAct: (actor: StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActAmbientWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { applyChangeAction } from "../changes/actions";
import { saveDelegation } from "./actions";

let organisationId = "";
const roleCode = `DLG_${randomId()}`;
let jobholderId = "";

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `DA_${randomId()}`, name: "Delegation apply", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
  await makeAccount(organisationId, { admin: true });
  await db.authorityRole.create({ data: { organisationId, code: roleCode, nameEn: "Office delegated in the test", nameMs: "Jawatan" } });
  jobholderId = (await makePerson(organisationId)).id;
  await db.roleAssignment.create({ data: { personId: jobholderId, roleCode, effectiveFrom: new Date("2020-01-01") } });
});

/// A signed-in officer who holds exactly the permissions given, through a role the organisation granted them to.
async function officer(...keys: ("configuration.draft" | "configuration.issue" | "acts.recordOnBehalf")[]) {
  const code = `OFC_${randomId()}`;
  await db.authorityRole.create({ data: { organisationId, code, nameEn: `Role ${code}`, nameMs: "Peranan" } });
  for (const permissionKey of keys) await db.rolePermission.create({ data: { organisationId, permissionKey, roleCode: code, decision: "GRANTED" } });
  const person = await makeAccount(organisationId);
  await db.roleAssignment.create({ data: { personId: person.person.id, roleCode: code, effectiveFrom: new Date("2020-01-01") } });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}
type Officer = Awaited<ReturnType<typeof officer>>;

const form = (fields: Record<string, string>, password?: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  if (password) f.set(actFieldNames("personId").password, password);
  return f;
};
const state = { ok: false } as const;

/// The delegation form: from the grantor, to the delegate, of the jobholder's office. Dates are in the future so that no rule about the past is in the way.
const delegationFields = (fromPersonId: string, toPersonId: string, extra: Record<string, string> = {}) => ({
  fromPersonId,
  toPersonId,
  jobholderPersonId: jobholderId,
  roleCode,
  effectiveFrom: "2027-01-01",
  effectiveTo: "2027-06-30",
  reason: "Away on leave",
  ...extra,
});

async function proposeAndApply(proposer: Officer, applier: Officer, fields: Record<string, string>) {
  who.actor = proposer.actor;
  const proposed = await saveDelegation(state, form(fields, proposer.password));
  expect(proposed, JSON.stringify(proposed)).toMatchObject({ ok: true });
  const change = await db.configurationChange.findFirstOrThrow({ where: { organisationId, proposedByPersonId: proposer.person.id }, orderBy: { proposedAt: "desc" } });
  expect(await db.delegation.count({ where: { organisationId, toPersonId: fields.toPersonId } })).toBe(0);
  who.actor = applier.actor;
  const applied = await applyChangeAction(state, form({ changeId: change.id }, applier.password));
  expect(applied).toMatchObject({ ok: true });
  const delegation = await db.delegation.findFirstOrThrow({ where: { organisationId, toPersonId: fields.toPersonId } });
  const attribution = await db.actAttribution.findFirstOrThrow({ where: { organisationId, entity: "Delegation", entityId: delegation.id, slot: "fromPerson" } });
  const words = (await loadAttributions(db, organisationId, [{ entity: "Delegation", ids: [delegation.id], slot: "fromPerson" }])).read({ entity: "Delegation", id: delegation.id, slot: "fromPerson" }, fields.fromPersonId === proposer.person.id ? proposer.person.name : (await db.person.findUniqueOrThrow({ where: { id: fields.fromPersonId } })).name);
  return { change, delegation, attribution, words };
}

describe("a delegation a second person applies (ruling 1982(h)(1))", () => {
  it("proposed for another grantor from their letter: the trail names that grantor, recorded by the proposer with the paper, and never the applier", async () => {
    // The applier holds only the permission to issue configuration: not the permission to record from paper, which is the proposer's to hold and was asked at the proposal.
    const proposer = await officer("configuration.draft", "acts.recordOnBehalf");
    const applier = await officer("configuration.issue");
    const grantor = await makePerson(organisationId, `Grantor ${randomId()}`);
    const delegate = await makePerson(organisationId, `Delegate ${randomId()}`);

    const { change, attribution, words } = await proposeAndApply(proposer, applier, delegationFields(grantor.id, delegate.id, { "fromPersonId:paperReference": "Letter LB/2026/17" }));

    // The grantor is the person the form names, and the proposer is who recorded it: never the applier.
    expect(attribution).toMatchObject({ subjectPersonId: grantor.id, recordedByPersonId: proposer.person.id, mode: "RECORDED_ON_BEHALF", paperReference: "Letter LB/2026/17" });
    expect(attribution.subjectPersonId).not.toBe(applier.person.id);
    expect(attribution.recordedByPersonId).not.toBe(applier.person.id);
    expect(words.en).toBe(`Recorded by ${proposer.person.name} on behalf of ${grantor.name}, not signed`);
    expect(words.en).not.toContain(applier.person.name);
    // The stored proposal keeps the paper reference and never a password.
    const fields = (change.payload as { fields: [string, unknown][] }).fields.map(([name]) => name);
    expect(fields).toContain("fromPersonId:paperReference");
    expect(fields.some((name) => /password/i.test(name))).toBe(false);
    // The applier is on the change as the person who decided it, and their own act is the change's decision.
    expect(await db.configurationChange.findUniqueOrThrow({ where: { id: change.id } })).toMatchObject({ status: "APPLIED", decidedByPersonId: applier.person.id });
    expect(await db.actAttribution.findFirstOrThrow({ where: { organisationId, entity: "ConfigurationChange", entityId: change.id, slot: "decidedBy" } })).toMatchObject({ subjectPersonId: applier.person.id });
  });

  it("proposed by the grantor themselves: their own act, made at the proposal, with the applier on the change as the checker", async () => {
    const proposer = await officer("configuration.draft");
    const applier = await officer("configuration.issue");
    const delegate = await makePerson(organisationId, `Delegate ${randomId()}`);

    const { change, attribution, words } = await proposeAndApply(proposer, applier, delegationFields(proposer.person.id, delegate.id, { effectiveFrom: "2027-07-01", effectiveTo: "2027-12-31" }));

    expect(attribution).toMatchObject({ subjectPersonId: proposer.person.id, recordedByPersonId: proposer.person.id, mode: "SIGNED" });
    expect(words.en).toBe(`Granted by ${proposer.person.name}`);
    expect(words.en).not.toContain(applier.person.name);
    expect(await db.configurationChange.findUniqueOrThrow({ where: { id: change.id } })).toMatchObject({ status: "APPLIED", proposedByPersonId: proposer.person.id, decidedByPersonId: applier.person.id });
  });

  it("is refused at the proposal, with nothing kept, when the proposer may not record for another grantor", async () => {
    const proposer = await officer("configuration.draft");
    const grantor = await makePerson(organisationId, `Grantor ${randomId()}`);
    const delegate = await makePerson(organisationId, `Delegate ${randomId()}`);
    who.actor = proposer.actor;
    const before = await db.configurationChange.count({ where: { organisationId } });
    const out = await saveDelegation(state, form(delegationFields(grantor.id, delegate.id, { "fromPersonId:paperReference": "Letter LB/2026/18" }), proposer.password));
    expect(out).toMatchObject({ ok: false });
    expect(await db.configurationChange.count({ where: { organisationId } })).toBe(before);
  });
});
