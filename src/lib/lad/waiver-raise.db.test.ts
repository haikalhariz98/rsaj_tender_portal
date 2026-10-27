import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, ladDecision, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Money tests 5 and 6 of the close-out stage B code review: approved waivers applied through `raiseInterimCertificate` itself. Two approved waivers on
 * one decision are both applied on one interim (review M3); a void of that interim gives them back, and the next raise applies them again (review M2).
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

import { raiseInterimCertificate } from "@/app/projects/[id]/payment-actions";
import { voidCertificateAct } from "@/app/projects/[id]/certificates/[certId]/actions";

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("WRA");
  const templateId = (await db.documentTemplate.create({ data: { organisationId: o.organisationId, code: `ipc_${randomId()}`, nameEn: "Interim (test)", formCode: "IPC", bodyEn: "Certificate {{certificate.number}}.", bodyVersion: 1 } })).id;
  await db.certificateKindSetting.create({ data: { organisationId: o.organisationId, kind: "INTERIM_PAYMENT", templateId, routingTypeId: null, provenance: "ASSUMED" } });
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, ladWaiverApplication: "NEXT_CERTIFICATE" } });
});

async function approvedWaiver(k: TestContract, decisionId: string, waived: string) {
  const matter = await db.contractMatter.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "LAD_WAIVER", reference: `WV/${randomId()}`, personId: o.so, recordedAt: new Date() } });
  const route = await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: matter.id, domain: "lad_waiver", status: "APPROVED", openedAt: new Date() } });
  await db.contractMatter.update({ where: { id: matter.id }, data: { approvedRouteId: route.id } });
  const { loadContract } = await import("@/lib/contract/repo");
  const { baselineOn, loadPayment, waiverBasisJson, waiverBasisOf } = await import("@/lib/payment/load");
  const l = (await loadContract(o.organisationId, k.contractId))!;
  const basis = waiverBasisOf(await loadPayment(k.contractId), baselineOn(l, today())!, decisionId, today())!;
  return db.ladWaiver.create({ data: { organisationId: o.organisationId, matterId: matter.id, decisionId, ladAmount: "9000.00", waived, asOf: D(today()), basis: waiverBasisJson(basis), reason: "Test.", personId: o.so, recordedAt: new Date() } });
}

const openValuation = (k: TestContract) =>
  db.interimValuation.create({ data: { organisationId: o.organisationId, contractId: k.contractId, trigger: "CLAIM", triggerDate: D(today()), valuationDate: D(today()), status: "OPEN", mainWorks: "100000.00", jointOn: D(today()), method: "Measured.", contractorAnswer: "AGREED", personId: o.so, recordedAt: new Date(), recordedOn: D(today()) } });
const raise = (k: TestContract, valuationId: string) => {
  h.who = o.staff(o.so);
  return raiseInterimCertificate({ ok: false }, form({ id: k.contractId, valuationId }));
};

describe("waivers applied by the raise itself", () => {
  it("money test 6 (M3): two approved waivers are both applied on one interim; money test 5 (M2): a void gives them back and the re-raise applies them again", async () => {
    const k = await activeContract(o, { dueIn: -30 });
    // The money terms a raise reads from the baseline (invented): retention at 5% capped at 5%, interim minimums of nothing, RM300 a day damages.
    await db.contractBaseline.update({ where: { id: k.baselineId }, data: { retentionApplies: true, retentionPercent: "5", retentionCapPercent: "5", retentionSource: "ENTERED", firstInterimMinimum: "0", subsequentInterimMinimum: "0", ladKind: "AMOUNT_PER_DAY", ladDaily: "300.00" } });
    const decisionId = await ladDecision(o, k);
    const a = await approvedWaiver(k, decisionId, "1000.00");
    const b = await approvedWaiver(k, decisionId, "2000.00");
    const v1 = await openValuation(k);
    const r = await raise(k, v1.id);
    expect(r.ok, r.message).toBe(true);
    const cert = (await db.interimValuation.findUniqueOrThrow({ where: { id: v1.id } })).certificateId!;
    for (const w of [a, b]) expect((await db.ladWaiver.findUniqueOrThrow({ where: { id: w.id } })).appliedOnCertificateId).toBe(cert);
    h.who = o.staff(o.so);
    const voided = await voidCertificateAct({ ok: false }, form({ certId: cert, reason: "Raised on the wrong valuation." }));
    expect(voided.ok, voided.message).toBe(true);
    for (const w of [a, b]) expect((await db.ladWaiver.findUniqueOrThrow({ where: { id: w.id } })).appliedOnCertificateId).toBeNull();
    const v2 = await openValuation(k);
    const again = await raise(k, v2.id);
    expect(again.ok, again.message).toBe(true);
    const cert2 = (await db.interimValuation.findUniqueOrThrow({ where: { id: v2.id } })).certificateId!;
    for (const w of [a, b]) expect((await db.ladWaiver.findUniqueOrThrow({ where: { id: w.id } })).appliedOnCertificateId).toBe(cert2);
  });
});
