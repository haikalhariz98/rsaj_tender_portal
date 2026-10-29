import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage C review, ruling 1 (FR-FIN-009), against Postgres: the contractor refuses the final account's acceptance. The refusal is recorded,
 * with its reason; the FINAL then does not issue (FINAL_NOT_ACCEPTED, refused when the witness's block would issue it); it is voided, raised again,
 * accepted on paper with its witness, and issues. The FINAL's form here is the S.O., the contractor, then the witness, so the refusal is not the last
 * block (a refusal that is the last block is rolled back with the issue it would trigger; the demo's form has the S.O. last).
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
import { recordCertificateSignature, sendCertificateToSigning, voidCertificateAct } from "@/app/projects/[id]/certificates/[certId]/actions";

let o: TestOrg;
let k: TestContract;
const as = <T>(personId: string, fn: () => Promise<T>): Promise<T> => {
  h.who = o.staff(personId);
  return fn();
};
const status = async () => (await db.contract.findUniqueOrThrow({ where: { id: k.contractId } })).status;
const liveFinal = () => db.finalAccount.findFirstOrThrow({ where: { contractId: k.contractId, certificate: { status: { not: "VOID" } } }, include: { certificate: true } });

async function kindForm(kind: "PRACTICAL_COMPLETION" | "FINAL") {
  const templateId = (await db.documentTemplate.create({ data: { organisationId: o.organisationId, code: `${kind.toLowerCase()}_${randomId()}`, nameEn: `${kind} (test)`, formCode: kind.slice(0, 6), bodyEn: "Certificate {{certificate.number}} for contract {{contract.number}}.", bodyVersion: 1 } })).id;
  await db.formSignatureBlock.createMany({
    data: [
      { organisationId: o.organisationId, templateId, blockOrder: 1, blockKind: "AUTHORISING", labelEn: "Superintending Officer", officeRule: "SO", delegable: false, datesCertificate: true },
      { organisationId: o.organisationId, templateId, blockOrder: 2, blockKind: "CONTRACTOR", labelEn: "Accepted by the contractor", officeRule: "CONTRACTOR", delegable: true, refusalAllowed: true },
      ...(kind === "FINAL" ? [{ organisationId: o.organisationId, templateId, blockOrder: 3, blockKind: "WITNESS" as const, labelEn: "Witness to the contractor", officeRule: "WITNESS" as const, delegable: true }] : []),
    ],
  });
  await db.formDistribution.create({ data: { organisationId: o.organisationId, templateId, recipientCode: "contractor", labelEn: "The contractor (original)", mandatory: true, ackRequired: true, condition: "NONE", isOriginal: true, sortOrder: 1, provenance: "ASSUMED" } });
  await db.certificateKindSetting.create({ data: { organisationId: o.organisationId, kind, templateId, routingTypeId: null, provenance: "ASSUMED" } });
}

/// Its route written as it stands once approved (its own acts are tested elsewhere), then to signing and the S.O.'s block.
async function toSigning(certId: string, domain: string) {
  await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CERTIFICATE", certificateId: certId, domain, status: "APPROVED", openedAt: new Date() } });
  expect((await as(o.so, () => sendCertificateToSigning({ ok: false }, form({ certId })))).ok).toBe(true);
  const so = await as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: "1", personBlock: "yes", personId: o.so, "personId:password": "any" })));
  expect(so.ok, so.message).toBe(true);
}
const paper = (certId: string, blockOrder: number, name: string, extra: Record<string, string> = {}) =>
  as(o.so, () => recordCertificateSignature({ ok: false }, form({ certId, blockOrder: String(blockOrder), personBlock: "no", name, icNumber: "000000-00-0013", signedOn: today(), ...extra })));

beforeAll(async () => {
  o = await contractOrg("FNA");
  for (const kind of ["PRACTICAL_COMPLETION", "FINAL"] as const) await kindForm(kind);
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, retentionBalanceReleaseAt: "MAKING_GOOD", retentionBalanceReleaseProvenance: "ASSUMED", performanceBondReleaseAt: "MAKING_GOOD", performanceBondReleaseProvenance: "ASSUMED", finalPreviousBasis: "AS_PAID", finalAccountProvenance: "ASSUMED" } });
  k = await activeContract(o, { dueIn: -60, dlpApplies: false, dlpMonths: null });
  const pc = await as(o.so, () => raisePracticalCompletion({ ok: false }, form({ id: k.contractId, completionDate: k.due, possessionTakenOn: k.due, inspectedOn: k.due, testReasons: "Complete." })));
  expect(pc.ok, pc.message).toBe(true);
  const cpc = await db.practicalCompletion.findFirstOrThrow({ where: { contractId: k.contractId } });
  await toSigning(cpc.certificateId, "practical_completion");
  expect((await paper(cpc.certificateId, 2, "Tan Mei Hua")).ok).toBe(true);
  expect(await status()).toBe("PRACTICALLY_COMPLETE");
});

describe("a final account the contractor refuses to accept (ruling 1)", () => {
  it("records the refusal, refuses the issue by name, and issues once voided, raised again and accepted", async () => {
    expect((await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })))).ok).toBe(true);
    const first = (await liveFinal()).certificateId;
    await toSigning(first, "final_payment");
    const refusal = await paper(first, 2, "Tan Mei Hua", { refused: "yes", refusalNote: "The making-good cost is overstated." });
    expect(refusal.ok, refusal.message).toBe(true);
    expect(await db.certificateSignature.findFirstOrThrow({ where: { certificateId: first, blockOrder: 2 } })).toMatchObject({ refused: true, refusalNote: "The making-good cost is overstated." });
    // The witness's block is the last: recording it would issue the FINAL, which the hook refuses, naming the refused block.
    const witness = await paper(first, 3, "Ahmad bin Contoh");
    expect(witness.ok).toBe(false);
    expect(witness.message).toMatch(/contractor refused to sign “Accepted by the contractor”/);
    expect(witness.message).toMatch(/void the certificate and raise the final account again/);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: first } })).status).toBe("SIGNING");
    expect(await status()).toBe("PRACTICALLY_COMPLETE");

    expect((await as(o.so, () => voidCertificateAct({ ok: false }, form({ certId: first, reason: "The contractor disputes the final account (test)." })))).ok).toBe(true);
    // The refusal and its reason stay on the voided certificate.
    expect(await db.certificateSignature.count({ where: { certificateId: first, refused: true } })).toBe(1);

    const again = await as(o.so, () => raiseFinalAccount({ ok: false }, form({ id: k.contractId, personId: o.so })));
    expect(again.ok, again.message).toBe(true);
    const second = (await liveFinal()).certificateId;
    expect(second).not.toBe(first);
    await toSigning(second, "final_payment");
    expect((await paper(second, 2, "Tan Mei Hua")).ok).toBe(true);
    const issued = await paper(second, 3, "Ahmad bin Contoh");
    expect(issued.ok, issued.message).toBe(true);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: second } })).status).toBe("ISSUED");
    expect(await status()).toBe("FINAL_CERTIFICATE_ISSUED");
  });
});
