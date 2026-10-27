import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Returning a security through its act, against Postgres (CO-7; code review of close-out stage B, F4 and money test 8). The CPC and the CMGD are
 * written as issued (their own acts are tested in completion-flow.db.test.ts); the act reads them as the Completion tab does.
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

import { returnSecurity } from "@/app/projects/[id]/closeout-actions";

let o: TestOrg;
let k: TestContract;
const issuedOn = dayPlus(today(), -5);

const security = (kind: "PERFORMANCE_BOND" | "ADVANCE_PAYMENT_GUARANTEE" | "DESIGN_GUARANTEE_BOND", f: "BANK_GUARANTEE" | "CASH") =>
  db.securityInstrument.create({ data: { contractId: k.contractId, kind, form: f, instrumentRef: `SEC-${randomId()}`, value: "10000.00", effectiveFrom: D(dayPlus(today(), -400)), status: "VERIFIED", lodgedOn: D(dayPlus(today(), -400)) } });
const ret = (securityId: string, extra: Record<string, string> = {}) => {
  h.who = o.staff(o.so);
  return returnSecurity({ ok: false }, form({ id: k.contractId, securityId, returnedOn: today(), officialReceiptRef: "", note: "", ...extra }));
};

beforeAll(async () => {
  o = await contractOrg("SRT");
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, retentionBalanceReleaseAt: "MAKING_GOOD", retentionBalanceReleaseProvenance: "ASSUMED", performanceBondReleaseAt: "MAKING_GOOD", performanceBondReleaseProvenance: "ASSUMED" } });
  k = await activeContract(o, { dueIn: -90, dlpMonths: 1, status: "MAKING_GOOD_COMPLETE" });
  const r = randomId();
  const cert = (kind: "PRACTICAL_COMPLETION" | "MAKING_GOOD_DEFECTS") => db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind, status: "ISSUED", baselineId: k.baselineId, number: `${kind}/${r}`, sequence: 1, issuedAt: new Date(), issueSnapshot: { issuedOn }, certificateDate: D(issuedOn), openedAt: new Date(), openedOn: D(issuedOn) } });
  const pc = await cert("PRACTICAL_COMPLETION");
  await db.practicalCompletion.create({ data: { organisationId: o.organisationId, certificateId: pc.id, contractId: k.contractId, completionDate: D(k.due), possessionTakenOn: D(k.due), inspectedOn: D(k.due), attendees: [], testReasons: "Complete.", dlpMonths: 1, dlpStart: D(k.due), dlpEnd: D(dayPlus(k.due, 30)), personId: o.so, recordedAt: new Date() } });
  const mg = await cert("MAKING_GOOD_DEFECTS");
  await db.makingGood.create({ data: { organisationId: o.organisationId, certificateId: mg.id, contractId: k.contractId, madeGoodOn: D(dayPlus(today(), -6)), finalInspectionOn: D(dayPlus(today(), -6)), personId: o.so, recordedAt: new Date() } });
});

describe("returning a security through the act", () => {
  it("F4: a return the CMGD authorises is not dated before the CMGD's issue", async () => {
    const bond = await security("PERFORMANCE_BOND", "BANK_GUARANTEE");
    const early = await ret(bond.id, { returnedOn: dayPlus(issuedOn, -1) });
    expect(early.ok).toBe(false);
    expect(early.message).toMatch(/before the certificate of making good defects was issued/);
    const r = await ret(bond.id, { returnedOn: issuedOn });
    expect(r.ok, r.message).toBe(true);
  });

  it("money test 8: a cash security without its official receipt is refused, and returned with it", async () => {
    const cash = await security("PERFORMANCE_BOND", "CASH");
    const r = await ret(cash.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/official receipt/);
    expect((await ret(cash.id, { officialReceiptRef: "OR-123" })).ok).toBe(true);
    expect((await db.securityRelease.findUniqueOrThrow({ where: { securityId: cash.id } })).officialReceiptRef).toBe("OR-123");
  });

  it("money test 8: an advance payment guarantee whose advance is not recouped is refused", async () => {
    const apg = await security("ADVANCE_PAYMENT_GUARANTEE", "BANK_GUARANTEE");
    const c = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "ADVANCE_PAYMENT", status: "ISSUED", baselineId: k.baselineId, number: `AP/${randomId()}`, sequence: 1, issuedAt: new Date(), issueSnapshot: {}, openedAt: new Date(), openedOn: D(dayPlus(today(), -300)) } });
    await db.advancePayment.create({ data: { organisationId: o.organisationId, contractId: k.contractId, party: "MAIN", amount: "50000.00", securityId: apg.id, certificateId: c.id, appliedOn: D(dayPlus(today(), -300)), personId: o.so, judgedUnder: {}, recordedAt: new Date() } });
    const r = await ret(apg.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/advance is not fully recouped/);
    expect(await db.securityRelease.count({ where: { securityId: apg.id } })).toBe(0);
  });

  it("money test 8: the design guarantee bond survives the close and is not returned here", async () => {
    const dgb = await security("DESIGN_GUARANTEE_BOND", "BANK_GUARANTEE");
    const r = await ret(dgb.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/design guarantee bond survives the close/);
  });
});
