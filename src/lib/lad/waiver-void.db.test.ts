import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { loadContract } from "@/lib/contract/repo";
import { db } from "@/lib/db";
import { baselineOn, loadPayment, waiverBasisJson, waiverBasisOf, waiversToApplyOf } from "@/lib/payment/load";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, ladDecision, today, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage A review M2: a waiver applied on an interim that is then voided was stranded (its `appliedOnCertificateId` still named the void
 * certificate, so no later interim applied it and the credit was lost). The void now unapplies it, audited, in the void's transaction, and the next
 * interim's reading (`waiversToApplyOf`, the raise's own) applies it again.
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

import { voidCertificateAct } from "@/app/projects/[id]/certificates/[certId]/actions";

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("WVV");
});

describe("a voided interim gives its waivers back (review M2)", () => {
  it("the void clears the waiver's application and audits it; the next interim applies it again", async () => {
    const k = await activeContract(o);
    const decisionId = await ladDecision(o, k);
    const l = (await loadContract(o.organisationId, k.contractId))!;
    const baseline = baselineOn(l, today())!;
    const basis = waiverBasisOf(await loadPayment(k.contractId), baseline, decisionId, today())!;
    expect(basis.amount).toBeGreaterThan(0n);
    const matter = await db.contractMatter.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "LAD_WAIVER", reference: `WV/${randomId()}`, personId: o.so, recordedAt: new Date() } });
    const route = await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: matter.id, domain: "lad_waiver", status: "APPROVED", openedAt: new Date() } });
    await db.contractMatter.update({ where: { id: matter.id }, data: { approvedRouteId: route.id } });
    const cert = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "DRAFT", baselineId: k.baselineId, openedAt: new Date(), openedOn: D(today()) } });
    const w = await db.ladWaiver.create({ data: { organisationId: o.organisationId, matterId: matter.id, decisionId, ladAmount: "1.00", waived: "1.00", asOf: D(today()), basis: waiverBasisJson(basis), reason: "Test.", appliedOnCertificateId: cert.id, appliedAt: new Date(), personId: o.so, recordedAt: new Date() } });
    const before = waiversToApplyOf(await loadPayment(k.contractId), baseline, "NEXT_CERTIFICATE");
    expect(before.apply.map((x) => x.id)).not.toContain(w.id);

    h.who = o.staff(o.so);
    const r = await voidCertificateAct({ ok: false }, form({ certId: cert.id, reason: "Raised on the wrong valuation." }));
    expect(r.ok, r.message).toBe(true);

    const after = await db.ladWaiver.findUniqueOrThrow({ where: { id: w.id } });
    expect(after.appliedOnCertificateId).toBeNull();
    expect(after.appliedAt).toBeNull();
    expect(await db.auditEntry.count({ where: { organisationId: o.organisationId, entity: "LadWaiver", entityId: w.id, action: "UPDATE" } })).toBe(1);
    const again = waiversToApplyOf(await loadPayment(k.contractId), baseline, "NEXT_CERTIFICATE");
    expect(again.apply.map((x) => x.id)).toContain(w.id);
  });
});
