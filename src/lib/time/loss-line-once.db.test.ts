import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, form, type TestOrg } from "@/lib/test-db/contract-fixtures";

/**
 * Close-out stage A review M1: one approved loss-and-expense claim named on two lines of one adjustment of the contract sum would be paid twice
 * (the claim's live adjustment is read before either line is written). The raise refuses it, and refuses a loss line written as an omission.
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

import { raiseSumAdjustment } from "@/app/projects/[id]/variation-actions";

let o: TestOrg;
const TYPE = `LOSSTYPE_${randomId()}`;

/// An approved, valued loss-and-expense claim of RM10,000 on a fresh contract.
async function approvedClaim() {
  const k = await activeContract(o, { contractTypeCode: TYPE });
  const matter = await db.contractMatter.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "LOSS_EXPENSE", reference: `LE/${randomId()}`, personId: o.so, recordedAt: new Date() } });
  const route = await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: matter.id, domain: "loss_expense", status: "APPROVED", openedAt: new Date() } });
  await db.contractMatter.update({ where: { id: matter.id }, data: { approvedRouteId: route.id } });
  const claim = await db.lossExpenseClaim.create({ data: { organisationId: o.organisationId, contractId: k.contractId, claimed: "10000.00", valued: "10000.00", basis: "Measured.", valuedOn: new Date(), valuedByPersonId: o.so, matterId: matter.id, personId: o.so, recordedAt: new Date() } });
  return { k, claimId: claim.id };
}

const line = (n: number, claimId: string, direction = "ADDITION", amount = "4000.00") => ({
  [`other${n}Trigger`]: "LOSS_AND_EXPENSE",
  [`other${n}LossClaim`]: claimId,
  [`other${n}Direction`]: direction,
  [`other${n}Amount`]: amount,
  [`other${n}Reference`]: `1.2/${n}`,
  [`other${n}Description`]: "Loss and expense",
  [`other${n}Basis`]: "As valued.",
});

const raise = (contractId: string, fields: Record<string, string>) => {
  h.who = o.staff(o.so);
  return raiseSumAdjustment({ ok: false }, form({ id: contractId, ...fields }));
};

beforeAll(async () => {
  o = await contractOrg("LOSS");
  await db.contractType.create({ data: { organisationId: o.organisationId, code: TYPE, nameEn: "Works (test)", sumAdjustmentTriggers: ["VARIATION", "LOSS_AND_EXPENSE"] } });
});

describe("a loss-and-expense claim is paid on one line (review M1)", () => {
  it("two lines naming the same claim are refused, and nothing is raised", async () => {
    const { k, claimId } = await approvedClaim();
    const r = await raise(k.contractId, { ...line(1, claimId), ...line(2, claimId) });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/on two lines/);
    expect(await db.sumAdjustment.count({ where: { contractId: k.contractId } })).toBe(0);
  });

  it("a loss line written as an omission is refused", async () => {
    const { k, claimId } = await approvedClaim();
    const r = await raise(k.contractId, line(1, claimId, "OMISSION"));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/addition, not an omission/);
  });
});
