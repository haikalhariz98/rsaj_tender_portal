import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { loadContract } from "@/lib/contract/repo";
import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { baselineOn, loadPayment, waiverBasisJson, waiverBasisOf } from "@/lib/payment/load";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, ladDecision, today, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage A review S1: sending an approved waiver again compared its frozen amount with the LAD amount read today, which grows every day
 * damages run, so every waiver looked moved a day after its send; and a basis that moved with the same amount (a changed rate segment) looked
 * unmoved. The act now asks the raise's own judgement (`applicationOf` over the waiver's own day).
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

import { resendLadWaiver } from "@/app/projects/[id]/damages-actions";

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("WVR");
});

/// An approved waiver sent five days ago, its basis frozen as it read on that day (`tamper` changes the frozen basis).
async function approvedWaiver(tamper: (b: ReturnType<typeof waiverBasisJson>) => ReturnType<typeof waiverBasisJson> = (b) => b) {
  const k = await activeContract(o);
  const decisionId = await ladDecision(o, k);
  const asOf = dayPlus(today(), -5);
  const l = (await loadContract(o.organisationId, k.contractId))!;
  const basis = waiverBasisOf(await loadPayment(k.contractId), baselineOn(l, today())!, decisionId, asOf)!;
  const matter = await db.contractMatter.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "LAD_WAIVER", reference: `WV/${randomId()}`, personId: o.so, recordedAt: new Date() } });
  const route = await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: matter.id, domain: "lad_waiver", status: "APPROVED", openedAt: new Date() } });
  await db.contractMatter.update({ where: { id: matter.id }, data: { approvedRouteId: route.id } });
  const w = await db.ladWaiver.create({ data: { organisationId: o.organisationId, matterId: matter.id, decisionId, ladAmount: "1000.00", waived: "1000.00", asOf: D(asOf), basis: tamper(waiverBasisJson(basis)), reason: "Test.", personId: o.so, recordedAt: new Date() } });
  return { k, w };
}

const resend = (contractId: string, waiverId: string) => {
  h.who = o.staff(o.so);
  return resendLadWaiver({ ok: false }, form({ id: contractId, waiverId }));
};

describe("a waiver is sent again only where its basis moved (review S1)", () => {
  it("one whose basis has not moved since its own day is refused, though today's LAD amount is larger", async () => {
    const { k, w } = await approvedWaiver();
    const r = await resend(k.contractId, w.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/has not moved/);
  });

  it("one whose rate segments changed is sent again, though its amount is the same", async () => {
    const { k, w } = await approvedWaiver((b) => ({ ...b, segments: `${b.segments}|changed` }));
    const r = await resend(k.contractId, w.id);
    expect(r.ok, r.message).toBe(true);
    expect(await db.ladWaiver.count({ where: { decisionId: w.decisionId } })).toBe(2);
  });
});
