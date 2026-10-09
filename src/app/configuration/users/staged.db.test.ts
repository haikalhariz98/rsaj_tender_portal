import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { facts, makeAccount, makePerson, randomId, setPolicy, SETTINGS } from "@/lib/test-db/auth-fixtures";

import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";

/**
 * Giving an office, ending it, and changing a committee's quorum or its opening panel are two people's (Phase 5, rulings 1688 and 1689 and the plan's 5a and 5b lines), against
 * the scratch database, through the screens' own actions: one administrator cannot give an office alone, the administrator rule still holds when the second person applies it,
 * a committee's quorum is moved only by its own change, and an edit of a committee never moves it.
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

import { saveCommittee, saveCommitteePanel, saveCommitteeQuorum } from "../committees/actions";
import { applyChangeAction } from "../changes/actions";
import { endAssignment, saveAssignment } from "./actions";

let organisationId = "";
beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `US_${randomId()}`, name: "Staged people", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await setPolicy(organisationId, SETTINGS);
});

async function admin() {
  const person = await makeAccount(organisationId, { admin: true });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { ...person, actor: read.actor as StaffActor };
}
type Person = Awaited<ReturnType<typeof admin>>;
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
const code = () => `US_${randomId()}`;

describe("an office is given and ended by two people", () => {
  it("is held by the person only once a second administrator applies it, and an administrator's own Person is still kept from it", async () => {
    const a = await admin();
    const b = await admin();
    const officer = await makePerson(organisationId, `Officer ${randomId()}`);
    const roleCode = code();
    as(a);
    const proposed = await saveAssignment(state, form({ personId: officer.id, roleCode, effectiveFrom: "2026-01-01", reason: "Appointed by letter" }, a.password));
    expect(proposed).toMatchObject({ ok: true, notice: expect.stringContaining("Nothing has changed yet") });
    expect(await db.roleAssignment.count({ where: { personId: officer.id } })).toBe(0);
    const change = await latestChange();
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change.id }, b.password))).toMatchObject({ ok: true });
    const held = await db.roleAssignment.findFirstOrThrow({ where: { personId: officer.id, roleCode } });
    expect(held.effectiveTo).toBeNull();
    // An office is never given to a Person whose account is an administrator's (ADR 0034 D9): said at the proposal, where the rehearsal runs the editor's own rule.
    const refused = await saveAssignment(state, form({ personId: b.person.id, roleCode: code(), effectiveFrom: "2026-01-01", reason: "x" }, a.password));
    expect(refused).toMatchObject({ ok: false });
    expect(await db.roleAssignment.count({ where: { personId: b.person.id } })).toBe(0);
    // Ending it is the same: proposed, and applied by the second.
    as(a);
    const ended = await endAssignment(state, form({ id: held.id, effectiveTo: "2099-06-30", reason: "Moved to another post" }, a.password));
    expect(ended, JSON.stringify(ended)).toMatchObject({ ok: true });
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id: held.id } })).effectiveTo).toBeNull();
    as(b);
    expect(await applyChangeAction(state, form({ changeId: (await latestChange()).id }, b.password))).toMatchObject({ ok: true });
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id: held.id } })).effectiveTo).not.toBeNull();
  });
});

describe("a committee's quorum and opening panel", () => {
  async function aCommittee(quorum: number | null = 3) {
    return db.committee.create({ data: { organisationId, code: code(), nameEn: `Committee ${randomId()}`, mandate: "test", governingSource: "test", action: "DECIDES", ...(quorum != null ? { quorum, quorumProvenance: "STATED" as const } : {}) } });
  }

  it("is moved by its own change, with a reason, of its own kind, and an edit of the committee never moves it", async () => {
    const a = await admin();
    const b = await admin();
    const c = await aCommittee(3);
    as(a);
    // An edit of the committee posts the quorum back (or a different one) and the quorum stays as it is.
    const edited = await saveCommittee(state, form({ id: c.id, nameEn: c.nameEn, mandate: "A revised mandate", governingSource: "test", action: "DECIDES", quorum: "9", quorumProvenance: "STATED" }, a.password));
    expect(edited).toMatchObject({ ok: true });
    const change1 = await latestChange();
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change1.id }, b.password))).toMatchObject({ ok: true });
    expect(await db.committee.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ quorum: 3, mandate: "A revised mandate" });
    // The quorum's own change.
    as(a);
    expect(await saveCommitteeQuorum(state, form({ id: c.id, quorum: "5", quorumProvenance: "STATED" }, a.password))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect(await saveCommitteeQuorum(state, form({ id: c.id, quorum: "5", quorumProvenance: "STATED", reason: "The new terms of reference" }, a.password))).toMatchObject({ ok: true });
    const change2 = await latestChange();
    expect(change2).toMatchObject({ kind: "QUORUM_CHANGE", status: "PROPOSED" });
    expect((await db.committee.findUniqueOrThrow({ where: { id: c.id } })).quorum).toBe(3);
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change2.id }, b.password))).toMatchObject({ ok: true });
    expect(await db.committee.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ quorum: 5, quorumProvenance: "STATED" });
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "Committee", entityId: c.id, action: "UPDATE", reason: { contains: "The new terms of reference" } } });
    expect(trail).toMatchObject({ actorPersonId: b.person.id });
    expect(JSON.stringify(trail.changes)).toContain("quorum");
  });

  it("is cleared by the same change (null is not zero), and a quorum with no source is refused at the proposal", async () => {
    const a = await admin();
    await admin();
    const c = await aCommittee(4);
    as(a);
    expect(await saveCommitteeQuorum(state, form({ id: c.id, quorum: "6", reason: "x" }, a.password))).toMatchObject({ ok: false, errors: { quorumProvenance: expect.any(String) } });
    expect(await saveCommitteeQuorum(state, form({ id: c.id, quorum: "4", quorumProvenance: "STATED", reason: "x" }, a.password))).toMatchObject({ ok: false, message: expect.stringContaining("already has") });
    expect(await saveCommitteeQuorum(state, form({ id: c.id, reason: "No quorum is written down" }, a.password))).toMatchObject({ ok: true });
    expect((await latestChange()).kind).toBe("QUORUM_CHANGE");
  });

  it("the opening panel's size is a change of its own kind", async () => {
    const a = await admin();
    const b = await admin();
    const c = await aCommittee(null);
    as(a);
    expect(await saveCommitteePanel(state, form({ id: c.id, panelSize: "3", panelSizeProvenance: "STATED", reason: "The tender rules" }, a.password))).toMatchObject({ ok: true });
    const change = await latestChange();
    expect(change.kind).toBe("OPENING_PANEL_SIZE");
    expect((await db.committee.findUniqueOrThrow({ where: { id: c.id } })).panelSize).toBeNull();
    as(b);
    expect(await applyChangeAction(state, form({ changeId: change.id }, b.password))).toMatchObject({ ok: true });
    expect((await db.committee.findUniqueOrThrow({ where: { id: c.id } })).panelSize).toBe(3);
  });
});
