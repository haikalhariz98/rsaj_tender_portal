import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * FR-APR-017 against a real database (Phase 3c): the originator recalls a route before any decision, on the requisition's route, the name's and the award's.
 * Anyone else is refused, a decision recorded refuses it, a committee's agenda refuses it, a route sent before the sender was recorded refuses it and says
 * so, and the people the waiting step was waiting on are told once.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => who.actor };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined, notFound: () => undefined }));

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const OPENED = new Date("2026-10-03T02:00:00Z");
const run = randomId();
const ROLE = `RC_${run}`;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let requester = "";
let sender = "";
let holder = "";
let stranger = "";
let base: StaffActor;
const as = async <T,>(personId: string, fn: () => Promise<T>): Promise<T> => {
  const saved = who.actor;
  who.actor = { ...saved!, personId, personName: `Person ${personId.slice(-4)}` };
  try {
    return await fn();
  } finally {
    who.actor = saved;
  }
};

async function requisition(status: "PENDING_APPROVAL" | "DRAFT" = "PENDING_APPROVAL") {
  const id = `rc_req_${randomId()}`;
  await db.requisition.create({
    data: {
      id, organisationId, reference: `RC/REQ/${randomId()}`, requestingUnitCode: `RC_UNIT_${run}`, requestingPersonId: requester, title: "A requisition for the recall tests", status,
      justification: "For the recall suite.", needStatement: "None.", costCentreCode: "RC_CC", accountCode: "RC_AC", placeOfDelivery: "Nowhere",
      dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
    },
  });
  return id;
}

async function route(over: { requisitionId?: string; exerciseId?: string; awardId?: string; domain: string; submittedBy?: string | null; decided?: boolean }) {
  const id = `rc_route_${randomId()}`;
  await db.approvalInstance.create({
    data: { id, organisationId, matterKind: over.exerciseId ? "EXERCISE" : "REQUISITION", domain: over.domain, requisitionId: over.requisitionId ?? null, exerciseId: over.exerciseId ?? null, awardId: over.awardId ?? null, openedAt: OPENED, submittedByPersonId: over.submittedBy ?? null },
  });
  const first = `rc_step_${randomId()}`;
  await db.approvalStep.create({ data: { id: first, instanceId: id, sequence: 1, roleCode: ROLE, roleLabel: "The office", act: "A", ...(over.decided ? { decision: "DONE", decidedOn: OPENED, decidedByPersonId: holder } : {}) } });
  if (over.decided) await db.approvalStep.create({ data: { id: `rc_step_${randomId()}`, instanceId: id, sequence: 2, roleCode: ROLE, roleLabel: "The office", act: "A" } });
  return { id, step: first };
}

beforeAll(async () => {
  const org = await db.organisation.upsert({ where: { code: "P3C_RECALL_TEST" }, update: {}, create: { code: "P3C_RECALL_TEST", name: "Recall test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  requester = (await makePerson(organisationId, `Requester ${run}`)).id;
  sender = (await makePerson(organisationId, `Sender ${run}`)).id;
  holder = (await makePerson(organisationId, `Holder ${run}`)).id;
  stranger = (await makePerson(organisationId, `Stranger ${run}`)).id;
  base = {
    kind: "STAFF", accountId: "", sessionId: "", personId: requester, personName: `Requester ${run}`, jobTitle: null, isAdministrator: false,
    organisationId, organisationCode: org.code, organisationTimeZone: org.timeZone, offices: [], permissions: new Set(), stepUpAt: null,
    sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false,
  };
  who.actor = base;
  await db.authorityRole.create({ data: { organisationId, code: ROLE, nameEn: `Office ${run}`, nameMs: `Pejabat ${run}` } });
  await db.roleAssignment.create({ data: { personId: holder, roleCode: ROLE, effectiveFrom: day("2020-01-01") } });
});

describe("recalling a requisition's route", () => {
  it("is refused to anyone but the officer who raised it, and nothing changes", async () => {
    const { recallRequisition } = await import("@/app/requisitions/actions");
    const id = await requisition();
    const r = await route({ requisitionId: id, domain: "requisition" });
    const out = await as(stranger, () => recallRequisition({ ok: false }, form({ id, reason: "I do not like it" })));
    expect(out).toMatchObject({ ok: false, message: expect.stringMatching(/Only the person who sent this approval, or raised the request/) });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("PENDING");
    expect((await db.requisition.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING_APPROVAL");
  });

  it("lets the officer who raised it recall, records it with the reason, and tells the holder of the waiting step once", async () => {
    const { recallRequisition } = await import("@/app/requisitions/actions");
    const id = await requisition();
    const r = await route({ requisitionId: id, domain: "requisition" });
    expect(await recallRequisition({ ok: false }, form({ id, reason: "Sent too early" }))).toEqual({ ok: true });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("RECALLED");
    expect((await db.requisition.findUniqueOrThrow({ where: { id } })).status).toBe("RECALLED");
    const audit = await db.auditEntry.findMany({ where: { entity: "ApprovalInstance", entityId: r.id } });
    expect(audit.map((a) => a.reason)).toContain("Sent too early");
    expect(audit[0]!.actorPersonId).toBe(requester);
    const told = await db.staffNotice.findMany({ where: { recipientPersonId: holder, subjectEntity: "ApprovalInstance", subjectId: r.id } });
    expect(told).toHaveLength(1);
    expect(told[0]!.kind).toBe("ROUTE_RECALLED");
    expect(told[0]!.body).toContain("Sent too early");
    // A second recall finds nothing open.
    expect(await recallRequisition({ ok: false }, form({ id, reason: "Again" }))).toMatchObject({ ok: false });
    expect(await db.staffNotice.count({ where: { recipientPersonId: holder, subjectId: r.id } })).toBe(1);
  });

  it("is refused once a decision is recorded: recall after a decision is refused", async () => {
    const { recallRequisition } = await import("@/app/requisitions/actions");
    const id = await requisition();
    const r = await route({ requisitionId: id, domain: "requisition", decided: true });
    const out = await recallRequisition({ ok: false }, form({ id, reason: "Too late" }));
    expect(out).toMatchObject({ ok: false, message: expect.stringMatching(/decision has already been recorded/) });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("PENDING");
  });

  it("is refused while the matter is on a committee's agenda awaiting its vote, and asks a reason", async () => {
    const { recallRequisition } = await import("@/app/requisitions/actions");
    const id = await requisition();
    await route({ requisitionId: id, domain: "requisition" });
    const committee = await db.committee.create({ data: { organisationId, code: `RC_${randomId()}`, nameEn: "Recall committee", mandate: "Tests.", governingSource: "None." } });
    const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: `RC/${randomId()}`, meetingDate: day("2026-10-20") } });
    await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "requisition", subject: "On the agenda", matterKind: "REQUISITION", requisitionId: id } });
    expect(await recallRequisition({ ok: false }, form({ id, reason: "Pull it" }))).toMatchObject({ ok: false, message: expect.stringMatching(/committee's agenda/) });
    expect(await recallRequisition({ ok: false }, form({ id, reason: "" }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
  });
});

async function exercise(requisitionId: string) {
  const id = `rc_ex_${randomId()}`;
  await db.sourcingExercise.create({ data: { id, organisationId, reference: `RC/EX/${randomId()}`, requisitionId, title: "An exercise for the recall tests", estimatedValue: "1000.00", sourcingMethodCode: "RC_METHOD" } });
  return id;
}

describe("a requisition sent by a clerk for a requester without an account (Phase 3c review)", () => {
  it("is recalled by the clerk who sent it, and by nobody else", async () => {
    const { recallRequisition } = await import("@/app/requisitions/actions");
    const id = await requisition();
    const r = await route({ requisitionId: id, domain: "requisition", submittedBy: sender });
    expect(await as(stranger, () => recallRequisition({ ok: false }, form({ id, reason: "Not mine" })))).toMatchObject({ ok: false, message: expect.stringMatching(/Only the person who sent this approval/) });
    expect(await as(sender, () => recallRequisition({ ok: false }, form({ id, reason: "I keyed it too early" })))).toEqual({ ok: true });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("RECALLED");
  });
});

describe("a committee's answer cannot be recalled away (Phase 3c review)", () => {
  async function decided(over: { exerciseId?: string; requisitionId?: string; domain: string; outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED"; tabledAt: Date; withdrawn?: boolean }) {
    const committee = await db.committee.create({ data: { organisationId, code: `RD_${randomId()}`, nameEn: "Decided committee", mandate: "Tests.", governingSource: "None." } });
    const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: `RD/${randomId()}`, meetingDate: day("2026-10-20") } });
    await db.committeeDecision.create({
      data: {
        meetingId: meeting.id, domain: over.domain, subject: "A decided matter", matterKind: over.exerciseId ? "EXERCISE" : "REQUISITION", exerciseId: over.exerciseId ?? null, requisitionId: over.requisitionId ?? null,
        outcome: over.outcome, decisionDate: day("2026-10-20"), tabledAt: over.tabledAt, ...(over.outcome === "NOT_CARRIED" ? { outcomeNote: "No." } : {}), ...(over.withdrawn ? { withdrawnAt: new Date(), withdrawnReason: "Withdrawn." } : {}),
      },
    });
  }
  const ago = () => new Date(Date.now() - 3 * 86_400_000);
  const soon = () => new Date(Date.now() + 60_000);

  it("refuses the name's recall after a NOT_CARRIED vote while an earlier step is still pending, and the route stays open", async () => {
    const { recallNameApproval } = await import("@/app/sourcing/actions");
    const reqId = await requisition("DRAFT");
    const ex = await exercise(reqId);
    const sent = await route({ requisitionId: reqId, exerciseId: ex, domain: "name_approval", submittedBy: sender });
    await decided({ exerciseId: ex, domain: "name_approval", outcome: "NOT_CARRIED", tabledAt: soon() });
    expect(await as(sender, () => recallNameApproval({ ok: false }, form({ id: ex, reason: "Round it again" })))).toMatchObject({ ok: false, message: expect.stringMatching(/committee has already decided/) });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("PENDING");
  });

  it("refuses the requisition's and the award's recall the same way", async () => {
    const { recallRequisition } = await import("@/app/requisitions/actions");
    const reqA = await requisition();
    await route({ requisitionId: reqA, domain: "requisition" });
    await decided({ requisitionId: reqA, domain: "requisition", outcome: "CARRIED", tabledAt: soon() });
    expect(await recallRequisition({ ok: false }, form({ id: reqA, reason: "Too late" }))).toMatchObject({ ok: false, message: expect.stringMatching(/committee has already decided/) });

    const { recallAward } = await import("@/app/awards/actions");
    const reqB = await requisition("DRAFT");
    const ex = await exercise(reqB);
    const awardId = `rd_aw_${randomId()}`;
    await db.award.create({ data: { id: awardId, organisationId, reference: `RD/AW/${randomId()}`, exerciseId: ex, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "PENDING_APPROVAL" } });
    const sent = await route({ requisitionId: reqB, exerciseId: ex, awardId, domain: "appointment", submittedBy: sender });
    await decided({ exerciseId: ex, domain: "appointment", outcome: "NOT_CARRIED", tabledAt: soon() });
    expect(await as(sender, () => recallAward({ ok: false }, form({ id: awardId, reason: "Terms are wrong" })))).toMatchObject({ ok: false, message: expect.stringMatching(/committee has already decided/) });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("PENDING");
    expect((await db.award.findUniqueOrThrow({ where: { id: awardId } })).status).toBe("PENDING_APPROVAL");
  });

  it("does not count a decision from an earlier round, a deferral or a withdrawn matter", async () => {
    const { recallNameApproval } = await import("@/app/sourcing/actions");
    const reqId = await requisition("DRAFT");
    const ex = await exercise(reqId);
    const sent = await route({ requisitionId: reqId, exerciseId: ex, domain: "name_approval", submittedBy: sender });
    await decided({ exerciseId: ex, domain: "name_approval", outcome: "NOT_CARRIED", tabledAt: ago() });
    await decided({ exerciseId: ex, domain: "name_approval", outcome: "DEFERRED", tabledAt: soon() });
    await decided({ exerciseId: ex, domain: "name_approval", outcome: "CARRIED", tabledAt: soon(), withdrawn: true });
    expect(await as(sender, () => recallNameApproval({ ok: false }, form({ id: ex, reason: "Wrong list" })))).toEqual({ ok: true });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("RECALLED");
  });
});

describe("recalling the name's route", () => {
  it("is refused to anyone but whoever sent it, on a route sent before the sender was recorded, and after a decision", async () => {
    const { recallNameApproval } = await import("@/app/sourcing/actions");
    const reqId = await requisition("DRAFT");
    const ex = await exercise(reqId);
    const sent = await route({ requisitionId: reqId, exerciseId: ex, domain: "name_approval", submittedBy: sender });
    // Not the sender (not even the officer who raised the requisition).
    expect(await recallNameApproval({ ok: false }, form({ id: ex, reason: "No" }))).toMatchObject({ ok: false, message: expect.stringMatching(/Only the person who sent this approval/) });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("PENDING");
    // The sender recalls.
    const out = await as(sender, () => recallNameApproval({ ok: false }, form({ id: ex, reason: "Wrong list" })));
    expect(out).toEqual({ ok: true });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("RECALLED");
    expect(await db.staffNotice.count({ where: { recipientPersonId: holder, subjectId: sent.id, kind: "ROUTE_RECALLED" } })).toBe(1);

    // A route sent before the sender was recorded has no originator: nobody is shown to be one.
    const reqOld = await requisition("DRAFT");
    const exOld = await exercise(reqOld);
    const old = await route({ requisitionId: reqOld, exerciseId: exOld, domain: "name_approval", submittedBy: null });
    expect(await as(sender, () => recallNameApproval({ ok: false }, form({ id: exOld, reason: "Why not" })))).toMatchObject({ ok: false, message: expect.stringMatching(/Nobody is recorded as having sent/) });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("PENDING");

    // A decision has been recorded.
    const reqDone = await requisition("DRAFT");
    const exDone = await exercise(reqDone);
    const done = await route({ requisitionId: reqDone, exerciseId: exDone, domain: "name_approval", submittedBy: sender, decided: true });
    expect(await as(sender, () => recallNameApproval({ ok: false }, form({ id: exDone, reason: "Late" })))).toMatchObject({ ok: false, message: expect.stringMatching(/decision has already been recorded/) });
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: done.id } })).status).toBe("PENDING");
  });
});

describe("recalling the award's route", () => {
  it("returns the award to draft for its sender, and is refused to anyone else", async () => {
    const { recallAward } = await import("@/app/awards/actions");
    const reqId = await requisition("DRAFT");
    const ex = await exercise(reqId);
    const awardId = `rc_aw_${randomId()}`;
    await db.award.create({ data: { id: awardId, organisationId, reference: `RC/AW/${randomId()}`, exerciseId: ex, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "1000.00", completionPeriod: 30, completionUnit: "DAYS", status: "PENDING_APPROVAL" } });
    const sent = await route({ requisitionId: reqId, exerciseId: ex, awardId, domain: "appointment", submittedBy: sender });
    expect(await as(stranger, () => recallAward({ ok: false }, form({ id: awardId, reason: "Not mine" })))).toMatchObject({ ok: false, message: expect.stringMatching(/Only the person who sent this approval/) });
    expect((await db.award.findUniqueOrThrow({ where: { id: awardId } })).status).toBe("PENDING_APPROVAL");
    expect(await as(sender, () => recallAward({ ok: false }, form({ id: awardId, reason: "Terms are wrong" })))).toEqual({ ok: true });
    expect((await db.award.findUniqueOrThrow({ where: { id: awardId } })).status).toBe("DRAFT");
    expect((await db.approvalInstance.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("RECALLED");
    expect(await db.staffNotice.count({ where: { recipientPersonId: holder, subjectId: sent.id } })).toBe(1);
    // Nothing open remains to recall.
    expect(await as(sender, () => recallAward({ ok: false }, form({ id: awardId, reason: "Again" })))).toMatchObject({ ok: false });
  });
});
