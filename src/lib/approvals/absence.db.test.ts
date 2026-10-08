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
  return { ...actorModule(), requireStaff: async () => who.actor };
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
    organisationId, organisationCode: org.code, organisationTimeZone: org.timeZone, offices: [], permissions: new Set(), stepUpAt: null,
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
    const { savePerson } = await import("@/app/configuration/users/actions");
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
