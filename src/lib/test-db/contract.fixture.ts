import type { StaffActor } from "@/lib/auth/types";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, dayPlus, dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";

import { makePerson, randomId } from "./auth-fixtures";

/**
 * Contracts for the database tests of the post-award acts (Phase 2 close-out): an organisation with its S.O. office and holder, and an
 * active works contract with its baseline and S.O. assignment, as the acts read them. Only the rows every act needs; a test adds its own.
 * Test-only: nothing in the product imports it.
 */

export const TZ = "Asia/Kuala_Lumpur";
export const today = () => dayOf(new Date(), TZ)!;
export const D = (d: string) => dayToDate(d);
export const form = (fields: Record<string, string | readonly string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of typeof v === "string" ? [v] : v) f.append(k, x);
  return f;
};

export interface TestOrg {
  organisationId: string;
  orgCode: string;
  so: string;
  other: string;
  soRole: string;
  soLabel: string;
  staff: (personId: string) => StaffActor;
}

/// An organisation with a time zone, a certificate numbering series, an S.O. office held by `so`, and another officer.
export async function contractOrg(prefix: string): Promise<TestOrg> {
  const run = randomId();
  const orgCode = `${prefix}_${run}`;
  const organisationId = (await db.organisation.create({ data: { code: orgCode, name: `Jabatan ${prefix} ${run}`, timeZone: TZ } })).id;
  const so = (await makePerson(organisationId, `S.O. ${run}`)).id;
  const other = (await makePerson(organisationId, `Other officer ${run}`)).id;
  const soRole = `${prefix}_SO_${run}`;
  const soLabel = "Superintending Officer (test)";
  await db.authorityRole.create({ data: { organisationId, code: soRole, nameEn: soLabel, nameMs: soLabel } });
  await db.roleAssignment.create({ data: { personId: so, roleCode: soRole, effectiveFrom: D("2020-01-01") } });
  await db.numberingSeries.create({ data: { organisationId, key: "certificate", nameEn: "Certificates", pattern: `${prefix}-T/{SERIAL}`, padding: 3, resetOn: "NEVER" } });
  const staff = (personId: string): StaffActor =>
    ({ kind: "STAFF", accountId: `acc_${personId}`, sessionId: `ses_${personId}`, personId, personName: "Officer", jobTitle: null, isAdministrator: false, organisationId, organisationCode: orgCode, organisationTimeZone: TZ, offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.8", mustChangePassword: false }) as unknown as StaffActor;
  return { organisationId, orgCode, so, other, soRole, soLabel, staff };
}

export interface TestContract {
  contractId: string;
  baselineId: string;
  /// The date for completion on the baseline.
  due: string;
  exerciseId: string;
}

/// An executed works contract of RM500,000 whose date for completion is `dueIn` days from today (negative: past), with the S.O. assigned.
export async function activeContract(o: TestOrg, opts: { dueIn?: number; status?: ContractStatus; contractTypeCode?: string; dlpApplies?: boolean | null; dlpMonths?: number | null } = {}): Promise<TestContract> {
  const r = randomId();
  const t = today();
  const due = dayPlus(t, opts.dueIn ?? -30);
  const { organisationId } = o;
  const requisition = await db.requisition.create({ data: { organisationId, reference: `T/RQ/${r}`, requestingUnitCode: "T_DEPT", requestingPersonId: o.so, title: "Works", justification: "Tests.", needStatement: "None.", costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Site", dateRequired: D(dayPlus(t, 100)), estimatedValue: "500000.00", raisedOn: D(dayPlus(t, -400)), contractTypeCode: opts.contractTypeCode ?? null } });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `T/EX/${r}`, requisitionId: requisition.id, title: `Main ${r}`, estimatedValue: "500000.00", sourcingMethodCode: "M", status: "EVALUATED", contractTypeCode: opts.contractTypeCode ?? null } });
  const award = await db.award.create({ data: { organisationId, reference: `T/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "500000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED" } });
  const c = await db.contract.create({ data: { organisationId, number: `T/CON/${r}`, numberSource: "SERIES", numberedOn: D(dayPlus(t, -350)), awardId: award.id, contractSum: "500000.00", status: opts.status ?? "ACTIVE" } });
  const b1 = await db.contractBaseline.create({
    data: { organisationId, contractId: c.id, version: 1, reason: "EXECUTED", contractSum: "500000.00", possessionDate: D(dayPlus(due, -90)), completionPeriod: 90, completionUnit: "DAYS", dateForCompletion: D(due), dlpApplies: opts.dlpApplies === undefined ? true : opts.dlpApplies, dlpMonths: opts.dlpMonths === undefined ? 12 : opts.dlpMonths, entered: {}, snapshot: {}, recordedAt: new Date(), recordedOn: D(dayPlus(t, -340)) },
  });
  await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: o.soRole, roleLabel: o.soLabel, reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "500000.00", warnings: [], effectiveOn: D(dayPlus(t, -350)), recordedAt: new Date() } });
  return { contractId: c.id, baselineId: b1.id, due, exerciseId: exercise.id };
}

/// A live damages decision on the whole works (LAD_APPLIES at RM300 a day from the day after the date for completion), on an issued certificate.
export async function ladDecision(o: TestOrg, k: TestContract): Promise<string> {
  const r = randomId();
  const cnc = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "NON_COMPLETION", status: "ISSUED", baselineId: k.baselineId, number: `CNC/${r}`, sequence: 1, issuedAt: new Date(), issueSnapshot: {}, certificateDate: D(dayPlus(k.due, 2)), openedAt: new Date(), openedOn: D(dayPlus(k.due, 2)) } });
  const d = await db.nonCompletion.create({ data: { organisationId: o.organisationId, contractId: k.contractId, outcome: "LAD_APPLIES", reason: "Not complete on the date for completion.", scope: "WHOLE", certificateId: cnc.id, insuranceExpiry: D(dayPlus(today(), 300)), dateForCompletion: D(k.due), rate: "300.00", windowFrom: D(dayPlus(k.due, 1)), pack: [], decidedOn: D(dayPlus(k.due, 2)), personId: o.so, recordedAt: new Date(), basis: "EOT_RECORD" } });
  return d.id;
}
