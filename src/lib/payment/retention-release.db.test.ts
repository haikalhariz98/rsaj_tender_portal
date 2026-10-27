import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
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
});
