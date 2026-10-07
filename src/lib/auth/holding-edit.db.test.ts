import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makeAccount, makePerson, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { administratorHoldingViolations } from "./administration-guard";

/**
 * A holding that already breaks the administration rule can be ended (review of Phase 2a). Before the rule, an office, a seat or a delegation could be given to
 * any Person, so a database may hold one of an administrator's; refusing every edit of it, an edit that only ends it included, would leave it for good. The rule
 * is asked of an edit that gives or extends a holding, never of one that ends or shortens it. And a database that may already break the rule can be asked,
 * read only (`npm run auth:holdings`).
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
const NOW = new Date("2026-10-07T04:00:00Z");
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let adminPersonId = "";
let colleagueId = "";
const roleCode = `R_${randomId()}`;
let delegationId = "";
let assignmentId = "";

beforeAll(async () => {
  const org = await testOrganisation();
  organisationId = org.id;
  const admin = await makeAccount(organisationId, { admin: true });
  adminPersonId = admin.person.id;
  colleagueId = (await makePerson(organisationId)).id;
  // The editor is a third person: the officer who records a delegation from the grantor's letter is never its delegate (review of Phase 2b), so the editor cannot be the colleague it names.
  const editorId = (await makePerson(organisationId)).id;
  who.actor = {
    kind: "STAFF",
    accountId: "",
    sessionId: "",
    personId: editorId,
    personName: "Editor",
    jobTitle: null,
    isAdministrator: true,
    organisationId,
    organisationCode: org.code,
    organisationTimeZone: org.timeZone,
    offices: [],
    permissions: new Set(),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: null,
    mustChangePassword: false,
  };
  // What a database from before the rule may hold, written past the rule: the administrator's Person holds an office, and has delegated it.
  assignmentId = (await db.roleAssignment.create({ data: { personId: adminPersonId, roleCode, effectiveFrom: day("2020-01-01") } })).id;
  delegationId = (
    await db.delegation.create({ data: { organisationId, fromPersonId: adminPersonId, toPersonId: colleagueId, roleCode, capabilityCodes: [], effectiveFrom: day("2026-01-01"), effectiveTo: day("2030-12-31"), reason: "before the rule" } })
  ).id;
});

describe("the read-only check for a database from before the rule", () => {
  it("finds an administrator's Person who holds an office or a delegation, in words, and counts only what has not ended", async () => {
    const found = (await db.$transaction((tx) => administratorHoldingViolations(tx, NOW))).filter((v) => v.personId === adminPersonId);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ holdings: { offices: 1, seats: 0, delegations: 1 }, words: "1 office, 1 delegation" });
    const later = (await db.$transaction((tx) => administratorHoldingViolations(tx, day("2031-06-01")))).filter((v) => v.personId === adminPersonId);
    expect(later).toHaveLength(1);
    expect(later[0].holdings).toEqual({ offices: 1, seats: 0, delegations: 0 });
  });

  it("changes nothing", async () => {
    const before = await db.auditEntry.count({ where: { organisationId } });
    await db.$transaction((tx) => administratorHoldingViolations(tx, NOW));
    expect(await db.auditEntry.count({ where: { organisationId } })).toBe(before);
  });
});

describe("a delegation of an administrator's Person", () => {
  const edit = (effectiveTo: string, over: Record<string, string> = {}) =>
    // Phase 2b: the grantor is the signed-in person, or another whose delegation is recorded from their letter, with its reference: the test is not signed in as the administrator.
    form({ id: delegationId, fromPersonId: adminPersonId, "fromPersonId:paperReference": "Letter of the grantor", toPersonId: colleagueId, roleCode, effectiveFrom: "2026-01-01", effectiveTo, reason: "Edited by the test", ...over });

  it("is refused an edit that extends it, with the words that say why", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    const r = await saveDelegation({ ok: false }, edit("2031-12-31"));
    expect(r).toMatchObject({ ok: false });
    expect(JSON.stringify(r)).toMatch(/administrator/);
    expect((await db.delegation.findUniqueOrThrow({ where: { id: delegationId } })).effectiveTo).toEqual(day("2030-12-31"));
  });

  it("can be ended, which is an edit that only shortens it", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    const r = await saveDelegation({ ok: false }, edit("2026-10-06"));
    expect(r).toEqual({ ok: true });
    expect((await db.delegation.findUniqueOrThrow({ where: { id: delegationId } })).effectiveTo).toEqual(day("2026-10-06"));
  });
});

describe("a delegation recorded from another grantor's letter (review of Phase 2b)", () => {
  const edit = () => form({ id: delegationId, fromPersonId: adminPersonId, "fromPersonId:paperReference": "Letter of the grantor", toPersonId: colleagueId, roleCode, effectiveFrom: "2026-01-01", effectiveTo: "2026-10-06", reason: "Edited by the test" });
  const as = async <T,>(over: Partial<StaffActor>, run: () => Promise<T>): Promise<T> => {
    const saved = who.actor;
    who.actor = { ...saved!, ...over };
    try {
      return await run();
    } finally {
      who.actor = saved;
    }
  };

  it("is refused to the officer it delegates to: one person would grant the authority and hold it", async () => {
    const { saveDelegation } = await import("@/app/configuration/users/actions");
    const before = await db.delegation.findUniqueOrThrow({ where: { id: delegationId } });
    const r = await as({ personId: colleagueId, personName: "The delegate" }, () => saveDelegation({ ok: false }, edit()));
    expect(r).toMatchObject({ ok: false, errors: { toPersonId: expect.stringMatching(/to yourself/) } });
    expect(await db.delegation.findUniqueOrThrow({ where: { id: delegationId } })).toEqual(before);
  });
});

describe("an office of an administrator's Person", () => {
  const edit = (effectiveTo: string) => form({ id: assignmentId, personId: adminPersonId, roleCode, effectiveFrom: "2020-01-01", effectiveTo, reason: "Edited by the test" });

  it("can be shortened, is then refused an edit that opens its end again, and can still be ended", async () => {
    const { saveAssignment } = await import("@/app/configuration/users/actions");
    expect(await saveAssignment({ ok: false }, edit("2027-12-31"))).toEqual({ ok: true });
    const reopened = await saveAssignment({ ok: false }, edit(""));
    expect(reopened).toMatchObject({ ok: false });
    expect(JSON.stringify(reopened)).toMatch(/administrator/);
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).effectiveTo).toEqual(day("2027-12-31"));
  });

  it("can be ended by an edit that sets its end", async () => {
    const { saveAssignment } = await import("@/app/configuration/users/actions");
    const r = await saveAssignment({ ok: false }, edit("2026-10-06"));
    expect(r).toEqual({ ok: true });
    expect((await db.roleAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).effectiveTo).toEqual(day("2026-10-06"));
    const found = (await db.$transaction((tx) => administratorHoldingViolations(tx, NOW))).filter((v) => v.personId === adminPersonId);
    expect(found).toHaveLength(0);
  });
});
