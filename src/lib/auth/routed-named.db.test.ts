import { beforeAll, describe, expect, it } from "vitest";

import { sulitGates } from "@/app/_auth/sulit";
import type { PermissionKey, StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { exerciseAccessFacts, hiddenExerciseIds, type Reader } from "@/lib/auth/sulit-store";
import { exerciseVisible } from "@/lib/auth/sulit-access";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Who a restricted exercise names by what its routes and sittings say (product owner, 2026-10-08, ruling on log line 1711), against the scratch database: whoever is able to
 * decide the step that is pending, whoever decided one, and the roster of the committee a matter is tabled to. Worked out when read, never copied into a list: the same
 * exercise names a holder while the step is pending and a decider after.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const run = randomId();
const OFFICE = `RN_OFFICE_${run}`;
const SEAT_OFFICE = `RN_SEAT_${run}`;
const UNIT = `RN_UNIT_${run}`;

let organisationId = "";
let exerciseId = "";
let routeId = "";
let pendingStepId = "";
const p = { holder: "", delegate: "", cappedDelegate: "", decider: "", member: "", exOfficio: "", outsider: "", left: "", participant: "" };

const reader = (personId: string): Reader => ({ organisationId, organisationCode: `RN_${run}`, personId, isAdministrator: false, sessionId: "s", sourceAddress: null });
const named = async () => (await exerciseAccessFacts(db, organisationId, [exerciseId])).get(exerciseId)!.named;

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `RN_${run}`, name: "Routed named test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Routed ${k} ${run}`)).id;
  await db.person.update({ where: { id: p.left }, data: { isActive: false } });
  await db.orgUnit.create({ data: { organisationId, code: UNIT, nameEn: UNIT, kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") } });
  await db.authorityRole.createMany({
    data: [
      { organisationId, code: OFFICE, nameEn: `Office ${run}`, nameMs: `Pejabat ${run}` },
      { organisationId, code: SEAT_OFFICE, nameEn: `Seat office ${run}`, nameMs: `Pejabat kerusi ${run}` },
    ],
  });
  await db.roleAssignment.createMany({
    data: [
      { personId: p.holder, roleCode: OFFICE, effectiveFrom: day("2020-01-01") },
      { personId: p.left, roleCode: OFFICE, effectiveFrom: day("2020-01-01") },
      { personId: p.exOfficio, roleCode: SEAT_OFFICE, effectiveFrom: day("2020-01-01") },
    ],
  });
  // A delegate of the whole office whose ceiling reaches the route's value, and one capped below it.
  for (const [to, ceiling] of [[p.delegate, "50000.00"], [p.cappedDelegate, "500.00"]] as const) {
    await db.delegation.create({ data: { organisationId, fromPersonId: p.holder, toPersonId: to, roleCode: OFFICE, capabilityCodes: [], valueCeiling: ceiling, reason: "Cover", reasonMs: "Liputan", noSubDelegation: true, effectiveFrom: day("2020-01-01") } });
  }
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `RN/REQ/${run}`, requestingUnitCode: UNIT, requestingPersonId: p.participant, title: "A requisition for the routed names", justification: "Tests.", needStatement: "None.",
      costCentreCode: "RN_CC", accountCode: "RN_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "10000.00", raisedOn: day("2026-10-01"),
    },
  });
  exerciseId = (await db.sourcingExercise.create({ data: { organisationId, reference: `RN/EX/${run}`, requisitionId: requisition.id, title: "A restricted exercise", estimatedValue: "10000.00", sourcingMethodCode: "RN_METHOD", restricted: true } })).id;
  await db.exerciseParticipant.create({ data: { exerciseId, personId: p.participant } });
  routeId = (await db.approvalInstance.create({ data: { organisationId, matterKind: "EXERCISE", domain: "name_approval", exerciseId, value: "10000.00", openedAt: new Date("2026-10-03T02:00:00Z") } })).id;
  await db.approvalStep.create({ data: { instanceId: routeId, sequence: 1, roleCode: OFFICE, roleLabel: "First", act: "A", decision: "DONE", decidedByPersonId: p.decider, decidedOn: day("2026-10-04") } });
  pendingStepId = (await db.approvalStep.create({ data: { instanceId: routeId, sequence: 2, roleCode: OFFICE, roleLabel: "Second", act: "A" } })).id;
  // A committee with a seat by appointment and a seat ex officio; a matter of the exercise is tabled to it for a sitting on 2026-10-05.
  const committee = await db.committee.create({ data: { organisationId, code: `RN_C_${run}`, nameEn: "Routed names committee", mandate: "Tests.", governingSource: "None." } });
  await db.committeeMember.createMany({
    data: [
      { committeeId: committee.id, personId: p.member, position: "MEMBER", effectiveFrom: day("2020-01-01") },
      { committeeId: committee.id, seatRoleCode: SEAT_OFFICE, position: "CHAIRMAN", effectiveFrom: day("2020-01-01") },
    ],
  });
  const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: `RN/MT/${run}`, meetingDate: day("2026-10-05") } });
  await db.committeeDecision.create({ data: { meetingId: meeting.id, domain: "name_approval", subject: "A matter of the exercise", exerciseId } });
});

describe("a restricted exercise names what its routes and sittings say", () => {
  it("names the holder of the pending step and a delegate the decision rule would not refuse, not a capped delegate or someone who has left", async () => {
    const n = await named();
    expect([...n.stepHolderIds].sort()).toEqual([p.holder, p.delegate].sort());
    expect(n.stepHolderIds).not.toContain(p.cappedDelegate);
    expect(n.stepHolderIds).not.toContain(p.left);
  });

  it("names whoever decided a step", async () => {
    expect((await named()).stepDeciderIds).toEqual([p.decider]);
  });

  it("names the roster of the committee a matter is tabled to: the appointed member and whoever holds the seat's office", async () => {
    expect([...(await named()).committeeMemberIds].sort()).toEqual([p.member, p.exOfficio].sort());
  });

  it("opens the exercise to each of them and still hides it from a stranger", async () => {
    for (const id of [p.holder, p.delegate, p.decider, p.member, p.exOfficio, p.participant]) expect(await hiddenExerciseIds(db, reader(id)), id).not.toContain(exerciseId);
    for (const id of [p.outsider, p.cappedDelegate, p.left]) expect(await hiddenExerciseIds(db, reader(id)), id).toContain(exerciseId);
    const n = await named();
    expect(exerciseVisible({ personId: p.holder, isAdministrator: false, system: false }, true, n)).toBe(true);
    // An administrator account is never named in, whatever the routes say (ADR 0034 D9).
    expect(exerciseVisible({ personId: p.holder, isAdministrator: true, system: false }, true, n)).toBe(false);
  });

  it("is worked out when read: once the pending step is decided the holder is named as its decider, a holder of nothing", async () => {
    await db.approvalStep.update({ where: { id: pendingStepId }, data: { decision: "DONE", decidedByPersonId: p.holder, decidedOn: day("2026-10-06") } });
    await db.approvalInstance.update({ where: { id: routeId }, data: { status: "APPROVED" } });
    const n = await named();
    expect(n.stepHolderIds).toEqual([]);
    expect([...n.stepDeciderIds].sort()).toEqual([p.decider, p.holder].sort());
    // The delegate held the step only while it was pending: they are not named any more.
    expect(await hiddenExerciseIds(db, reader(p.delegate))).toContain(exerciseId);
    expect(await hiddenExerciseIds(db, reader(p.holder))).not.toContain(exerciseId);
  });

  it("reads but does not name: a holder, a decider or a committee member opens the exercise to read, and may not name others on it (naming adds to the stored list, which outlasts a step)", async () => {
    const { namingRefusal } = await import("@/lib/auth/sulit-store");
    const staffOf = (personId: string) => ({ kind: "STAFF" as const, accountId: "a", sessionId: "s", personId, personName: "R", jobTitle: null, isAdministrator: false, organisationId, organisationCode: `RN_${run}`, organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set<never>(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false });
    // The decider and the committee's ex officio member read the exercise (above); the participant is named on its stored list.
    for (const who of [p.decider, p.exOfficio]) expect(await namingRefusal(db, staffOf(who), exerciseId, [p.outsider]), who).toMatch(/only someone already named on it may name others/);
    expect(await namingRefusal(db, staffOf(p.participant), exerciseId, [p.outsider])).toBeNull();
  });

  it("names a committee's roster on the sitting's date, so a seat that ended before it names nobody", async () => {
    await db.committeeMember.updateMany({ where: { personId: p.member }, data: { effectiveTo: day("2026-09-01") } });
    expect((await named()).committeeMemberIds).toEqual([p.exOfficio]);
  });
});

// ------------------------------------------------------------------ a requisition, and one matter of a contract

/**
 * The amendment of the 2026-10-06 ruling (log line 1526): a requisition names its requester and the people who decide its route; for a variation, a certificate or a contract
 * matter the people who decide its route read that matter's amount and NOTHING else of the contract. Against the scratch database, through the gates the screens use.
 */
describe("a requisition names its requester and the people of its route; a contract matter's deciders read its amount only", () => {
  const q = { requester: "", holder: "", decider: "", stranger: "", entitled: "" };
  let requisitionId = "";
  let variationId = "";
  const staff = (personId: string, permissions: PermissionKey[] = []): StaffActor => ({
    kind: "STAFF", accountId: "a", sessionId: "s", personId, personName: "R", jobTitle: null, isAdministrator: false, organisationId, organisationCode: `RN_${run}`, organisationTimeZone: "Asia/Kuala_Lumpur",
    offices: [], permissions: new Set<PermissionKey>(permissions), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false,
  });
  const ask = async (who: string, subject: Parameters<typeof sulitGates>[1][number], fields: string[], permissions: PermissionKey[] = []) => (await sulitGates(staff(who, permissions), [subject], fields)).get(subject.id)!;

  beforeAll(async () => {
    for (const k of Object.keys(q) as (keyof typeof q)[]) q[k] = (await makePerson(organisationId, `Routed req ${k} ${run}`)).id;
    await db.roleAssignment.create({ data: { personId: q.holder, roleCode: OFFICE, effectiveFrom: day("2020-01-01") } });
    const requisition = await db.requisition.create({
      data: {
        organisationId, reference: `RN/RQ/${run}`, requestingUnitCode: UNIT, requestingPersonId: q.requester, title: "A requisition with a route", justification: "Tests.", needStatement: "None.",
        costCentreCode: "RN_CC", accountCode: "RN_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "20000.00", raisedOn: day("2026-10-01"),
      },
    });
    requisitionId = requisition.id;
    const route = await db.approvalInstance.create({ data: { organisationId, matterKind: "REQUISITION", domain: "requisition", requisitionId, value: "20000.00", openedAt: new Date("2026-10-03T02:00:00Z") } });
    await db.approvalStep.create({ data: { instanceId: route.id, sequence: 1, roleCode: SEAT_OFFICE, roleLabel: "First", act: "A", decision: "DONE", decidedByPersonId: q.decider, decidedOn: day("2026-10-04") } });
    await db.approvalStep.create({ data: { instanceId: route.id, sequence: 2, roleCode: OFFICE, roleLabel: "Second", act: "A" } });
    // A variation of a contract, with its own route: the same people hold and decide, and the contract's other figures must stay closed to them.
    const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `RN/EXV/${run}`, requisitionId, title: "Exercise behind the contract", estimatedValue: "20000.00", sourcingMethodCode: "RN_METHOD" } });
    const award = await db.award.create({ data: { organisationId, reference: `RN/AW/${run}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "Contractor", awardedValue: "20000.00", completionPeriod: 30, completionUnit: "DAYS" } });
    const contract = await db.contract.create({ data: { organisationId, number: `RN/CON/${run}`, numberSource: "SERIES", numberedOn: day("2026-10-02"), awardId: award.id, contractSum: "20000.00" } });
    variationId = (await db.variation.create({ data: { organisationId, contractId: contract.id, origin: "DEPARTMENT", originatorPersonId: q.requester, originatorName: "Requester", description: "A change", reason: "Needed", estimate: "5000.00", recordedOn: day("2026-10-02"), recordedAt: new Date("2026-10-02T02:00:00Z") } as never })).id;
    const vroute = await db.approvalInstance.create({ data: { organisationId, matterKind: "VARIATION", domain: "variation", variationId, value: "5000.00", openedAt: new Date("2026-10-03T02:00:00Z"), submittedByPersonId: q.requester } });
    await db.approvalStep.create({ data: { instanceId: vroute.id, sequence: 1, roleCode: OFFICE, roleLabel: "Variation step", act: "A" } });
  });

  const requisitionSubject = () => ({ scope: "requisition" as const, entity: "Requisition", id: requisitionId, label: "RN/RQ" });
  const variationSubject = () => ({ scope: "contract" as const, entity: "Variation", id: variationId, label: "RN/VAR" });

  it("reads a requisition's figure for its requester, the holder of a pending step on its route and whoever decided one; refuses a stranger, who needs the permission", async () => {
    for (const who of [q.requester, q.holder, q.decider]) expect(await ask(who, requisitionSubject(), ["estimatedValue"]), who).toMatchObject({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(await ask(q.stranger, requisitionSubject(), ["estimatedValue"])).toMatchObject({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
    expect(await ask(q.stranger, requisitionSubject(), ["estimatedValue"], ["sulit.read.organisation"])).toMatchObject({ state: "GRANTED", basis: "ORGANISATION_PERMISSION" });
  });

  it("says in words that the requester and the people of the route are the ones named", async () => {
    const r = await ask(q.stranger, requisitionSubject(), ["estimatedValue"]);
    expect(r.state === "WITHHELD" && r.words.en).toMatch(/^You are not the officer it was raised for and you do not decide its route/);
  });

  it("an administrator account is refused whatever the route says", async () => {
    const admin = { ...staff(q.holder), isAdministrator: true };
    expect((await sulitGates(admin, [requisitionSubject()], ["estimatedValue"])).get(requisitionId)).toMatchObject({ state: "WITHHELD", basis: "ADMINISTRATOR" });
  });

  it("lets the holder of a variation's pending step read that variation's amount, and nothing else of the contract", async () => {
    expect(await ask(q.holder, variationSubject(), ["waitingValue"])).toMatchObject({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(await ask(q.holder, variationSubject(), ["matterAmount"])).toMatchObject({ state: "GRANTED" });
    // The contract's priced working, variance, estimate rates and identity-card number stay with the permission, even asked of the variation.
    for (const field of ["estimateRate", "tenderedLineAmount", "arithmeticVarianceAmount", "icNumber", "certificateComputedAmount"]) {
      expect(await ask(q.holder, variationSubject(), [field]), field).toMatchObject({ state: "WITHHELD" });
    }
    // A mixed ask is refused whole: the amount does not carry the other figure through.
    expect(await ask(q.holder, variationSubject(), ["waitingValue", "estimateRate"])).toMatchObject({ state: "WITHHELD" });
    // The contract itself names nobody: its gate is the permission alone.
    const contractGate = await ask(q.holder, { scope: "contract", entity: "Contract", id: "contract_any", label: "RN/CON" }, ["estimateRate"]);
    expect(contractGate).toMatchObject({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
    expect(await ask(q.stranger, variationSubject(), ["waitingValue"])).toMatchObject({ state: "WITHHELD" });
  });
});
