import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, ladDecision, today, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage A review M3 (migration 20261209000000_lad_waiver_applied_many): one interim certificate applies every approved waiver it reaches,
 * so two waivers carry the same `appliedOnCertificateId`. The unique index refused the second write (P2002), and every later interim on the contract
 * was refused with it. The raise's own write is `updateMany` per waiver, as here.
 */

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("WVM");
});

async function waiver(contractId: string, decisionId: string) {
  const matter = await db.contractMatter.create({ data: { organisationId: o.organisationId, contractId, kind: "LAD_WAIVER", reference: `WV/${randomId()}`, personId: o.so, recordedAt: new Date() } });
  return db.ladWaiver.create({ data: { organisationId: o.organisationId, matterId: matter.id, decisionId, ladAmount: "3000.00", waived: "1000.00", asOf: D(today()), basis: {}, reason: "Test.", personId: o.so, recordedAt: new Date() } });
}

describe("two waivers applied on one interim (review M3)", () => {
  it("both are written against the one certificate, and the certificate lists both", async () => {
    const k = await activeContract(o);
    const decisionId = await ladDecision(o, k);
    const cert = await db.certificate.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "INTERIM_PAYMENT", status: "DRAFT", baselineId: k.baselineId, openedAt: new Date(), openedOn: D(today()) } });
    const a = await waiver(k.contractId, decisionId);
    const b = await waiver(k.contractId, decisionId);
    for (const w of [a, b]) {
      const done = await db.ladWaiver.updateMany({ where: { id: w.id, appliedOnCertificateId: null }, data: { appliedOnCertificateId: cert.id, appliedAt: new Date() } });
      expect(done.count).toBe(1);
    }
    const read = await db.certificate.findUniqueOrThrow({ where: { id: cert.id }, include: { ladWaiversApplied: { select: { id: true } } } });
    expect(read.ladWaiversApplied.map((w) => w.id).sort()).toEqual([a.id, b.id].sort());
    const [idx] = await db.$queryRaw<{ def: string }[]>`SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'LadWaiver_appliedOnCertificateId_idx'`;
    expect(idx.def).not.toMatch(/UNIQUE/);
  });
});
