import { beforeAll, describe, expect, it } from "vitest";

import { sulitGates } from "@/app/_auth/sulit";
import { db } from "@/lib/db";
import { sulitWriteRefusal } from "@/lib/auth/sulit-store";
import type { PermissionKey, StaffActor } from "@/lib/auth/types";
import { estimateAccessFor, loggedEstimateAccess } from "@/lib/scope/estimate-access";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * The Secretariat and Internal Audit as readers of the evaluation, and the evaluation's readers of the disclosed company estimate (product owner, 2026-10-08, decisions log lines
 * 1735 and 1736), against the scratch database: the two offices are the organisation's to set and grant nothing while unset; a holder of the office on the day, for the
 * exercise's own department, reads the evaluation scope and the disclosed estimate, logged with the office that let them in; it is reading only, does not open a restricted
 * exercise, and does not reach what the exercise itself carries.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const run = randomId();
const SEC = `EV_SEC_${run}`;
const IA = `EV_IA_${run}`;
const DEPT = `EV_DEPT_${run}`;
const OTHER = `EV_OTHER_${run}`;

let organisationId = "";
let exerciseId = "";
let restrictedId = "";
let estimateId = "";
const p = { sec: "", ia: "", otherDeptSec: "", participant: "", outsider: "", preparer: "", admin: "" };

const staff = (personId: string, over: Partial<StaffActor> = {}): StaffActor => ({
  kind: "STAFF", accountId: "a", sessionId: "s", personId, personName: "R", jobTitle: null, isAdministrator: false, organisationId, organisationCode: `EV_${run}`, organisationTimeZone: "Asia/Kuala_Lumpur",
  offices: [], permissions: new Set<PermissionKey>(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false, ...over,
});
const evaluationRead = async (who: string, exercise = exerciseId, fields = ["score"]) => (await sulitGates(staff(who), [{ scope: "evaluation", id: exercise, label: "EV" }], fields)).get(exercise)!;
const estimate = async (who: string, over: Partial<StaffActor> = {}, exercise = exerciseId) => (await estimateAccessFor(db, staff(who, over), exercise))?.decision;
const setOffices = (secretariat: string | null, internalAudit: string | null) =>
  db.evaluationPolicy.upsert({
    where: { organisationId },
    create: { organisationId, secretariatRoleCode: secretariat, secretariatRoleProvenance: secretariat ? "STATED" : null, internalAuditRoleCode: internalAudit, internalAuditRoleProvenance: internalAudit ? "STATED" : null },
    update: { secretariatRoleCode: secretariat, secretariatRoleProvenance: secretariat ? "STATED" : null, internalAuditRoleCode: internalAudit, internalAuditRoleProvenance: internalAudit ? "STATED" : null },
  });

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `EV_${run}`, name: "Evaluation readers test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Reader ${k} ${run}`)).id;
  for (const code of [DEPT, OTHER]) await db.orgUnit.create({ data: { organisationId, code, nameEn: code, kind: "DEPARTMENT", effectiveFrom: day("2020-01-01") } });
  await db.authorityRole.createMany({
    data: [SEC, IA].map((code) => ({ organisationId, code, nameEn: `Office ${code}`, nameMs: `Pejabat ${code}` })),
  });
  await db.roleAssignment.createMany({
    data: [
      { personId: p.sec, roleCode: SEC, effectiveFrom: day("2020-01-01") },
      { personId: p.ia, roleCode: IA, effectiveFrom: day("2020-01-01") },
      // The Secretariat of another department: not this exercise's.
      { personId: p.otherDeptSec, roleCode: SEC, scope: OTHER, effectiveFrom: day("2020-01-01") },
    ],
  });
  const requisition = await db.requisition.create({
    data: {
      organisationId, reference: `EV/REQ/${run}`, requestingUnitCode: DEPT, requestingPersonId: p.preparer, title: "A requisition for the evaluation readers", justification: "Tests.", needStatement: "None.",
      costCentreCode: "EV_CC", accountCode: "EV_AC", placeOfDelivery: "Nowhere", dateRequired: day("2026-12-31"), estimatedValue: "1000.00", raisedOn: day("2026-10-01"),
    },
  });
  const make = (restricted: boolean) => db.sourcingExercise.create({ data: { organisationId, reference: `EV/EX/${randomId()}`, requisitionId: requisition.id, title: "An exercise", estimatedValue: "1000.00", sourcingMethodCode: "EV_METHOD", restricted } });
  exerciseId = (await make(false)).id;
  restrictedId = (await make(true)).id;
  await db.exerciseParticipant.create({ data: { exerciseId, personId: p.participant } });
  await db.exerciseParticipant.create({ data: { exerciseId: restrictedId, personId: p.participant } });
  estimateId = (await db.companyEstimate.create({ data: { organisationId, exerciseId, preparerPersonId: p.preparer, state: "LODGED", currentVersionNo: 1 } })).id;
  await db.companyEstimate.create({ data: { organisationId, exerciseId: restrictedId, preparerPersonId: p.preparer, state: "DISCLOSED", disclosedAt: new Date(), currentVersionNo: 1 } });
  await db.scopePolicy.upsert({ where: { organisationId }, create: { organisationId }, update: {} });
});

describe("with neither office set, nothing is granted on that account", () => {
  it("the holder of the office the organisation would have named reads nothing, and is refused for the ordinary reason", async () => {
    await setOffices(null, null);
    expect(await evaluationRead(p.sec)).toMatchObject({ state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" });
    expect(await evaluationRead(p.ia)).toMatchObject({ state: "WITHHELD" });
  });
});

describe("with the offices set", () => {
  beforeAll(() => setOffices(SEC, IA));

  it("a holder reads the evaluation, told by which office, and the log says which office let them in", async () => {
    expect(await evaluationRead(p.sec)).toMatchObject({ state: "GRANTED", basis: "SECRETARIAT_OFFICE" });
    expect(await evaluationRead(p.ia)).toMatchObject({ state: "GRANTED", basis: "INTERNAL_AUDIT_OFFICE" });
    const events = await db.sulitAccessEvent.findMany({ where: { entityId: exerciseId, actorPersonId: { in: [p.sec, p.ia] }, scope: "evaluation" }, orderBy: { at: "asc" } });
    expect(events.map((e) => [e.actorPersonId, e.outcome, e.basis])).toEqual(expect.arrayContaining([[p.sec, "GRANTED", "SECRETARIAT_OFFICE"], [p.ia, "GRANTED", "INTERNAL_AUDIT_OFFICE"]]));
  });

  it("an office held for another department does not carry this department's evaluation, and an outsider reads nothing", async () => {
    expect(await evaluationRead(p.otherDeptSec)).toMatchObject({ state: "WITHHELD" });
    expect(await evaluationRead(p.outsider)).toMatchObject({ state: "WITHHELD" });
  });

  it("reads the evaluation and nothing else the exercise carries: not its estimate, its prices read at opening or its bill", async () => {
    for (const field of ["estimatedValue", "openingPrice", "bqRate", "companyEstimate"]) {
      const g = (await sulitGates(staff(p.sec), [{ scope: "exercise", id: exerciseId, label: "EV" }], [field])).get(exerciseId)!;
      expect(g, field).toMatchObject({ state: "WITHHELD" });
    }
  });

  it("does not open a restricted exercise: its named list prevails", async () => {
    expect(await evaluationRead(p.sec, restrictedId)).toMatchObject({ state: "WITHHELD", basis: "RESTRICTED_NOT_NAMED" });
    expect(await evaluationRead(p.participant, restrictedId)).toMatchObject({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
  });

  it("grants reading only: the write rule does not take the office into account", async () => {
    const refusal = await db.$transaction((tx) => sulitWriteRefusal(tx, staff(p.sec), { scope: "evaluation", exerciseId }, ["score"]));
    expect(refusal).not.toBeNull();
    expect(await db.$transaction((tx) => sulitWriteRefusal(tx, staff(p.participant), { scope: "evaluation", exerciseId }, ["score"]))).toBeNull();
  });

  it("an administrator account is refused whatever office it holds", async () => {
    await db.roleAssignment.create({ data: { personId: p.admin, roleCode: SEC, effectiveFrom: day("2020-01-01") } }).catch(() => undefined);
    expect((await sulitGates(staff(p.admin, { isAdministrator: true }), [{ scope: "evaluation", id: exerciseId, label: "EV" }], ["score"])).get(exerciseId)).toMatchObject({ state: "WITHHELD", basis: "ADMINISTRATOR" });
  });

  it("is judged on the organisation's day: an office that has ended reads nothing", async () => {
    const gone = (await makePerson(organisationId, `Reader gone ${run}`)).id;
    await db.roleAssignment.create({ data: { personId: gone, roleCode: IA, effectiveFrom: day("2020-01-01"), effectiveTo: day("2021-01-01") } });
    expect(await evaluationRead(gone)).toMatchObject({ state: "WITHHELD" });
  });
});

describe("the disclosed company estimate is read by the evaluation's readers as well as by its custody (ruling on log line 1736)", () => {
  it("sealed stays sealed to everybody, a reader of the evaluation included", async () => {
    for (const who of [p.preparer, p.participant, p.sec, p.ia]) expect(await estimate(who), who).toEqual({ state: "WITHHELD", basis: "SEALED" });
  });

  it("disclosed, with the custody offices unset, a participant and an office holder read it, and an outsider is told the custody is not set", async () => {
    await db.companyEstimate.update({ where: { id: estimateId }, data: { state: "DISCLOSED", disclosedAt: new Date() } });
    expect(await estimate(p.participant)).toEqual({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(await estimate(p.sec)).toEqual({ state: "GRANTED", basis: "SECRETARIAT_OFFICE" });
    expect(await estimate(p.ia)).toEqual({ state: "GRANTED", basis: "INTERNAL_AUDIT_OFFICE" });
    expect(await estimate(p.outsider)).toEqual({ state: "WITHHELD", basis: "CUSTODY_NOT_SET" });
    expect(await estimate(p.otherDeptSec)).toEqual({ state: "WITHHELD", basis: "CUSTODY_NOT_SET" });
  });

  it("with the custody set, the custody list keeps its own basis and the evaluation's readers still read it", async () => {
    const CUST = `EV_CUST_${run}`;
    const AUD = `EV_AUD_${run}`;
    await db.authorityRole.createMany({ data: [CUST, AUD].map((code) => ({ organisationId, code, nameEn: `Office ${code}`, nameMs: `Pejabat ${code}` })) });
    await db.scopePolicy.update({ where: { organisationId }, data: { estimateCustodianRoleCode: CUST, estimateAuditRoleCode: AUD } });
    expect(await estimate(p.preparer)).toEqual({ state: "GRANTED", basis: "IN_CUSTODY" });
    expect(await estimate(p.participant)).toEqual({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(await estimate(p.sec)).toEqual({ state: "GRANTED", basis: "SECRETARIAT_OFFICE" });
    expect(await estimate(p.outsider)).toEqual({ state: "WITHHELD", basis: "NOT_IN_CUSTODY" });
  });

  it("an administrator account never reads it, and neither does one who holds the office only on a restricted exercise", async () => {
    expect(await estimate(p.participant, { isAdministrator: true })).toEqual({ state: "WITHHELD", basis: "ADMINISTRATOR" });
    // The restricted exercise's estimate is disclosed: its participant reads it, the Secretariat (who does not open a restricted exercise) does not.
    expect(await estimate(p.participant, {}, restrictedId)).toEqual({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(await estimate(p.sec, {}, restrictedId)).toMatchObject({ state: "WITHHELD" });
  });

  it("with no time zone the day is not known: a named reader still reads it, an office holder cannot be shown to hold the office today", async () => {
    expect(await estimate(p.participant, { organisationTimeZone: null })).toEqual({ state: "GRANTED", basis: "NAMED_ON_RECORD" });
    expect(await estimate(p.sec, { organisationTimeZone: null })).toEqual({ state: "WITHHELD", basis: "CUSTODY_DAY_UNKNOWN" });
  });

  it("is logged against the estimate with the basis that let the reader in", async () => {
    const granted = await loggedEstimateAccess(db, staff(p.sec), exerciseId);
    expect(granted?.decision).toEqual({ state: "GRANTED", basis: "SECRETARIAT_OFFICE" });
    const e = await db.sulitAccessEvent.findFirstOrThrow({ where: { entity: "CompanyEstimate", entityId: estimateId, actorPersonId: p.sec }, orderBy: { at: "desc" } });
    expect(e).toMatchObject({ outcome: "GRANTED", basis: "SECRETARIAT_OFFICE", scope: "exercise" });
  });
});
