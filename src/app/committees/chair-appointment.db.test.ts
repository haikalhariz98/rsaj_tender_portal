import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Phase 0.3 item 13 (RSAJ Q6; SK003 7.6.2, 7.6.3), against a real database: the chairman's appointee is recorded with the appointing record where the
 * committee allows it, sits in the chair, and the sitting is quorate; where the chairman must sit, nobody can be recorded in the chair and a sitting
 * without him is not quorate.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { loadSitting } from "@/lib/committee/sittings";

import { recordAttendance, recordChairAppointment } from "./actions";

const run = randomId();
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
let organisationId = "";
let code = "";
const p = { chair: "", m1: "", m2: "", ceo: "" };

async function sitting(chairPresence: "CHAIR_REQUIRED" | "CHAIR_OR_APPOINTED") {
  const committee = await db.committee.create({
    data: { organisationId, code: `CH_${chairPresence}_${randomId()}`, nameEn: `Board ${run}`, mandate: "Tests.", governingSource: "Tests.", quorum: 3, quorumProvenance: "STATED", votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "STATED", chairPresence, chairPresenceProvenance: "STATED" },
  });
  const seat = (personId: string, position: "CHAIRMAN" | "MEMBER") => db.committeeMember.create({ data: { committeeId: committee.id, personId, position, effectiveFrom: day("2024-01-01") } });
  await seat(p.chair, "CHAIRMAN");
  await seat(p.m1, "MEMBER");
  await seat(p.m2, "MEMBER");
  const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: `CH/${randomId()}`, meetingDate: day("2026-10-20"), status: "IN_PROGRESS" } });
  return meeting.id;
}
const scope = () => ({ organisationId, organisationCode: code });

beforeAll(async () => {
  code = `CH_${run}`;
  organisationId = (await db.organisation.create({ data: { code, name: `Chair ${run}`, timeZone: "Asia/Kuala_Lumpur" } })).id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Chair ${k} ${run}`)).id;
  h.who = {
    kind: "STAFF", accountId: `acc_${p.m1}`, sessionId: `ses_${p.m1}`, personId: p.m1, personName: "Officer", jobTitle: null, isAdministrator: false, organisationId, organisationCode: code,
    organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.8", mustChangePassword: false,
  } as unknown as StaffActor;
});

describe("the chairman's appointee at a sitting", () => {
  it("is recorded with the appointing record where the committee allows it, sits in the chair, and the sitting is quorate", async () => {
    const meetingId = await sitting("CHAIR_OR_APPOINTED");
    for (const personId of [p.m1, p.m2]) expect(await recordAttendance({ ok: false }, form({ meetingId, personId, attended: "yes" }))).toEqual({ ok: true });
    const before = (await loadSitting(scope(), meetingId))!;
    expect(before.assessment.present.voterIds).toHaveLength(2);

    expect(await recordChairAppointment({ ok: false }, form({ meetingId, personId: p.ceo, chairAppointment: "" }))).toMatchObject({ ok: false, errors: { chairAppointment: expect.any(String) } });
    expect(await recordChairAppointment({ ok: false }, form({ meetingId, personId: p.ceo, chairAppointment: "Chairman's letter TB/7, 18 Oct 2026" }))).toEqual({ ok: true });
    const s = (await loadSitting(scope(), meetingId))!;
    expect(s.meeting.chairAppointment).toBe("Chairman's letter TB/7, 18 Oct 2026");
    expect(s.assessment.present.faults).toEqual([]);
    expect(s.assessment.present.occupants).toContainEqual(expect.objectContaining({ personId: p.ceo, standIn: true }));
    expect(s.assessment.present.voterIds.sort()).toEqual([p.ceo, p.m1, p.m2].sort());
    expect((await db.auditEntry.findFirstOrThrow({ where: { organisationId, entity: "Meeting", entityId: meetingId } })).changes).toEqual([{ field: "chairAppointment", before: "", after: "Chairman's letter TB/7, 18 Oct 2026" }]);

    // The chairman himself arriving is refused while his appointee sits in the chair.
    expect(await recordAttendance({ ok: false }, form({ meetingId, personId: p.chair, attended: "yes" }))).toMatchObject({ ok: false, message: expect.stringMatching(/refused/) });
    // The appointee may be recorded absent, though not a member.
    expect(await recordAttendance({ ok: false }, form({ meetingId, personId: p.ceo, attended: "no" }))).toEqual({ ok: true });
  });

  it("where the chairman must sit, nobody is recorded in the chair, and three members without him are not quorate", async () => {
    const meetingId = await sitting("CHAIR_REQUIRED");
    for (const personId of [p.m1, p.m2]) await recordAttendance({ ok: false }, form({ meetingId, personId, attended: "yes" }));
    expect(await recordChairAppointment({ ok: false }, form({ meetingId, personId: p.ceo, chairAppointment: "Letter" }))).toEqual({ ok: false, message: "This committee does not allow a stand-in for its chairman. Set it on the committee in Settings first." });
    const s = (await loadSitting(scope(), meetingId))!;
    expect(s.meeting.chairAppointment).toBe("");
    const decided = (await import("@/lib/committee/assess-sitting")).assessFromRegister(s.register, { ...s.rules, quorum: 2 }, [{ id: "M", act: "R", tabled: true, outcome: "PENDING", dependencyOutcome: null, recusedIds: [], votes: [] }]);
    expect(decided.matters.M.quorum).toMatchObject({ state: "NOT_MET", chairAbsent: true });
  });
});
