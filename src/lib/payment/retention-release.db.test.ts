import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { loadPayment } from "@/lib/payment/load";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestContract, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * The release of retention through its act, against Postgres (FR-PAY-021; code review of close-out stage B, F1 and the missing money-path tests).
 * Each contract's interims are written as issued (the interim's own raise and issue are tested elsewhere); the CPC and the CMGD likewise. The act
 * reads them as the Payments tab does.
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

import { releaseRetention } from "@/app/projects/[id]/payment-actions";

let o: TestOrg;
let seq = 0;

/// An interim certificate issued from a valuation, holding `main` in retention for the main contractor.
async function issuedInterim(k: TestContract, main: string, valuedOn: string) {
  const r = randomId();
  const cert = await db.certificate.create({
    data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "ISSUED", baselineId: k.baselineId, number: `IPC/${r}`, sequence: ++seq, issuedAt: new Date(), certificateDate: D(valuedOn), openedAt: new Date(), openedOn: D(valuedOn), issueSnapshot: { figures: { lines: [{ key: "retentionMain", value: main }, { key: "retentionNsc", value: "0.00" }, { key: "retentionNs", value: "0.00" }], totals: [] } } },
  });
  await db.interimValuation.create({ data: { organisationId: o.organisationId, contractId: k.contractId, trigger: "VALUATION_DATE", valuationDate: D(valuedOn), status: "RAISED", personId: o.so, certificateId: cert.id, judgedUnder: { version: 1, sequence: seq, released: { MAIN: "0.00", NSC: "0.00", NS: "0.00" }, recoupments: [] }, recordedAt: new Date(), recordedOn: D(valuedOn) } });
  return cert.id;
}

/// The CPC and the CMGD issued, the final inspection recorded: the balance's event reached (MAKING_GOOD).
async function madeGood(k: TestContract) {
  const r = randomId();
  const cert = (kind: "PRACTICAL_COMPLETION" | "MAKING_GOOD_DEFECTS") => db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind, status: "ISSUED", baselineId: k.baselineId, number: `${kind}/${r}`, sequence: 1, issuedAt: new Date(), issueSnapshot: { issuedOn: dayPlus(today(), -5) }, certificateDate: D(dayPlus(today(), -5)), openedAt: new Date(), openedOn: D(dayPlus(today(), -5)) } });
  const pc = await cert("PRACTICAL_COMPLETION");
  await db.practicalCompletion.create({ data: { organisationId: o.organisationId, certificateId: pc.id, contractId: k.contractId, completionDate: D(k.due), possessionTakenOn: D(k.due), inspectedOn: D(k.due), attendees: [], testReasons: "Complete.", dlpMonths: 1, dlpStart: D(k.due), dlpEnd: D(dayPlus(k.due, 30)), personId: o.so, recordedAt: new Date() } });
  const mg = await cert("MAKING_GOOD_DEFECTS");
  await db.makingGood.create({ data: { organisationId: o.organisationId, certificateId: mg.id, contractId: k.contractId, madeGoodOn: D(dayPlus(today(), -6)), finalInspectionOn: D(dayPlus(today(), -6)), personId: o.so, recordedAt: new Date() } });
}

const release = (k: TestContract, which: "RELEASED_FIRST" | "RELEASED_BALANCE", on = today()) => {
  h.who = o.staff(o.so);
  return releaseRetention({ ok: false }, form({ id: k.contractId, release: which, releasedOn: on, note: "", personId: o.so }));
};
const releases = (k: TestContract) => db.retentionRelease.findMany({ where: { contractId: k.contractId }, orderBy: { recordedAt: "asc" } });

beforeAll(async () => {
  o = await contractOrg("RTR");
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, firstReleasePct: "50", firstReleaseProvenance: "ASSUMED", retentionBalanceReleaseAt: "MAKING_GOOD", retentionBalanceReleaseProvenance: "ASSUMED" } });
});

describe("releasing retention through the act", () => {
  it("F1: a first release recorded after the balance is refused, so retention is not paid twice", async () => {
    const k = await activeContract(o, { dueIn: -90, dlpMonths: 1 });
    await issuedInterim(k, "20000.00", dayPlus(today(), -60));
    await madeGood(k);
    const b = await release(k, "RELEASED_BALANCE");
    expect(b.ok, b.message).toBe(true);
    expect((await releases(k)).map((x) => [x.kind, x.main.toString()])).toEqual([["RELEASED_BALANCE", "20000"]]);
    await db.siteRecordsHandover.create({ data: { organisationId: o.organisationId, contractId: k.contractId, recordsSet: "AS_BUILT", handedOverOn: D(today()), toLabel: "Employer", receivedByName: "Clerk", personId: o.so, pinnedVersions: [], recordedAt: new Date() } });
    const first = await release(k, "RELEASED_FIRST");
    expect(first.ok).toBe(false);
    expect(first.message).toMatch(/Balance already released/);
    expect((await releases(k)).length).toBe(1);
  });

  it("money test 2: the balance is refused before the CMGD issues, released after it, and refused a second time", async () => {
    const k = await activeContract(o, { dueIn: -90, dlpMonths: 1 });
    await issuedInterim(k, "15000.00", dayPlus(today(), -60));
    const early = await release(k, "RELEASED_BALANCE");
    expect(early.ok).toBe(false);
    expect(early.message).toMatch(/Certificate of Making Good Defects/);
    await madeGood(k);
    expect((await release(k, "RELEASED_BALANCE")).ok).toBe(true);
    const twice = await release(k, "RELEASED_BALANCE");
    expect(twice.ok).toBe(false);
    expect(twice.message).toMatch(/Balance already released/);
    expect((await releases(k)).length).toBe(1);
  });

  it("money test 3: a balance with no first release releases everything held; one where a later interim holds less than the first took is refused, naming the tier", async () => {
    const all = await activeContract(o, { dueIn: -90, dlpMonths: 1 });
    await issuedInterim(all, "12345.67", dayPlus(today(), -60));
    await madeGood(all);
    expect((await release(all, "RELEASED_BALANCE")).ok).toBe(true);
    expect((await releases(all))[0].main.toString()).toBe("12345.67");

    const less = await activeContract(o, { dueIn: -90, dlpMonths: 1 });
    await issuedInterim(less, "20000.00", dayPlus(today(), -60));
    await db.siteRecordsHandover.create({ data: { organisationId: o.organisationId, contractId: less.contractId, recordsSet: "AS_BUILT", handedOverOn: D(dayPlus(today(), -50)), toLabel: "Employer", receivedByName: "Clerk", personId: o.so, pinnedVersions: [], recordedAt: new Date() } });
    expect((await release(less, "RELEASED_FIRST", dayPlus(today(), -50))).ok).toBe(true);
    await issuedInterim(less, "8000.00", dayPlus(today(), -40));
    await madeGood(less);
    const r = await release(less, "RELEASED_BALANCE");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Main contractor: the latest certificate holds RM\s?2,000\.00 less retention than the first release took/);
    expect((await releases(less)).map((x) => x.kind)).toEqual(["RELEASED_FIRST"]);
  });

  it("money test 4 (ruling 1a): the balance is refused while an interim is in routing or a valuation is open, naming it; a valuation is not dated before a release", async () => {
    const k = await activeContract(o, { dueIn: -90, dlpMonths: 1 });
    await issuedInterim(k, "10000.00", dayPlus(today(), -60));
    await madeGood(k);
    const routing = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "IN_ROUTING", baselineId: k.baselineId, openedAt: new Date(), openedOn: D(dayPlus(today(), -3)) } });
    await db.interimValuation.create({ data: { organisationId: o.organisationId, contractId: k.contractId, trigger: "VALUATION_DATE", valuationDate: D(dayPlus(today(), -3)), status: "RAISED", personId: o.so, certificateId: routing.id, judgedUnder: { version: 1 }, recordedAt: new Date(), recordedOn: D(dayPlus(today(), -3)) } });
    const r = await release(k, "RELEASED_BALANCE");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Finish first: the interim certificate of the valuation of .*, with its routing sheet/);
    await db.certificate.update({ where: { id: routing.id }, data: { status: "VOID", voidedAt: new Date(), voidReason: "Wrong valuation." } });
    expect((await release(k, "RELEASED_BALANCE")).ok).toBe(true);
    // Ruling 1b: an interim after the balance holds again; that is not zeroed, and the card names it, paid on the final certificate.
    await issuedInterim(k, "10600.00", today());
    const { retentionOf } = await import("@/lib/closeout/view");
    expect(retentionOf(await loadPayment(k.contractId)).sinceBalance).toBe(60000n);
  });
});
