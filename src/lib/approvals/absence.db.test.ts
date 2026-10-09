// Phase 5b (the plan's 5b line, decisions log 2026-10-09): the editors of Configuration, Users and roles are proposals now (`actions.ts`), and run in `core.ts` when a second person applies the change.
// This file tests the editors themselves, so it calls `core.ts`; `src/app/configuration/changes/stage.db.test.ts` and `src/lib/auth/edit.db.test.ts` hold the propose-then-apply path.
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * FR-APR-012 against a real database (Phase 3c): marking a holder absent moves the pending steps of an office nobody can then act in, up to the office authority
 * reverts to, where the reporting line says who is above the holders. Where it does not, the step stays and says why. The sweep can be run again and does nothing
 * twice; a mandatory step is never moved; a committee's step is never moved; and the people it concerns are told once.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    // The wrapper an action asks for who may act, with the real rule, on the person this file signs in (Phase 3c review: the sweep asks it first, as escalateStep does).
    staffForAct: async (act: import("@/lib/auth/administration-conflict").AdministratorAct) => {
      const actor = who.actor!;
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const OPENED = new Date("2026-10-03T02:00:00Z");
const run = randomId();

let organisationId = "";
let holder = "";
let boss = "";
let colleague = "";
const A = `RA_${run}`;
const B = `RB_${run}`;
const C = `RC_${run}`;
let requisitionOwner = "";

async function route(sequenceActs: { roleCode: string; act: "A" | "MA" | "R"; committeeCode?: string }[]) {
  const id = `abs_route_${randomId()}`;
  // Its own requisition, so that its label is its own and the sweep's words can be matched to it.
  const reference = `ABS/REQ/${randomId()}`;
  const req = await db.requisition.create({
    data: {
      organisationId, reference, requestingUnitCode: `ABS_UNIT_${run}`, requestingPersonId: requisitionOwner, title: "A requisition for the absence tests",
      justification: "For the absence suite.", needStatement: "None.", costCentreCode: "ABS_CC", accountCode: "ABS_AC", placeOfDelivery: "Nowhere",
      dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
    },
  });
  await db.approvalInstance.create({ data: { id, organisationId, matterKind: "REQUISITION", domain: "requisition", requisitionId: req.id, openedAt: OPENED } });
  const ids: string[] = [];
  for (const [i, s] of sequenceActs.entries()) {
    const stepId = `abs_step_${randomId()}`;
    ids.push(stepId);
    await db.approvalStep.create({ data: { id: stepId, instanceId: id, sequence: i + 1, roleCode: s.roleCode, roleLabel: `Office ${s.roleCode}`, act: s.act, committeeCode: s.committeeCode ?? null } });
  }
  return { id, steps: ids, label: `${reference} · A requisition for the absence tests` };
}

const movedWords = (out: { words: string[] }, label: string) => out.words.find((w) => w.startsWith(`Moved: ${label} `));
const stayedWords = (out: { words: string[] }, label: string) => out.words.find((w) => w.startsWith(`Stays: ${label}.`));

async function sweep() {
  const { moveStepsOfAbsentHolders } = await import("@/app/approvals/actions");
  return moveStepsOfAbsentHolders();
}
const stepOf = (id: string) => db.approvalStep.findUniqueOrThrow({ where: { id } });
const noticesFor = (personId: string, stepId: string) => db.staffNotice.findMany({ where: { recipientPersonId: personId, subjectEntity: "ApprovalStep", subjectId: stepId } });

beforeAll(async () => {
  // Its own organisation, so that "no reporting line is recorded" is true at the start whatever other files left (a line is not evidence: an earlier run's are removed).
  const org = await db.organisation.upsert({ where: { code: "P3C_ABSENCE_TEST" }, update: {}, create: { code: "P3C_ABSENCE_TEST", name: "Absence test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  await db.reportingLine.deleteMany({ where: { organisationId } });
  holder = (await makePerson(organisationId, `Holder ${run}`)).id;
  boss = (await makePerson(organisationId, `Boss ${run}`)).id;
  colleague = (await makePerson(organisationId, `Colleague ${run}`)).id;
  const actor = (await makePerson(organisationId, `Actor ${run}`)).id;
  who.actor = {
    kind: "STAFF", accountId: "", sessionId: "", personId: actor, personName: `Actor ${run}`, jobTitle: null, isAdministrator: false,
    organisationId, organisationCode: org.code, organisationTimeZone: org.timeZone, offices: [],
    // Changed to match the product owner's ruling of 2026-10-08 (log line 1770): recording a person as away needs `configuration.draft`, so the officer these tests sign in holds it.
    // The refusal without it is proved below.
    permissions: new Set(["configuration.draft"]), stepUpAt: null,
    sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false,
  };
  // Three offices: A escalates to B, B to C. A is held by the holder, B by the boss, C by nobody.
  await db.authorityRole.createMany({
    data: [
      { organisationId, code: A, nameEn: `Office A ${run}`, nameMs: `Pejabat A ${run}`, escalatesToCode: B },
      { organisationId, code: B, nameEn: `Office B ${run}`, nameMs: `Pejabat B ${run}`, escalatesToCode: C },
      { organisationId, code: C, nameEn: `Office C ${run}`, nameMs: `Pejabat C ${run}` },
    ],
  });
  await db.roleAssignment.createMany({
    data: [
      { personId: holder, roleCode: A, effectiveFrom: day("2020-01-01") },
      { personId: boss, roleCode: B, effectiveFrom: day("2020-01-01") },
      { personId: colleague, roleCode: B, effectiveFrom: day("2020-01-01") },
    ],
  });
  requisitionOwner = actor;
});

describe("a pending step does not move while its holder is in", () => {
  it("leaves a step whose office has somebody able to act", async () => {
    const r = await route([{ roleCode: A, act: "A" }]);
    const out = await sweep();
    expect(movedWords(out, r.label)).toBeUndefined();
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBeNull();
  });
});

describe("marking the holder absent, with no reporting line recorded", () => {
  it("leaves the step where it is and says Reporting line not set: nothing is promoted on a guess", async () => {
    await db.person.update({ where: { id: holder }, data: { isAvailable: false } });
    const r = await route([{ roleCode: A, act: "A" }]);
    const out = await sweep();
    expect(stayedWords(out, r.label)).toMatch(/Stays: .*\. Reporting line not set/);
    const step = await stepOf(r.steps[0]!);
    expect(step.actingRoleCode).toBeNull();
    expect(step.escalationCount).toBe(0);
    expect(await db.staffNotice.count({ where: { subjectId: r.steps[0] } })).toBe(0);
  });
});

describe("marking the holder absent, with the reporting line recorded", () => {
  let lineId = "";
  beforeAll(async () => {
    await db.person.update({ where: { id: holder }, data: { isAvailable: false } });
    lineId = (await db.reportingLine.create({ data: { organisationId, personId: holder, superiorPersonId: boss, effectiveFrom: day("2020-01-01"), provenance: "ASSUMED" } })).id;
  });

  it("moves the step to the office authority reverts to, records why, and tells the people who now hold it, once", async () => {
    const r = await route([{ roleCode: A, act: "A" }]);
    const out = await sweep();
    expect(movedWords(out, r.label)).toBe(`Moved: ${r.label} from Office ${A} to Office B ${run}.`);
    const step = await stepOf(r.steps[0]!);
    expect(step).toMatchObject({ roleCode: A, actingRoleCode: B, escalation: "NO_AVAILABLE_HOLDER", escalationCount: 1 });
    expect(step.escalationReason).toMatch(/Moved automatically/);
    const told = await noticesFor(boss, r.steps[0]!);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ kind: "STEP_MOVED_ON_ABSENCE", occurrence: "1" });
    expect(told[0]!.body).toContain(`Immediate superior on record: Boss ${run}`);
    expect(await noticesFor(colleague, r.steps[0]!)).toHaveLength(1);
    const audit = await db.auditEntry.findMany({ where: { entity: "ApprovalStep", entityId: r.steps[0] } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.reason).toMatch(/Moved automatically/);
  });

  it("can be run again and does nothing twice: no second move, no second notice", async () => {
    const r = await route([{ roleCode: A, act: "A" }]);
    await sweep();
    await sweep();
    await sweep();
    expect((await stepOf(r.steps[0]!)).escalationCount).toBe(1);
    expect(await noticesFor(boss, r.steps[0]!)).toHaveLength(1);
    expect(await db.auditEntry.count({ where: { entity: "ApprovalStep", entityId: r.steps[0] } })).toBe(1);
  });

  it("never moves a mandatory step for a holder who is away: it stays, and says so", async () => {
    const r = await route([{ roleCode: A, act: "MA" }]);
    const out = await sweep();
    expect(stayedWords(out, r.label)).toMatch(/mandatory/i);
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBeNull();
  });

  it("never moves a committee's step: a body does not revert upward as a person does", async () => {
    const r = await route([{ roleCode: A, act: "A", committeeCode: "SOME_COMMITTEE" }]);
    const out = await sweep();
    expect(movedWords(out, r.label)).toBeUndefined();
    expect(stayedWords(out, r.label)).toBeUndefined();
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBeNull();
  });

  it("does not move a step onto an office already on the route: one office's holder would decide two steps", async () => {
    const r = await route([{ roleCode: A, act: "A" }, { roleCode: B, act: "R" }]);
    const out = await sweep();
    expect(stayedWords(out, r.label)).toBeTruthy();
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBeNull();
  });

  it("moves nothing back when the holder returns", async () => {
    const r = await route([{ roleCode: A, act: "A" }]);
    await sweep();
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBe(B);
    await db.person.update({ where: { id: holder }, data: { isAvailable: true } });
    await sweep();
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBe(B);
    await db.person.update({ where: { id: holder }, data: { isAvailable: false } });
    // Unused line id kept for the file's tail: the line stays in force for the other tests.
    expect(lineId).not.toBe("");
  });

  it("does not move a step when a holder's own line is not recorded, even though others' lines are", async () => {
    // A second holder of office A with no line: who is above everyone who holds the office cannot be said.
    const second = (await makePerson(organisationId, `Second ${run}`)).id;
    const assignment = await db.roleAssignment.create({ data: { personId: second, roleCode: A, effectiveFrom: day("2020-01-01") } });
    await db.person.update({ where: { id: second }, data: { isAvailable: false } });
    const r = await route([{ roleCode: A, act: "A" }]);
    const out = await sweep();
    expect(stayedWords(out, r.label)).toContain(`Reporting line not set for Second ${run}`);
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBeNull();
    await db.roleAssignment.update({ where: { id: assignment.id }, data: { effectiveTo: day("2021-01-01") } });
  });
});

describe("marking a person away on the People screen (savePerson)", () => {
  it("moves the pending step of the office they alone hold, writes the outcome beside the absence, and tells the superior; marking them back moves nothing back", async () => {
    const { savePerson } = await import("@/app/configuration/users/core");
    const A2 = `RA2_${run}`;
    const B2 = `RB2_${run}`;
    await db.authorityRole.createMany({
      data: [
        { organisationId, code: A2, nameEn: `Office A2 ${run}`, nameMs: `Pejabat A2 ${run}`, escalatesToCode: B2 },
        { organisationId, code: B2, nameEn: `Office B2 ${run}`, nameMs: `Pejabat B2 ${run}` },
      ],
    });
    const solo = (await makePerson(organisationId, `Solo ${run}`)).id;
    const above = (await makePerson(organisationId, `Above ${run}`)).id;
    await db.roleAssignment.createMany({
      data: [
        { personId: solo, roleCode: A2, effectiveFrom: day("2020-01-01") },
        { personId: above, roleCode: B2, effectiveFrom: day("2020-01-01") },
      ],
    });
    await db.reportingLine.create({ data: { organisationId, personId: solo, superiorPersonId: above, effectiveFrom: day("2020-01-01"), provenance: "ASSUMED" } });
    const r = await route([{ roleCode: A2, act: "A" }]);
    const form = (away: boolean) => {
      const f = new FormData();
      f.set("id", solo);
      f.set("name", `Solo ${run}`);
      f.set("email", `solo.${run}@example.invalid`);
      if (away) f.set("isAway", "on");
      return f;
    };
    // Saved while in: nothing is moved (the holder can act).
    expect(await savePerson({ ok: false }, form(false))).toEqual({ ok: true });
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBeNull();
    // Marked away: the step moves up, the superior (who also holds the target office) is told of the absence, and the trail says what became of the step.
    expect(await savePerson({ ok: false }, form(true))).toEqual({ ok: true });
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBe(B2);
    const told = await db.staffNotice.findMany({ where: { recipientPersonId: above, kind: "HOLDER_MARKED_ABSENT", subjectId: solo } });
    expect(told).toHaveLength(1);
    expect(told[0]!.body).toContain("1 pending step moved up");
    const trail = await db.auditEntry.findMany({ where: { entity: "Person", entityId: solo }, orderBy: { at: "asc" } });
    expect(trail.map((t) => t.reason ?? "").some((x) => x.startsWith("Marked away."))).toBe(true);
    // Back in: nothing moves back.
    expect(await savePerson({ ok: false }, form(false))).toEqual({ ok: true });
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBe(B2);
    // Saved again while away (an edit that changes nothing about the absence) runs no second sweep and writes no second notice.
    await savePerson({ ok: false }, form(true));
    await savePerson({ ok: false }, form(true));
    expect((await stepOf(r.steps[0]!)).escalationCount).toBe(1);
    expect((await db.staffNotice.findMany({ where: { recipientPersonId: above, kind: "HOLDER_MARKED_ABSENT", subjectId: solo } })).length).toBeLessThanOrEqual(2);
  });
});

describe("marking a person away needs the permission to draft configuration (ruling on log line 1770; Phase 5b)", () => {
  it("is refused at the proposal to an officer who does not hold it, in words, and changes nothing; the applied edit itself no longer judges the permission", async () => {
    // Since Phase 5b the gate is the proposal's: a save of a person is proposed by a holder of `configuration.draft` (stageEdit) and applied by a second person, so the editor in core.ts is
    // not asked again. The refusal that used to be tested on the editor is tested on the proposal, and the editor is shown to leave the permission to it.
    const { savePerson: propose } = await import("@/app/configuration/users/actions");
    const { savePerson } = await import("@/app/configuration/users/core");
    const target = (await makePerson(organisationId, `Gated ${run}`)).id;
    const form = (isAway: boolean) => {
      const f = new FormData();
      f.set("id", target);
      f.set("name", `Gated ${run}`);
      f.set("email", `gated.${run}@example.invalid`);
      if (isAway) f.set("isAway", "on");
      return f;
    };
    const saved = who.actor;
    who.actor = { ...saved!, permissions: new Set() };
    try {
      const refused = await propose({ ok: false }, form(true));
      expect(refused.ok).toBe(false);
      expect(refused.message).toMatch(/Not permitted/);
      expect((await db.person.findUniqueOrThrow({ where: { id: target } })).isAvailable).toBe(true);
      expect(await db.auditEntry.count({ where: { entity: "Person", entityId: target } })).toBe(0);
    } finally {
      who.actor = saved;
    }
    // Applied by the machinery the editor saves, and once away they are marked available again by the same editor.
    expect(await savePerson({ ok: false }, form(true))).toEqual({ ok: true });
    expect(await savePerson({ ok: false }, form(false))).toEqual({ ok: true });
    expect((await db.person.findUniqueOrThrow({ where: { id: target } })).isAvailable).toBe(true);
  });
});

describe("the automatic move waits for a superior who holds the office above (ruling on log line 1769)", () => {
  it("leaves the step where it is, and says why, when the line's superior does not hold the office it would move to; an officer's own escalation still goes", async () => {
    const A5 = `RA5_${run}`;
    const B5 = `RB5_${run}`;
    await db.authorityRole.createMany({
      data: [
        { organisationId, code: A5, nameEn: `Office A5 ${run}`, nameMs: `Pejabat A5 ${run}`, escalatesToCode: B5 },
        { organisationId, code: B5, nameEn: `Office B5 ${run}`, nameMs: `Pejabat B5 ${run}` },
      ],
    });
    const away = (await makePerson(organisationId, `Away5 ${run}`)).id;
    const named = (await makePerson(organisationId, `Named superior ${run}`)).id;
    const keeper = (await makePerson(organisationId, `Keeper of B5 ${run}`)).id;
    // The line names `named` as above the holder, but `named` does not hold the office the step would move to: `keeper` does.
    await db.roleAssignment.createMany({
      data: [
        { personId: away, roleCode: A5, effectiveFrom: day("2020-01-01") },
        { personId: keeper, roleCode: B5, effectiveFrom: day("2020-01-01") },
      ],
    });
    await db.person.update({ where: { id: away }, data: { isAvailable: false } });
    await db.reportingLine.create({ data: { organisationId, personId: away, superiorPersonId: named, effectiveFrom: day("2020-01-01"), provenance: "ASSUMED" } });
    const r = await route([{ roleCode: A5, act: "A" }]);
    const out = await sweep();
    expect(movedWords(out, r.label)).toBeUndefined();
    expect(stayedWords(out, r.label)).toContain(`Named superior ${run} is named as above the people who hold this office, but does not hold Office B5 ${run}`);
    const step = await stepOf(r.steps[0]!);
    expect(step.actingRoleCode).toBeNull();
    expect(step.escalationCount).toBe(0);
    expect(await db.auditEntry.count({ where: { entity: "ApprovalStep", entityId: r.steps[0] } })).toBe(0);
    expect(await db.staffNotice.count({ where: { subjectId: r.steps[0] } })).toBe(0);

    // An officer's explicit escalation, with a reason, does not wait for a line: it goes to the configured office.
    const { escalateStep } = await import("@/app/approvals/actions");
    const f = new FormData();
    f.set("stepId", r.steps[0]!);
    f.set("kind", "NO_AVAILABLE_HOLDER");
    f.set("reason", "The head of the office is away on leave and nobody else can decide this.");
    expect(await escalateStep({ ok: false }, f)).toMatchObject({ ok: true });
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBe(B5);

    // Once the superior the line names holds that office, the sweep moves the next one.
    await db.roleAssignment.create({ data: { personId: named, roleCode: B5, effectiveFrom: day("2020-01-01") } });
    const r2 = await route([{ roleCode: A5, act: "A" }]);
    const out2 = await sweep();
    expect(movedWords(out2, r2.label)).toBe(`Moved: ${r2.label} from Office ${A5} to Office B5 ${run}.`);
    expect((await stepOf(r2.steps[0]!)).actingRoleCode).toBe(B5);
  });
});

describe("who may move steps, and whose (Phase 3c review)", () => {
  const asAdministrator = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const saved = who.actor;
    who.actor = { ...saved!, isAdministrator: true };
    try {
      return await fn();
    } finally {
      who.actor = saved;
    }
  };

  it("refuses an administrator account the sweep, as it refuses them the escalation: the step stays and nothing is written", async () => {
    await db.person.update({ where: { id: holder }, data: { isAvailable: false } });
    const r = await route([{ roleCode: A, act: "A" }]);
    const out = await asAdministrator(() => sweep());
    expect(out.refused).toMatch(/administrator/i);
    expect(out).toMatchObject({ words: [], moved: 0, stayed: 0 });
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBeNull();
    expect(await db.auditEntry.count({ where: { entity: "ApprovalStep", entityId: r.steps[0] } })).toBe(0);
    // The same step is moved by an officer who is not an administrator.
    expect(movedWords(await sweep(), r.label)).toBeTruthy();
    expect((await stepOf(r.steps[0]!)).actingRoleCode).toBe(B);
  });

  it("marking a person away looks only at that person's steps, and an administrator doing it leaves them for an officer and says so in the trail and to the superior", async () => {
    const { savePerson } = await import("@/app/configuration/users/core");
    const A3 = `RA3_${run}`;
    const B3 = `RB3_${run}`;
    await db.authorityRole.createMany({
      data: [
        { organisationId, code: A3, nameEn: `Office A3 ${run}`, nameMs: `Pejabat A3 ${run}`, escalatesToCode: B3 },
        { organisationId, code: B3, nameEn: `Office B3 ${run}`, nameMs: `Pejabat B3 ${run}` },
      ],
    });
    const away = (await makePerson(organisationId, `Away ${run}`)).id;
    const upper = (await makePerson(organisationId, `Upper ${run}`)).id;
    await db.roleAssignment.createMany({
      data: [
        { personId: away, roleCode: A3, effectiveFrom: day("2020-01-01") },
        { personId: upper, roleCode: B3, effectiveFrom: day("2020-01-01") },
      ],
    });
    await db.reportingLine.create({ data: { organisationId, personId: away, superiorPersonId: upper, effectiveFrom: day("2020-01-01"), provenance: "ASSUMED" } });
    // Another person's step is already stuck (the holder of office A is away and has a line): marking Away away must not move it.
    const others = await route([{ roleCode: A, act: "A" }]);
    const theirs = await route([{ roleCode: A3, act: "A" }]);
    const form = (isAway: boolean) => {
      const f = new FormData();
      f.set("id", away);
      f.set("name", `Away ${run}`);
      f.set("email", `away.${run}@example.invalid`);
      if (isAway) f.set("isAway", "on");
      return f;
    };
    // An administrator marks them away: the absence is saved, the steps stay, and the trail and the superior say they were not moved.
    expect(await asAdministrator(() => savePerson({ ok: false }, form(true)))).toEqual({ ok: true });
    expect((await db.person.findUniqueOrThrow({ where: { id: away } })).isAvailable).toBe(false);
    expect((await stepOf(theirs.steps[0]!)).actingRoleCode).toBeNull();
    const trail = await db.auditEntry.findMany({ where: { entity: "Person", entityId: away } });
    expect(trail.map((t) => t.reason ?? "").some((x) => /^Marked away\. Their pending steps were not moved/.test(x))).toBe(true);
    const told = await db.staffNotice.findMany({ where: { recipientPersonId: upper, kind: "HOLDER_MARKED_ABSENT", subjectId: away } });
    expect(told).toHaveLength(1);
    expect(told[0]!.body).toContain("were not moved");
    expect(told[0]!.body).not.toContain("No pending step was waiting");

    // Back in, then away again by an officer: only their step moves; the other stuck step is left for the worklist button.
    await savePerson({ ok: false }, form(false));
    expect(await savePerson({ ok: false }, form(true))).toEqual({ ok: true });
    expect((await stepOf(theirs.steps[0]!)).actingRoleCode).toBe(B3);
    expect((await stepOf(others.steps[0]!)).actingRoleCode).toBeNull();
    expect(await db.auditEntry.count({ where: { entity: "ApprovalStep", entityId: others.steps[0] } })).toBe(0);
  });
});
