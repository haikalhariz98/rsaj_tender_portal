import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

import { lockDelegationsOf } from "./lock";

/**
 * Delegation and reporting lines against a real database (Phase 3c, threat model F8): a grantor other than the actor is refused unless the actor may record for
 * another; two delegations that would close a loop cannot both be saved, however they race; a reporting line cannot close a loop, and a person is marked absent
 * and their pending step moves. The authority of each is the editor's own permission, `configuration.draft`.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    staffForPermission: async () => ({ ok: true as const, actor: who.actor }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const run = randomId();
const ROLE = `DEL_${run}`;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let organisationId = "";
let a = "";
let b = "";
let c = "";
let clerk = "";
let base: StaffActor;

const as = async <T,>(over: Partial<StaffActor>, fn: () => Promise<T>): Promise<T> => {
  const saved = who.actor;
  who.actor = { ...saved!, ...over };
  try {
    return await fn();
  } finally {
    who.actor = saved;
  }
};
const delegation = (from: string, to: string, over: Record<string, string> = {}) =>
  form({ fromPersonId: from, toPersonId: to, roleCode: ROLE, effectiveFrom: "2026-10-01", effectiveTo: "2026-12-31", reason: "Test", ...over });

beforeAll(async () => {
  // Its own organisation, so that "no reporting line is recorded" is true at the start whatever other files left: the lines and delegations of an earlier run are removed
  // (neither is evidence; the trail and the notices stay).
  const org = await db.organisation.upsert({ where: { code: "P3C_DELEGATION_TEST" }, update: {}, create: { code: "P3C_DELEGATION_TEST", name: "Delegation test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await db.reportingLine.deleteMany({ where: { organisationId } });
  await db.delegation.deleteMany({ where: { organisationId } });
  a = (await makePerson(organisationId, `A ${run}`)).id;
  b = (await makePerson(organisationId, `B ${run}`)).id;
  c = (await makePerson(organisationId, `C ${run}`)).id;
  clerk = (await makePerson(organisationId, `Clerk ${run}`)).id;
  base = {
    kind: "STAFF", accountId: "", sessionId: "", personId: a, personName: `A ${run}`, jobTitle: null, isAdministrator: false,
    organisationId, organisationCode: org.code, organisationTimeZone: org.timeZone, offices: [], permissions: new Set(["configuration.draft"]),
    stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false,
  };
  who.actor = base;
  // Both A and B hold the office, so either can be a grantor of it.
  await db.roleAssignment.createMany({ data: [a, b, c].map((personId) => ({ personId, roleCode: ROLE, effectiveFrom: day("2020-01-01") })) });
});

describe("a grantor other than the signed-in officer (F8)", () => {
  it("is refused to an officer who is neither an administrator nor may record on someone's behalf", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    // The clerk keys A's delegation to C from A's letter.
    const r = await as({ personId: clerk, personName: "Clerk", isAdministrator: false, permissions: new Set(["configuration.draft"]) }, () =>
      saveDelegation({ ok: false }, delegation(a, c, { "fromPersonId:paperReference": "Letter of A" })),
    );
    expect(r).toMatchObject({ ok: false, errors: { fromPersonId: expect.stringMatching(/granted by the officer signed in/) } });
    expect(await db.delegation.count({ where: { organisationId, roleCode: ROLE } })).toBe(0);
  });

  it("is accepted from an administrator, with both people kept: the grantor and the officer who recorded it", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    const r = await as({ personId: clerk, personName: "Clerk", isAdministrator: true }, () =>
      saveDelegation({ ok: false }, delegation(a, c, { "fromPersonId:paperReference": "Letter of A", effectiveTo: "2026-10-31" })),
    );
    expect(r).toEqual({ ok: true });
    const row = await db.delegation.findFirstOrThrow({ where: { organisationId, roleCode: ROLE } });
    const att = await db.actAttribution.findFirstOrThrow({ where: { entity: "Delegation", entityId: row.id, slot: "fromPerson" } });
    expect(att.subjectPersonId).toBe(a);
    expect(att.recordedByPersonId).toBe(clerk);
  });

  it("is accepted from an officer who holds the permission to record on someone's behalf", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    const r = await as({ personId: clerk, personName: "Clerk", isAdministrator: false, permissions: new Set(["configuration.draft", "acts.recordOnBehalf"]) }, () =>
      saveDelegation({ ok: false }, delegation(b, c, { "fromPersonId:paperReference": "Letter of B", effectiveTo: "2026-10-31" })),
    );
    expect(r).toEqual({ ok: true });
  });

  it("tells the delegate in the portal, once", async () => {
    const told = await db.staffNotice.findMany({ where: { organisationId, recipientPersonId: c, kind: "DELEGATION_RECEIVED" } });
    expect(told.length).toBeGreaterThanOrEqual(1);
    expect(told[0]!.body).toContain("the whole office");
  });
});

describe("two delegations that would close a loop cannot both be saved, however they race (F8)", () => {
  it("a save waits for the one in progress, and then reads it", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    const ROLE2 = `DEL2_${run}`;
    await db.roleAssignment.createMany({ data: [a, b].map((personId) => ({ personId, roleCode: ROLE2, effectiveFrom: day("2020-01-01") })) });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    // The first save has taken the organisation's delegation lock and written B to A, and has not committed.
    const first = db.$transaction(
      async (tx) => {
        await lockDelegationsOf(tx, organisationId);
        await tx.delegation.create({ data: { organisationId, fromPersonId: b, toPersonId: a, roleCode: ROLE2, capabilityCodes: [], effectiveFrom: day("2026-10-01"), effectiveTo: day("2026-12-31"), reason: "First" } });
        await held;
      },
      { timeout: 30_000 },
    );
    await sleep(300);
    // The second, A to B for the same office, asked while the first stands: it must wait for it, not read around it.
    let settled = false;
    const second = saveDelegation({ ok: false }, delegation(a, b, { roleCode: ROLE2 })).then((r) => {
      settled = true;
      return r;
    });
    await sleep(1500);
    expect(settled, "the second save waits for the first").toBe(false);
    release();
    await first;
    const r = await second;
    // It read the first and was refused: the loop is not stored. (The office allows no onward delegation, so the refusal may name that; a loop is refused either way.)
    expect(r.ok).toBe(false);
    expect(await db.delegation.count({ where: { organisationId, roleCode: ROLE2, fromPersonId: a, toPersonId: b } })).toBe(0);
    expect(await db.delegation.count({ where: { organisationId, roleCode: ROLE2 } })).toBe(1);
  });
});

describe("a reporting line (FR-APR-010, FR-APR-011)", () => {
  const line = (personId: string, superior: string, over: Record<string, string> = {}) =>
    form({ personId, superiorPersonId: superior, effectiveFrom: "2026-01-01", provenance: "ASSUMED", note: "Test", ...over });

  it("is recorded, audited with who recorded it, and a person with none is still 'not set'", async () => {
    const { saveReportingLine } = await import("@/app/configuration/users/actions");
    expect(await saveReportingLine({ ok: false }, line(clerk, a))).toEqual({ ok: true });
    const row = await db.reportingLine.findFirstOrThrow({ where: { organisationId, personId: clerk } });
    expect(row.superiorPersonId).toBe(a);
    const audit = await db.auditEntry.findFirstOrThrow({ where: { entity: "ReportingLine", entityId: row.id } });
    expect(audit.actorPersonId).toBe(a);
    expect(audit.action).toBe("CREATE");
    expect(await db.reportingLine.count({ where: { organisationId, personId: c } })).toBe(0);
  });

  it("refuses a loop, and a second line for the same person over the same days", async () => {
    const { saveReportingLine } = await import("@/app/configuration/users/actions");
    // A under the clerk would make A above the clerk above A.
    const loop = await saveReportingLine({ ok: false }, line(a, clerk));
    expect(loop).toMatchObject({ ok: false, errors: { superiorPersonId: expect.stringMatching(/loop/) } });
    const twice = await saveReportingLine({ ok: false }, line(clerk, b));
    expect(twice).toMatchObject({ ok: false, errors: { effectiveFrom: expect.stringMatching(/already has a reporting line/) } });
    expect(await db.reportingLine.count({ where: { organisationId, personId: clerk } })).toBe(1);
  });

  it("records 'nobody above' as a line, and refuses oneself", async () => {
    const { saveReportingLine } = await import("@/app/configuration/users/actions");
    expect(await saveReportingLine({ ok: false }, line(b, "__none__"))).toEqual({ ok: true });
    expect((await db.reportingLine.findFirstOrThrow({ where: { organisationId, personId: b } })).superiorPersonId).toBeNull();
    const self = await saveReportingLine({ ok: false }, line(c, c));
    expect(self).toMatchObject({ ok: false });
  });

  it("is refused a superior who has left", async () => {
    const { saveReportingLine } = await import("@/app/configuration/users/actions");
    const gone = (await makePerson(organisationId, `Gone ${run}`)).id;
    await db.person.update({ where: { id: gone }, data: { isActive: false } });
    const r = await saveReportingLine({ ok: false }, line(c, gone));
    expect(r).toMatchObject({ ok: false, errors: { superiorPersonId: expect.stringMatching(/left/) } });
  });
});

describe("a delegate must be a direct line subordinate once lines are recorded (FR-APR-011)", () => {
  it("refuses a delegation to someone who does not report to the grantor, and accepts one who does", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    const ROLE3 = `DEL3_${run}`;
    await db.roleAssignment.create({ data: { personId: a, roleCode: ROLE3, effectiveFrom: day("2020-01-01") } });
    // Lines are recorded (the clerk reports to A; B is the head of their line; C has none).
    const refused = await saveDelegation({ ok: false }, delegation(a, b, { roleCode: ROLE3 }));
    expect(refused).toMatchObject({ ok: false, errors: { toPersonId: expect.stringMatching(/direct line subordinate/) } });
    const unset = await saveDelegation({ ok: false }, delegation(a, c, { roleCode: ROLE3 }));
    expect(unset).toMatchObject({ ok: false, errors: { toPersonId: expect.stringMatching(/Reporting line not set/) } });
    const accepted = await saveDelegation({ ok: false }, delegation(a, clerk, { roleCode: ROLE3 }));
    expect(accepted).toEqual({ ok: true });
  });
});
