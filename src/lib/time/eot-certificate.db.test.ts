import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { dayOf, dayPlus, dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * The EOT certificate through its acts against Postgres (Phase 2 close-out, stage A1; plan closeout-plan.md §4.1; ruling 23 of 2026-10-27):
 * - raised on an entitled claim only once its matter is approved (MATTER_NOT_APPROVED before);
 * - BD-613-121: signing reads the matter's approval: refused while the route is pending, sent once it is approved;
 * - the template's SO authorising block resolves to the contract's S.O.: another person is refused, the S.O.'s holder signs, and the
 *   signature keeps the S.O.'s office;
 * - the issue writes the EXTENSION_OF_TIME version (the new date for completion), links it, and supersedes the live damages decision;
 * - a second certificate raised on the old date is refused EOT_MOVED at its issue (both orders).
 * The matter's route is written as its rows stand once approved (the route's own acts are tested with the matrix elsewhere).
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  return actModule({ now: new Date() }).module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { raiseEotCertificate } from "@/app/projects/[id]/time-actions";
import { recordCertificateSignature, sendCertificateToSigning } from "@/app/projects/[id]/certificates/[certId]/actions";

const run = randomId();
const TZ = "Asia/Kuala_Lumpur";
const today = () => dayOf(new Date(), TZ)!;
const D = (d: string) => dayToDate(d);
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

let organisationId = "";
let orgCode = "";
const p = { so: "", other: "" };
const SO_ROLE = `EOT_SO_${run}`;
const SO_LABEL = "Superintending Officer (test)";
let templateId = "";

const staff = (personId: string): StaffActor =>
  ({ kind: "STAFF", accountId: `acc_${personId}`, sessionId: `ses_${personId}`, personId, personName: "Officer", jobTitle: null, isAdministrator: false, organisationId, organisationCode: orgCode, organisationTimeZone: TZ, offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: "203.0.113.8", mustChangePassword: false }) as unknown as StaffActor;
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = staff(personId);
  return fn();
};

/// An active works contract whose date for completion was 30 days ago, with its S.O., an approved programme, a live damages decision and an
/// entitled whole-works claim of 14 days whose matter's route is `route`.
async function contract(route: "PENDING" | "APPROVED") {
  const r = randomId();
  const t = today();
  const due = dayPlus(t, -30);
  const requisition = await db.requisition.create({ data: { organisationId, reference: `EOT/RQ/${r}`, requestingUnitCode: "EOT_DEPT", requestingPersonId: p.so, title: "Works", justification: "Tests.", needStatement: "None.", costCentreCode: "CC", accountCode: "AC", placeOfDelivery: "Site", dateRequired: D(dayPlus(t, 100)), estimatedValue: "500000.00", raisedOn: D(dayPlus(t, -200)) } });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `EOT/EX/${r}`, requisitionId: requisition.id, title: `Main ${r}`, estimatedValue: "500000.00", sourcingMethodCode: "M", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `EOT/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "500000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED" } });
  const c = await db.contract.create({ data: { organisationId, number: `EOT/CON/${r}`, numberSource: "SERIES", numberedOn: D(dayPlus(t, -150)), awardId: award.id, contractSum: "500000.00", status: "ACTIVE" } });
  const b1 = await db.contractBaseline.create({ data: { organisationId, contractId: c.id, version: 1, reason: "EXECUTED", contractSum: "500000.00", possessionDate: D(dayPlus(due, -90)), completionPeriod: 90, completionUnit: "DAYS", dateForCompletion: D(due), entered: {}, snapshot: {}, recordedAt: new Date(), recordedOn: D(dayPlus(t, -140)) } });
  await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: SO_ROLE, roleLabel: SO_LABEL, reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "500000.00", warnings: [], effectiveOn: D(dayPlus(t, -150)), recordedAt: new Date() } });
  const programme = await db.workProgramme.create({ data: { organisationId, contractId: c.id, revision: 1, kind: "WORK_PROGRAMME", submittedOn: D(dayPlus(t, -120)), recordedAt: new Date() } });
  const cnc = await db.certificate.create({ data: { organisationId, contractId: c.id, kind: "NON_COMPLETION", status: "ISSUED", baselineId: b1.id, number: `CNC/${r}`, sequence: 1, issuedAt: new Date(), issueSnapshot: {}, certificateDate: D(dayPlus(due, 2)), openedAt: new Date(), openedOn: D(dayPlus(due, 2)) } });
  const decision = await db.nonCompletion.create({ data: { organisationId, contractId: c.id, outcome: "LAD_APPLIES", reason: "Not complete on the date for completion.", scope: "WHOLE", certificateId: cnc.id, insuranceExpiry: D(dayPlus(t, 300)), dateForCompletion: D(due), rate: "300.00", windowFrom: D(dayPlus(due, 1)), pack: [], decidedOn: D(dayPlus(due, 2)), personId: p.so, recordedAt: new Date(), basis: "EOT_RECORD" } });
  const matter = await db.contractMatter.create({ data: { organisationId, contractId: c.id, kind: "EOT", reference: `EOT/CM/${r}`, personId: p.so, recordedAt: new Date() } });
  const claim = await db.eotClaim.create({ data: { organisationId, matterId: matter.id, contractId: c.id, scope: "WHOLE", groundClause: "Clause 43 (test)", cause: "The authority's permit was late.", programmeId: programme.id, financialImpact: "NONE", proposedDays: 14, isWeather: false, pack: [], entitlement: "ENTITLED", entitlementReason: "The permit was the employer's to obtain.", bestEndeavours: "FULL", determinedOn: D(t), determinedByPersonId: p.so, personId: p.so, recordedAt: new Date() } });
  await db.eotReason.create({ data: { organisationId, claimId: claim.id, clause: "Clause 43 (test)", reason: "The permit was late.", delayFrom: D(dayPlus(due, -20)), delayUntil: D(dayPlus(due, -6)), extensionDays: 14, concurrency: "CONSECUTIVE" } });
  const inst = await db.approvalInstance.create({ data: { organisationId, matterKind: "CONTRACT", contractMatterId: matter.id, domain: "eot", cond: "NO_FIN_IMPACT", status: route, openedAt: new Date() } });
  if (route === "APPROVED") await db.contractMatter.update({ where: { id: matter.id }, data: { approvedRouteId: inst.id } });
  return { contractId: c.id, claimId: claim.id, matterId: matter.id, routeId: inst.id, decisionId: decision.id, due };
}

const raise = (k: { contractId: string; claimId: string }, grantedDays = "14") => as(p.so, () => raiseEotCertificate({ ok: false }, form({ id: k.contractId, claimId: k.claimId, grantedDays, unextendedNote: "" })));
const certOf = async (claimId: string) => (await db.extensionOfTime.findFirstOrThrow({ where: { claimId }, orderBy: { recordedAt: "desc" }, include: { certificate: true } })).certificate;
const sign = (certId: string, personId: string) => as(personId, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "1", personBlock: "yes", personId, "personId:password": "any" })));
const contractorSigns = (certId: string) => as(p.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));

beforeAll(async () => {
  orgCode = `EOT_${run}`;
  organisationId = (await db.organisation.create({ data: { code: orgCode, name: `Jabatan Masa ${run}`, timeZone: TZ } })).id;
  p.so = (await makePerson(organisationId, `S.O. ${run}`)).id;
  p.other = (await makePerson(organisationId, `Other officer ${run}`)).id;
  await db.authorityRole.create({ data: { organisationId, code: SO_ROLE, nameEn: SO_LABEL, nameMs: SO_LABEL } });
  await db.roleAssignment.create({ data: { personId: p.so, roleCode: SO_ROLE, effectiveFrom: D("2020-01-01") } });
  await db.numberingSeries.create({ data: { organisationId, key: "certificate", nameEn: "Certificates", pattern: "EOT-TEST/{SERIAL}", padding: 3, resetOn: "NEVER" } });
  // Ruling 23: the EOT form's authorising block is the S.O.'s (office rule SO), dating the certificate; the contractor receives it.
  templateId = (await db.documentTemplate.create({ data: { organisationId, code: `eot_${run}`, nameEn: "Extension of time (test)", formCode: "EOT-T", bodyEn: "Certificate {{certificate.number}} for contract {{contract.number}}.", bodyVersion: 1 } })).id;
  await db.formSignatureBlock.createMany({
    data: [
      { organisationId, templateId, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true },
      { organisationId, templateId, blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Received by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true },
    ],
  });
  await db.formDistribution.create({ data: { organisationId, templateId, recipientCode: "contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED" } });
  await db.certificateKindSetting.create({ data: { organisationId, kind: "EOT", templateId, routingTypeId: null, provenance: "ASSUMED" } });
});

describe("the EOT certificate signs only after its matter is approved (BD-613-121, ruling 23)", () => {
  it("is not raised while the matter's route is pending", async () => {
    const k = await contract("PENDING");
    const r = await raise(k);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/route is approved/);
    expect(await db.extensionOfTime.count({ where: { claimId: k.claimId } })).toBe(0);
  });

  it("raised on an approved matter, it is refused at signing once that approval is gone, and sent again once restored", async () => {
    const k = await contract("APPROVED");
    expect((await raise(k)).ok).toBe(true);
    const cert = await certOf(k.claimId);
    expect(cert.status).toBe("DRAFT");
    expect(cert.routingTypeId).toBeNull();
    // The approval of record withdrawn (a later route waiting): signing reads the matter, not the certificate's own route.
    const later = await db.approvalInstance.create({ data: { organisationId, matterKind: "CONTRACT", contractMatterId: k.matterId, domain: "eot", status: "PENDING", openedAt: new Date() } });
    const refused = await as(p.so, () => sendCertificateToSigning({ ok: false }, form({ certId: cert.id })));
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/matter approved/);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: cert.id } })).status).toBe("DRAFT");
    await db.approvalInstance.update({ where: { id: later.id }, data: { status: "APPROVED" } });
    await db.contractMatter.update({ where: { id: k.matterId }, data: { approvedRouteId: later.id } });
    expect((await as(p.so, () => sendCertificateToSigning({ ok: false }, form({ certId: cert.id })))).ok).toBe(true);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: cert.id } })).status).toBe("SIGNING");
  });
});

describe("the SO block resolves to the contract's S.O., and the issue extends the baseline (ruling 23; ADR 0030)", () => {
  it("another officer is refused; the S.O. signs in the S.O.'s office; the issue writes the new date and supersedes the damages decision", async () => {
    const k = await contract("APPROVED");
    expect((await raise(k)).ok).toBe(true);
    const cert = await certOf(k.claimId);
    expect((await as(p.so, () => sendCertificateToSigning({ ok: false }, form({ certId: cert.id })))).ok).toBe(true);
    const wrong = await sign(cert.id, p.other);
    expect(wrong.ok).toBe(false);
    expect(await db.certificateSignature.count({ where: { certificateId: cert.id } })).toBe(0);
    const right = await sign(cert.id, p.so);
    expect(right.ok, right.message).toBe(true);
    const sig = await db.certificateSignature.findFirstOrThrow({ where: { certificateId: cert.id, blockOrder: 1 } });
    expect(sig.personId).toBe(p.so);
    expect(sig.officeLabel).toBe(SO_LABEL);
    const issued = await contractorSigns(cert.id);
    expect(issued.ok, issued.message).toBe(true);
    const after = await db.certificate.findUniqueOrThrow({ where: { id: cert.id } });
    expect(after.status).toBe("ISSUED");
    const x = await db.extensionOfTime.findFirstOrThrow({ where: { certificateId: cert.id }, include: { baseline: true } });
    expect(x.baseline?.version).toBe(2);
    expect(x.baseline?.reason).toBe("EXTENSION_OF_TIME");
    expect(x.baseline?.dateForCompletion?.toISOString().slice(0, 10)).toBe(dayPlus(k.due, 14));
    const d = await db.nonCompletion.findUniqueOrThrow({ where: { id: k.decisionId } });
    expect(d.supersededByEotId).toBe(x.id);
    expect(d.supersededNote).toMatch(new RegExp(`extension of time ${after.number}`));
    const trail = await db.auditEntry.findMany({ where: { organisationId, entityId: { in: [x.id, d.id, x.baselineId!] } }, select: { entity: true, action: true } });
    expect(trail.map((a) => `${a.entity} ${a.action}`).sort()).toEqual(["ContractBaseline CREATE", "ExtensionOfTime CREATE", "ExtensionOfTime UPDATE", "NonCompletion UPDATE"]);
  });

  // Review (close-out stage A): both orders, whichever of the two certificates raised on the same date issues first.
  for (const order of ["first", "second"] as const)
  it(`both orders (the ${order} raised issues first): the other is refused EOT_MOVED at its issue, and nothing is written`, async () => {
    const k = await contract("APPROVED");
    expect((await raise(k)).ok).toBe(true);
    const first = await certOf(k.claimId);
    // A second claim on the same contract, raised on the same (old) date before the first issues.
    const second = await db.eotClaim.findUniqueOrThrow({ where: { id: k.claimId } });
    const m2 = await db.contractMatter.create({ data: { organisationId, contractId: k.contractId, kind: "EOT", reference: `EOT/CM2/${randomId()}`, personId: p.so, recordedAt: new Date() } });
    const r2 = await db.approvalInstance.create({ data: { organisationId, matterKind: "CONTRACT", contractMatterId: m2.id, domain: "eot", status: "APPROVED", openedAt: new Date() } });
    await db.contractMatter.update({ where: { id: m2.id }, data: { approvedRouteId: r2.id } });
    const c2 = await db.eotClaim.create({ data: { organisationId, matterId: m2.id, contractId: k.contractId, scope: "WHOLE", groundClause: "Clause 43 (test)", cause: "A second late permit.", programmeId: second.programmeId, financialImpact: "NONE", proposedDays: 5, isWeather: false, pack: [], entitlement: "ENTITLED", entitlementReason: "Again the employer's.", bestEndeavours: "FULL", determinedOn: D(today()), determinedByPersonId: p.so, personId: p.so, recordedAt: new Date() } });
    await db.eotReason.create({ data: { organisationId, claimId: c2.id, clause: "Clause 43 (test)", reason: "Late again.", delayFrom: D(dayPlus(k.due, -10)), delayUntil: D(dayPlus(k.due, -5)), extensionDays: 5, concurrency: "CONSECUTIVE" } });
    expect((await raise({ contractId: k.contractId, claimId: c2.id }, "5")).ok).toBe(true);
    const later = await certOf(c2.id);
    for (const c of [first, later]) expect((await as(p.so, () => sendCertificateToSigning({ ok: false }, form({ certId: c.id })))).ok).toBe(true);
    for (const c of [first, later]) expect((await sign(c.id, p.so)).ok).toBe(true);
    const [winner, loser] = order === "first" ? [first, later] : [later, first];
    expect((await contractorSigns(winner.id)).ok).toBe(true);
    const refused = await contractorSigns(loser.id);
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/Another extension of time moved the date for completion/);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: loser.id } })).status).toBe("SIGNING");
    expect(await db.contractBaseline.count({ where: { contractId: k.contractId, version: { not: null } } })).toBe(2);
  });
});
