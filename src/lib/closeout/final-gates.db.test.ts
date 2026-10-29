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
import { raiseFinalAccount } from "@/app/projects/[id]/final-actions";
import { recordCertificateSignature, sendCertificateForApproval, sendCertificateToSigning } from "@/app/projects/[id]/certificates/[certId]/actions";

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
