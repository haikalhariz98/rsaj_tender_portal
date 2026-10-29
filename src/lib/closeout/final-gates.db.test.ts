import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * The final account's gates added by the close-out stage C review, against Postgres. Each case stands up its own contract, practically complete
 * with no defects liability period, and writes the rows it needs directly (their own acts are tested elsewhere):
 * - ruling 8, in both orders: a variation approved before the raise refuses the raise; one approved while the FINAL is in routing refuses the
 *   send and the issue, by its reference.
 * - ruling 9: the close is refused while an issued interim certificate has no Finance payment, naming it; and (the review's S5) while a matter's
 *   route is open, written after the FINAL issued (its issue refuses stranded work, so it can only arrive after).
 * - ruling 4: a final with one nominated sub-contractor: the send refuses until its due is recorded; the split is printed and frozen; it issues.
 * - S5, both orders of a draft final and a new interim: an interim in progress refuses the raise (CERTIFICATES_IN_PROGRESS); an interim issued after
 *   the raise refuses a keyed deduction (S2) and the issue, FINAL_BASIS_MOVED.
 * - S3, S4 and the pack's trail: a keyed amount too large for its column is refused by name; a keyed deduction audits the account's payment
 *   before and after; a pack entry recorded again ends the first entry's trail under its own id.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  return actModule({ now: new Date() }).module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("@/lib/integration/closeout", () => ({ manualCloseout: { retentionReleased: async () => undefined, closeRequested: async () => undefined } }));

import { raisePracticalCompletion } from "@/app/projects/[id]/closeout-actions";
import { addFinalDeduction, closeContract, raiseFinalAccount, recordFinalPartyDue, recordPackEntry } from "@/app/projects/[id]/final-actions";
import { recordCertificatePayment, recordCertificateSignature, sendCertificateForApproval, sendCertificateToSigning } from "@/app/projects/[id]/certificates/[certId]/actions";

let o: TestOrg;
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = o.staff(personId);
  return fn();
};
const liveFinal = (k: TestContract) => db.finalAccount.findFirstOrThrow({ where: { contractId: k.contractId, certificate: { status: { not: "VOID" } } } });

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

/// Its route written as it stands once approved, to signing, and the S.O.'s block; then the contractor's block from paper (it issues).
async function toSigning(certId: string, domain: string) {
  await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CERTIFICATE", certificateId: certId, domain, status: "APPROVED", openedAt: new Date() } });
  expect((await as(o.so, () => sendCertificateToSigning({ ok: false }, form({ certId })))).ok).toBe(true);
  const so = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "1", personBlock: "yes", personId: o.so, "personId:password": "any" })));
  expect(so.ok, so.message).toBe(true);
}
const contractorSigns = (certId: string) => as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "2", personBlock: "no", name: "Tan Mei Hua", icNumber: "000000-00-0013", signedOn: today() })));

/// A contract practically complete (no defects liability period), its CPC issued.
async function completed(): Promise<TestContract> {
  const k = await activeContract(o, { dueIn: -60, dlpApplies: false, dlpMonths: null });
  const pc = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k.contractId, completionDate: k.due, possessionTakenOn: k.due, inspectedOn: k.due, testReasons: "Complete." })));
  expect(pc.ok, pc.message).toBe(true);
  const cpc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } });
  await toSigning(cpc.certificateId, "practical_completion");
  expect((await contractorSigns(cpc.certificateId)).ok).toBe(true);
  return k;
}

/// A variation whose prior approval is approved, on no adjustment of the contract sum.
async function approvedVariation(k: TestContract, reference: string) {
  const v = await db.variation.create({ data: { organisationId: o.organisationId, contractId: k.contractId, reference, status: "SUPPORTED", origin: "DEPARTMENT", originatorPersonId: o.so, originatorName: "S.O.", description: "Extra drainage", reason: "Found on site.", estimate: "2000.00", recordedOn: D(today()), recordedAt: new Date() } });
  const route = await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "VARIATION", variationId: v.id, domain: "variation", status: "APPROVED", openedAt: new Date() } });
  await db.variationApproval.create({ data: { organisationId: o.organisationId, variationId: v.id, event: "PRIOR", approvalInstanceId: route.id, value: "2000.00", reading: {}, sentByPersonId: o.so, sentOn: D(today()), sentAt: new Date() } });
  return v.id;
}

beforeAll(async () => {
  o = await contractOrg("FNG");
  for (const kind of ["PRACTICAL_COMPLETION", "FINAL"] as const) await kindForm(kind);
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, retentionBalanceReleaseAt: "MAKING_GOOD", retentionBalanceReleaseProvenance: "ASSUMED", performanceBondReleaseAt: "MAKING_GOOD", performanceBondReleaseProvenance: "ASSUMED", finalPreviousBasis: "AS_PAID", finalAccountProvenance: "ASSUMED" } });
});

describe("ruling 8: a variation not on an issued adjustment refuses the final account, in both orders", () => {
  it("approved before the raise: the raise is refused, naming it", async () => {
    const k = await completed();
    const v = await approvedVariation(k, `VO/T/${randomId()}`);
    const ref = (await db.variation.findUniqueOrThrow({ where: { id: v } })).reference!;
    const r = await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(r.ok).toBe(false);
    expect(r.message).toContain(`Not on an issued adjustment: ${ref} (approved, not on an issued adjustment)`);
  });

  it("approved while the FINAL is in routing: the send and the issue are refused, naming it", async () => {
    const k = await completed();
    expect((await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })))).ok).toBe(true);
    const cert = (await liveFinal(k)).certificateId;
    const ref = `VO/T/${randomId()}`;
    await approvedVariation(k, ref);
    const send = await as(o.so, () => sendCertificateForApproval({ ok: false }, form({ certId: cert, personId: o.so })));
    expect(send.ok).toBe(false);
    expect(send.message).toContain(`${ref} (approved, not on an issued adjustment)`);
    await toSigning(cert, "final_payment");
    const issue = await contractorSigns(cert);
    expect(issue.ok).toBe(false);
    expect(issue.message).toContain(`Not issued: The final sum counts only issued adjustments`);
    expect(issue.message).toContain(ref);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: cert } })).status).toBe("SIGNING");
  });
});

describe("ruling 9 and S5: the close refuses an unpaid certificate and an open matter, by name", () => {
  it("names an issued interim certificate with no Finance payment, and a matter whose route is open", async () => {
    const k = await completed();
    const ipc = `IPC/T/${randomId()}`;
    await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "ISSUED", baselineId: k.baselineId, number: ipc, sequence: 90, issuedAt: new Date(Date.now() - 86_400_000), issueSnapshot: {}, certificateDate: D(today()), openedAt: new Date(), openedOn: D(today()) } });
    expect((await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })))).ok).toBe(true);
    const cert = (await liveFinal(k)).certificateId;
    await toSigning(cert, "final_payment");
    const issued = await contractorSigns(cert);
    expect(issued.ok, issued.message).toBe(true);
    expect((await as(o.so, () => recordCertificatePayment({ ok: false }, form({ certId: cert, batchNo: `B-${randomId()}`, paidOn: today(), note: "", personId: o.so })))).ok).toBe(true);
    const matter = `CM/EOT/${randomId()}`;
    await db.contractMatter.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "EOT", reference: matter, personId: o.so, recordedAt: new Date() } });
    const r = await as(o.so, () => closeContract({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(r.ok).toBe(false);
    expect(r.message).toContain(`Finance's payment is not recorded on: Interim payment certificate ${ipc}.`);
    expect(r.message).not.toContain("Final certificate");
    expect(r.message).toMatch(/A route is still open: .*CM\/EOT\//);
    expect((await db.contract.findUniqueOrThrow({ where: { id: k.contractId } })).status).toBe("FINAL_CERTIFICATE_ISSUED");
  });
});

describe("ruling 4: the final account's split, with one nominated sub-contractor", () => {
  it("refuses the send until its due is recorded, prints and freezes the split, and issues", async () => {
    const k = await completed();
    const nsc = await db.contractParty.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "NOMINATED_SUBCONTRACTOR", name: "Syarikat Elektrik NSC", recordedAt: new Date() } });
    expect((await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })))).ok).toBe(true);
    const fa = await liveFinal(k);
    const send = await as(o.so, () => sendCertificateForApproval({ ok: false }, form({ certId: fa.certificateId, personId: o.so })));
    expect(send.message).toContain("is due on the final account is not recorded: Syarikat Elektrik NSC.");
    const r = await as(o.so, () => recordFinalPartyDue({ ok: false }, form({ id: k.contractId, partyId: nsc.id, due: "1000.00" })));
    expect(r.ok, r.message).toBe(true);
    const after = await db.finalAccount.findUniqueOrThrow({ where: { id: fa.id }, include: { certificate: true, partyLines: true } });
    expect(after.partyLines.map((x) => x.due.toString())).toEqual(["1000"]);
    const lines = (after.certificate.computedSnapshot as { lines: { key: string; labelEn: string; value: string }[] }).lines;
    expect(lines.filter((x) => x.key.startsWith("party")).map((x) => `${x.labelEn}: ${x.value}`)).toEqual(["Paid to Syarikat Elektrik NSC: 1000.00", "Paid to the main contractor: 499000.00"]);
    expect((after.judgedUnder as { parties: string[]; split: string }).parties).toEqual([nsc.id]);
    expect(await db.auditEntry.count({ where: { entity: "FinalPartyLine", organisationId: o.organisationId } })).toBe(1);
    const again = await as(o.so, () => sendCertificateForApproval({ ok: false }, form({ certId: fa.certificateId, personId: o.so })));
    expect(again.message ?? "").not.toMatch(/is due on the final account/);
    await toSigning(fa.certificateId, "final_payment");
    const issued = await contractorSigns(fa.certificateId);
    expect(issued.ok, issued.message).toBe(true);
  });
});

/// An interim certificate as issued, its figures adding up (carried forward 100,000.00, nothing deducted), on a raised valuation.
async function issuedInterim(k: TestContract, sequence: number) {
  const figures = { lines: [{ key: "carryForward", value: "100000.00" }, { key: "nscWorks", value: "0.00" }], totals: [{ key: "totalDeductions", value: "0.00" }, { key: "recommended", value: "100000.00" }] };
  const cert = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "ISSUED", baselineId: k.baselineId, number: `IPC/T/${randomId()}`, sequence, issuedAt: new Date(), issueSnapshot: { figures }, certificateDate: D(today()), openedAt: new Date(), openedOn: D(today()) } });
  await db.interimValuation.create({ data: { organisationId: o.organisationId, contractId: k.contractId, trigger: "CLAIM", triggerDate: D(today()), valuationDate: D(today()), status: "RAISED", certificateId: cert.id, judgedUnder: {}, mainWorks: "100000.00", jointOn: D(today()), method: "Measured.", contractorAnswer: "AGREED", personId: o.so, recordedAt: new Date(), recordedOn: D(today()) } });
  return cert.id;
}

describe("S5: a draft final and a new interim, in both orders", () => {
  it("an interim in progress refuses the raise, naming it", async () => {
    const k = await completed();
    await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "DRAFT", baselineId: k.baselineId, openedAt: new Date(), openedOn: D(today()) } });
    const r = await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Finish or void first: Interim payment certificate (in progress).");
  });

  it("an interim issued after the raise refuses a keyed deduction and the issue, FINAL_BASIS_MOVED", async () => {
    const k = await completed();
    expect((await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })))).ok).toBe(true);
    const fa = await liveFinal(k);
    await issuedInterim(k, 1);
    const keyed = await as(o.so, () => addFinalDeduction({ ok: false }, form({ id: k.contractId, kind: "WAGES", label: "", amount: "10.00" })));
    expect(keyed.ok).toBe(false);
    expect(keyed.message).toMatch(/has changed since it was raised \(the interim certificates, .*the less block/);
    expect(await db.finalAccountLine.count({ where: { finalAccountId: fa.id, keyed: true } })).toBe(0);
    await toSigning(fa.certificateId, "final_payment");
    const issue = await contractorSigns(fa.certificateId);
    expect(issue.ok).toBe(false);
    expect(issue.message).toMatch(/has changed since it was raised \(the interim certificates/);
  });
});

describe("S3, S4 and the pack entry's trail", () => {
  it("refuses an amount too large, audits the payment before and after, and ends a replaced pack entry's trail under its id", async () => {
    const k = await completed();
    expect((await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })))).ok).toBe(true);
    const fa = await liveFinal(k);
    const big = await as(o.so, () => addFinalDeduction({ ok: false }, form({ id: k.contractId, kind: "WAGES", label: "", amount: "12345678901234567.00" })));
    expect(big.ok).toBe(false);
    expect(big.errors?.amount).toBe("Amount is too large to record: at most 16 digits before the decimal point.");
    expect(await db.finalAccountLine.count({ where: { finalAccountId: fa.id, keyed: true } })).toBe(0);
    expect((await as(o.so, () => addFinalDeduction({ ok: false }, form({ id: k.contractId, kind: "WAGES", label: "", amount: "250.00" })))).ok).toBe(true);
    const trail = await db.auditEntry.findFirstOrThrow({ where: { entity: "FinalAccount", entityId: fa.id, action: "UPDATE" }, orderBy: { at: "desc" } });
    expect(trail.changes).toEqual([{ field: "paymentRecommended", before: "RM500,000", after: "RM499,750" }]);
    const requirementId = (await db.closeoutDocumentRequirement.create({ data: { organisationId: o.organisationId, labelEn: `Operation manuals ${randomId()}`, sortOrder: 9, provenance: "ASSUMED" } })).id;
    const record = (reason: string) => as(o.so, () => recordPackEntry({ ok: false }, form({ id: k.contractId, requirementId, notApplicableReason: reason, personId: o.so })));
    expect((await record("None supplied with this plant (test).")).ok).toBe(true);
    const first = await db.finalPackEntry.findFirstOrThrow({ where: { finalAccountId: fa.id, requirementId } });
    expect((await record("Supplied with the pumps' handover instead (test).")).ok).toBe(true);
    const second = await db.finalPackEntry.findFirstOrThrow({ where: { finalAccountId: fa.id, requirementId } });
    expect(second.id).not.toBe(first.id);
    expect((await db.auditEntry.findMany({ where: { entity: "FinalPackEntry", entityId: first.id }, orderBy: { at: "asc" } })).map((x) => x.action)).toEqual(["CREATE", "DELETE"]);
    expect((await db.auditEntry.findMany({ where: { entity: "FinalPackEntry", entityId: second.id } })).map((x) => x.action)).toEqual(["CREATE"]);
  });
});
