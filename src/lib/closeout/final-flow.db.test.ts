import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { makePerson, makeSupplierAccount, randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage C through its acts against Postgres (plan closeout-plan.md C3; §4.6, §4.7): a contract with no defects liability period is
 * certified practically complete; its final account raises at the contract sum (no interim was paid); a keyed deduction refigures the draft
 * certificate; sending it is refused until the pack, the declaration, Finance's confirmation and the verified performance report are in; its issue
 * is refused FINAL_BASIS_MOVED when a premium the employer paid arrives after the raise, and issues once it is gone (FINAL_CERTIFICATE_ISSUED);
 * the close is refused until Finance's payment is recorded and the performance bond (released at the final payment: no DLP) is returned, then
 * closes once (ContractClosure, CLOSED). Each certificate's route is written as it stands once approved (its own acts are tested elsewhere).
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, closed: [] as unknown[] }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  return actModule({ now: new Date() }).module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("@/lib/integration/closeout", () => ({ manualCloseout: { retentionReleased: async () => undefined, closeRequested: async (ref: unknown) => void h.closed.push(ref) } }));

import { raisePracticalCompletion, returnSecurity } from "@/app/projects/[id]/closeout-actions";
import { addFinalDeduction, closeContract, confirmFinalPayments, linkDeclaration, raiseFinalAccount, recordPackEntry, removeFinalDeduction } from "@/app/projects/[id]/final-actions";
import { recordCertificatePayment, recordCertificateSignature, sendCertificateForApproval, sendCertificateToSigning } from "@/app/projects/[id]/certificates/[certId]/actions";

let o: TestOrg;
let k: TestContract;
let verifier = "";
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = o.staff(personId);
  return fn();
};
const status = async () => (await db.contract.findUniqueOrThrow({ where: { id: k.contractId } })).status;
const finalOf = () => db.finalAccount.findFirstOrThrow({ where: { contractId: k.contractId }, include: { finalLines: true, certificate: true } });

async function kindForm(kind: "PRACTICAL_COMPLETION" | "FINAL") {
  const templateId = (await db.documentTemplate.create({ data: { organisationId: o.organisationId, code: `${kind.toLowerCase()}_${randomId()}`, nameEn: `${kind} (test)`, formCode: kind.slice(0, 6), bodyEn: "Certificate {{certificate.number}} for contract {{contract.number}}.", bodyVersion: 1 } })).id;
  await db.formSignatureBlock.createMany({
    data: [
      { organisationId: o.organisationId, templateId, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true },
      { organisationId: o.organisationId, templateId, blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Accepted by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true },
    ],
  });
  await db.formDistribution.create({ data: { organisationId: o.organisationId, templateId, recipientCode: "contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED" } });
  await db.certificateKindSetting.create({ data: { organisationId: o.organisationId, kind, templateId, routingTypeId: null, provenance: "ASSUMED" } });
}

async function issue(certId: string, domain: string) {
  await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CERTIFICATE", certificateId: certId, domain, status: "APPROVED", openedAt: new Date() } });
  const sent = await as(o.so, () => sendCertificateToSigning({ ok: false }, form({ certId })));
  expect(sent.ok, sent.message).toBe(true);
  const so = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "1", personBlock: "yes", personId: o.so, "personId:password": "any" })));
  expect(so.ok, so.message).toBe(true);
  return as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));
}

let declarationId = "";
let requirementId = "";
let bondId = "";

beforeAll(async () => {
  o = await contractOrg("FIN");
  verifier = (await makePerson(o.organisationId, "Verifier")).id;
  for (const kind of ["PRACTICAL_COMPLETION", "FINAL"] as const) await kindForm(kind);
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, retentionBalanceReleaseAt: "MAKING_GOOD", retentionBalanceReleaseProvenance: "ASSUMED", performanceBondReleaseAt: "MAKING_GOOD", performanceBondReleaseProvenance: "ASSUMED", finalPreviousBasis: "AS_PAID", finalAccountProvenance: "ASSUMED" } });
  requirementId = (await db.closeoutDocumentRequirement.create({ data: { organisationId: o.organisationId, labelEn: "As-built drawings", sortOrder: 1, provenance: "ASSUMED" } })).id;
  // Completed 60 days ago; no defects liability period applies.
  k = await activeContract(o, { dueIn: -60, dlpApplies: false, dlpMonths: null });
  const s = await makeSupplierAccount(o.organisationId);
  const c = await db.contract.findUniqueOrThrow({ where: { id: k.contractId }, select: { awardId: true } });
  await db.award.update({ where: { id: c.awardId }, data: { vendorId: s.supplier.id } });
  bondId = (await db.securityInstrument.create({ data: { contractId: k.contractId, kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", instrumentRef: "BG-FIN-1", value: "25000.00", effectiveFrom: D(dayPlus(today(), -400)), status: "VERIFIED", lodgedOn: D(dayPlus(today(), -400)) } })).id;
  // The contractor's statutory declaration, sent in the portal and taken up by an officer.
  const doc = await db.projectDocument.create({ data: { organisationId: o.organisationId, contractId: k.contractId, title: "Statutory declaration (final account)", side: "CONTRACTOR", kind: "STATUTORY_DECLARATION", createdBySupplierAccountId: s.account!.id, createdAt: new Date() } });
  const v = await db.projectDocumentVersion.create({ data: { organisationId: o.organisationId, documentId: doc.id, number: 1, uploadedBySupplierAccountId: s.account!.id, uploadedAt: new Date(), uploadedOn: D(today()), noApproversAtUpload: true } });
  await db.projectDocumentDecision.create({ data: { organisationId: o.organisationId, versionId: v.id, outcome: "TAKEN_UP", remarks: "", decidedByPersonId: o.so, decidedAt: new Date(), decidedOn: D(today()) } });
  declarationId = doc.id;
});

describe("close-out stage C through its acts", () => {
  let finalCert = "";

  it("refuses the final account before practical completion, then raises it at the contract sum", async () => {
    const early = await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(early.ok).toBe(false);
    const pc = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k.contractId, completionDate: k.due, possessionTakenOn: k.due, inspectedOn: k.due, testReasons: "Complete." })));
    expect(pc.ok, pc.message).toBe(true);
    const cpc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } });
    expect((await issue(cpc.certificateId, "practical_completion")).ok).toBe(true);
    expect(await status()).toBe("PRACTICALLY_COMPLETE");
    const r = await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(r.ok, r.message).toBe(true);
    const fa = await finalOf();
    finalCert = fa.certificateId;
    expect([fa.finalSum.toString(), fa.recommended.toString(), fa.previousBasis]).toEqual(["500000", "500000", "AS_PAID"]);
    const again = await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(again.message).toMatch(/final certificate .*already raised/);
  });

  it("keys a deduction, refiguring the draft certificate, and refuses a fourth other deduction and a rounding with no damages", async () => {
    const r = await as(o.so, () => addFinalDeduction({ ok: false }, form({ id: k.contractId, kind: "MAKING_GOOD_COST", label: "", amount: "1500.00" })));
    expect(r.ok, r.message).toBe(true);
    const fa = await finalOf();
    expect(fa.recommended.toString()).toBe("498500");
    const totals = (fa.certificate.computedSnapshot as { lines: { key: string; value: string }[] }).lines.filter((l) => l.key.startsWith("deduct")).map((l) => l.value);
    expect(totals).toEqual(["1500.00"]);
    expect((await as(o.so, () => addFinalDeduction({ ok: false }, form({ id: k.contractId, kind: "LAD_ROUNDING", label: "", amount: "-0.50" })))).message).toMatch(/no damages to round/);
    for (let i = 0; i < 3; i++) expect((await as(o.so, () => addFinalDeduction({ ok: false }, form({ id: k.contractId, kind: "OTHER", label: `Other ${i}`, amount: "1.00" })))).ok).toBe(true);
    expect((await as(o.so, () => addFinalDeduction({ ok: false }, form({ id: k.contractId, kind: "OTHER", label: "Fourth", amount: "1.00" })))).message).toMatch(/At most 3 other deductions/);
    for (const line of (await finalOf()).finalLines.filter((l) => l.kind === "OTHER")) expect((await as(o.so, () => removeFinalDeduction({ ok: false }, form({ id: k.contractId, lineId: line.id })))).ok).toBe(true);
    expect((await finalOf()).recommended.toString()).toBe("498500");
  });

  it("is not sent for approval until the pack, the declaration, Finance's confirmation and the verified performance report are in", async () => {
    const refused = await as(o.so, () => sendCertificateForApproval({ ok: false }, form({ certId: finalCert, personId: o.so })));
    expect(refused.ok).toBe(false);
    expect(refused.message).toMatch(/pack is missing: As-built drawings/);
    expect(refused.message).toMatch(/statutory declaration is not taken up/);
    expect(refused.message).toMatch(/Finance has not confirmed/);
    expect(refused.message).toMatch(/performance report is not verified/);
    expect((await as(o.so, () => recordPackEntry({ ok: false }, form({ id: k.contractId, requirementId, notApplicableReason: "No drawings: a supply-and-lay contract (test).", personId: o.so })))).ok).toBe(true);
    expect((await as(o.so, () => linkDeclaration({ ok: false }, form({ id: k.contractId, documentId: declarationId })))).ok).toBe(true);
    const differs = await as(o.so, () => confirmFinalPayments({ ok: false }, form({ id: k.contractId, total: "10.00", personId: o.other })));
    expect(differs.message).toMatch(/Finance confirmed RM ?10, but its recorded payments add to RM ?0./);
    const send = await as(o.so, () => sendCertificateForApproval({ ok: false }, form({ certId: finalCert, personId: o.so })));
    expect(send.message).toMatch(/Finance confirmed RM ?10,/);
    expect((await as(o.so, () => confirmFinalPayments({ ok: false }, form({ id: k.contractId, total: "0.00", personId: o.other })))).ok).toBe(true);
    // Stage D's report, verified by a second person (its own acts are tested in stage D).
    const f = await db.performanceForm.create({ data: { organisationId: o.organisationId, nameEn: "Works (test)", contractTypeCode: "works", scaleMax: 5, status: "ISSUED", version: 1, issuedAt: new Date(), issuedByPersonId: verifier, provenance: "ASSUMED", source: "" } });
    await db.performanceReport.create({ data: { organisationId: o.organisationId, contractId: k.contractId, formId: f.id, formSnapshot: {}, scoreTotal: "74.0000", gradeLabel: "C", assessedByPersonId: o.so, assessedAt: new Date(), verifiedByPersonId: verifier, verifiedAt: new Date(), personId: o.so, recordedAt: new Date() } });
    const last = await as(o.so, () => sendCertificateForApproval({ ok: false }, form({ certId: finalCert, personId: o.so })));
    // Past the final account's own gate: what refuses now is the matrix (this test sets none up).
    expect(last.message ?? "").not.toMatch(/pack|declaration|Finance|performance/);
  });

  it("refuses the issue when what it read has moved, and issues once it has not: FINAL_CERTIFICATE_ISSUED", async () => {
    const pending = await db.pendingDeduction.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INSURANCE_PREMIUM", amount: "100.00", paidOn: D(today()), personId: o.so, note: "Premium paid by the employer (test).", recordedAt: new Date() } });
    const moved = await issue(finalCert, "final_payment");
    expect(moved.ok).toBe(false);
    expect(moved.message).toMatch(/has changed since it was raised \(the premiums paid by the employer\)/);
    await db.pendingDeduction.delete({ where: { id: pending.id } });
    const r = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId: finalCert, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));
    expect(r.ok, r.message).toBe(true);
    expect(await status()).toBe("FINAL_CERTIFICATE_ISSUED");
  });

  it("closes once the final is paid and the bond returned, and not before", async () => {
    const early = await as(o.so, () => closeContract({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(early.message).toMatch(/payment of the final certificate is not recorded/);
    const paid = await as(o.so, () => recordCertificatePayment({ ok: false }, form({ certId: finalCert, batchNo: "B-FIN-1", paidOn: today(), note: "", personId: o.so })));
    expect(paid.ok, paid.message).toBe(true);
    const bond = await as(o.so, () => closeContract({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(bond.message).toMatch(/Not returned: Performance bond BG-FIN-1/);
    const ret = await as(o.so, () => returnSecurity({ ok: false }, form({ id: k.contractId, securityId: bondId, returnedOn: today(), officialReceiptRef: "", note: "", personId: o.so })));
    expect(ret.ok, ret.message).toBe(true);
    expect((await db.securityRelease.findUniqueOrThrow({ where: { securityId: bondId } })).certificateId).toBe(finalCert);
    const closed = await as(o.so, () => closeContract({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(closed.ok, closed.message).toBe(true);
    expect(await status()).toBe("CLOSED");
    expect(await db.contractClosure.count({ where: { contractId: k.contractId } })).toBe(1);
    expect(h.closed).toHaveLength(1);
    const twice = await as(o.so, () => closeContract({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(twice.ok).toBe(false);
  });
});
