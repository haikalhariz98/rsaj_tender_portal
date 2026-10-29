import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage D through its acts against Postgres (plan closeout-plan.md D1, D2; ADR 0047 D6; rulings 10, 12, 17). A form is drafted, refused at
 * issue with weights of 0.95 and issued at 1.00 by someone who did not make it; a contract of another type is refused the form-not-set by name; a
 * contract still in its defects liability period is refused NOT_YET_OPEN; a contract with no DLP opens its report at the CPC, is scored, assessed by
 * the S.O., refused verification by the assessor, and verified (filed) by a second person. The database holds the second person and the filed report.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who!, staffForPermission: async () => ({ ok: true as const, actor: h.who! }) };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  return actModule({ now: new Date() }).module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { issueForm, saveBand, saveCriterion, saveForm } from "@/app/configuration/performance/actions";
import { assessPerformanceReport, openPerformanceReport, savePerformanceScores, verifyPerformanceReport } from "@/app/projects/[id]/performance-actions";
import { raisePracticalCompletion } from "@/app/projects/[id]/closeout-actions";
import { recordCertificateSignature, sendCertificateToSigning } from "@/app/projects/[id]/certificates/[certId]/actions";

let o: TestOrg;
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = { ...o.staff(personId), permissions: new Set(["configuration.draft", "configuration.issue"]) } as unknown as StaffActor;
  return fn();
};
const TYPE = `pf_works_${randomId()}`;

/// A CPC raised and issued through its acts (its route written as approved).
async function practicallyComplete(k: TestContract) {
  const r = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k.contractId, completionDate: k.due, possessionTakenOn: k.due, inspectedOn: k.due, testReasons: "Complete." })));
  expect(r.ok, r.message).toBe(true);
  const certId = (await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } })).certificateId;
  await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CERTIFICATE", certificateId: certId, domain: "practical_completion", status: "APPROVED", openedAt: new Date() } });
  expect((await as(o.so, () => sendCertificateToSigning({ ok: false }, form({ certId })))).ok).toBe(true);
  const signed = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "1", personBlock: "yes", personId: o.so, "personId:password": "any" })));
  expect(signed.ok, signed.message).toBe(true);
  expect((await db.contract.findUniqueOrThrow({ where: { id: k.contractId } })).status).toBe("PRACTICALLY_COMPLETE");
}

beforeAll(async () => {
  o = await contractOrg("PRF");
  await db.contractType.create({ data: { organisationId: o.organisationId, code: TYPE, nameEn: "Works (test)", completionVariant: "STANDARD" } });
  const templateId = (await db.documentTemplate.create({ data: { organisationId: o.organisationId, code: `cpc_${randomId()}`, nameEn: "CPC (test)", formCode: "CPC", bodyEn: "Certificate {{certificate.number}}.", bodyVersion: 1 } })).id;
  await db.formSignatureBlock.create({ data: { organisationId: o.organisationId, templateId, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true } });
  await db.formDistribution.create({ data: { organisationId: o.organisationId, templateId, recipientCode: "contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED" } });
  await db.certificateKindSetting.create({ data: { organisationId: o.organisationId, kind: "PRACTICAL_COMPLETION", templateId, routingTypeId: null, provenance: "ASSUMED" } });
});

describe("close-out stage D through its acts", () => {
  let formId = "";

  it("D1: a form is drafted, refused at issue with weights of 0.95, issued at 1.00 by someone who did not make it", async () => {
    expect((await as(o.so, () => saveForm({ ok: false }, form({ contractTypeCode: TYPE, nameEn: "Works performance (test)", scaleMax: "5", provenance: "ASSUMED", source: "" })))).ok).toBe(true);
    formId = (await db.performanceForm.findFirstOrThrow({ where: { organisationId: o.organisationId } })).id;
    for (const [i, w] of ["0.30", "0.25", "0.20", "0.15", "0.05"].entries()) expect((await as(o.so, () => saveCriterion({ ok: false }, form({ formId, sortOrder: String(i + 1), labelEn: `Criterion ${i + 1}`, guideEn: "", weight: w })))).ok).toBe(true);
    for (const [label, lowerPct] of [["E", "0"], ["D", "40"], ["C", "50"], ["B", "60"], ["A", "80"]]) expect((await as(o.so, () => saveBand({ ok: false }, form({ formId, label, lowerPct })))).ok).toBe(true);
    const maker = await as(o.so, () => issueForm({ ok: false }, form({ id: formId, issuedByPersonId: o.so })));
    expect(maker.ok).toBe(false);
    expect(maker.message).toMatch(/You made this draft/);
    const short = await as(o.other, () => issueForm({ ok: false }, form({ id: formId, issuedByPersonId: o.other })));
    expect(short.ok).toBe(false);
    expect(short.message).toMatch(/The weights total 0.95, not exactly 1/);
    const last = await db.performanceCriterion.findFirstOrThrow({ where: { formId, sortOrder: 5 } });
    expect((await as(o.so, () => saveCriterion({ ok: false }, form({ formId, criterionId: last.id, sortOrder: "5", labelEn: "Criterion 5", guideEn: "", weight: "0.10" })))).ok).toBe(true);
    const ok = await as(o.other, () => issueForm({ ok: false }, form({ id: formId, issuedByPersonId: o.other })));
    expect(ok.ok, ok.message).toBe(true);
    const f = await db.performanceForm.findUniqueOrThrow({ where: { id: formId } });
    expect([f.status, f.issuedByPersonId]).toEqual(["ISSUED", o.other]);
    const frozen = await as(o.so, () => saveCriterion({ ok: false }, form({ formId, sortOrder: "6", labelEn: "Late", guideEn: "", weight: "0.10" })));
    expect(frozen.ok).toBe(false);
  });

  it("the form not set is refused by name, and a contract still in its defects liability period is not yet open", async () => {
    const other = await activeContract(o, { dueIn: -20, dlpApplies: false });
    await practicallyComplete(other);
    const r = await as(o.so, () => openPerformanceReport({ ok: false }, form({ id: other.contractId })));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no contract type, so it has no issued performance form/);
    const dlp = await activeContract(o, { dueIn: -20, contractTypeCode: TYPE, dlpMonths: 12 });
    await practicallyComplete(dlp);
    const early = await as(o.so, () => openPerformanceReport({ ok: false }, form({ id: dlp.contractId })));
    expect(early.ok).toBe(false);
    expect(early.message).toMatch(/Opens once the certificate of making good defects is issued/);
  });

  it("D2: with no DLP the report opens at the CPC; scored, assessed by the S.O., refused to the assessor, verified by a second person", async () => {
    const k = await activeContract(o, { dueIn: -20, contractTypeCode: TYPE, dlpApplies: false });
    await practicallyComplete(k);
    expect((await as(o.so, () => openPerformanceReport({ ok: false }, form({ id: k.contractId })))).ok).toBe(true);
    const report = await db.performanceReport.findUniqueOrThrow({ where: { contractId: k.contractId } });
    expect(report.formId).toBe(formId);
    expect((await as(o.so, () => openPerformanceReport({ ok: false }, form({ id: k.contractId })))).message).toMatch(/already has its report/);
    const part = await as(o.so, () => savePerformanceScores({ ok: false }, form({ id: k.contractId, score_1: "4", score_2: "3", score_3: "5", score_4: "3" })));
    expect(part.ok, part.message).toBe(true);
    const missing = await as(o.so, () => assessPerformanceReport({ ok: false }, form({ id: k.contractId })));
    expect(missing.ok).toBe(false);
    expect(missing.message).toMatch(/Score Criterion 5/);
    expect((await as(o.so, () => savePerformanceScores({ ok: false }, form({ id: k.contractId, score_5: "3", note_5: "Tidy site." })))).ok).toBe(true);
    const assessed = await as(o.so, () => assessPerformanceReport({ ok: false }, form({ id: k.contractId })));
    expect(assessed.ok, assessed.message).toBe(true);
    const a = await db.performanceReport.findUniqueOrThrow({ where: { id: report.id } });
    expect([a.scoreTotal?.toString(), a.gradeLabel, a.assessedByPersonId]).toEqual(["74", "B", o.so]);
    expect((await as(o.so, () => savePerformanceScores({ ok: false }, form({ id: k.contractId, score_1: "5" })))).message).toMatch(/scores are fixed/);
    await expect(db.performanceScore.updateMany({ where: { reportId: report.id }, data: { score: 1 } })).rejects.toThrow(/assessed, so its scores are fixed/);
    const same = await as(o.so, () => verifyPerformanceReport({ ok: false }, form({ id: k.contractId })));
    expect(same.ok).toBe(false);
    expect(same.message).toMatch(/You assessed this report/);
    await expect(db.performanceReport.update({ where: { id: report.id }, data: { verifiedByPersonId: o.so, verifiedAt: new Date() } })).rejects.toThrow(/PerformanceReport_second_person/);
    const filed = await as(o.other, () => verifyPerformanceReport({ ok: false }, form({ id: k.contractId })));
    expect(filed.ok, filed.message).toBe(true);
    expect((await db.performanceReport.findUniqueOrThrow({ where: { id: report.id } })).verifiedByPersonId).toBe(o.other);
    await expect(db.performanceReport.update({ where: { id: report.id }, data: { gradeLabel: "A" } })).rejects.toThrow(/verified report is filed/);
    const trail = await db.auditEntry.findMany({ where: { organisationId: o.organisationId, entity: "PerformanceReport", entityId: report.id }, orderBy: { at: "asc" } });
    expect(trail.length).toBe(5);
  });

  it("the report is not opened before practical completion (the act × status table)", async () => {
    const k = await activeContract(o, { dueIn: 30, contractTypeCode: TYPE, dlpApplies: false });
    const r = await as(o.so, () => openPerformanceReport({ ok: false }, form({ id: k.contractId })));
    expect(r.ok).toBe(false);
    expect(await db.performanceReport.count({ where: { contractId: k.contractId } })).toBe(0);
    expect(D(today())).toBeTruthy();
  });
});
