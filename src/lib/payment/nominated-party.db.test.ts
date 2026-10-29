import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { randomId } from "@/lib/test-db/auth-fixtures";
import { activeContract, contractOrg, D, form, today, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage C review, ruling 4, the interim gap, through `raiseInterimCertificate` against Postgres: a valuation whose nominated
 * sub-contractors' tier has value, with no live nominated sub-contractor on the contract (its party retired since its line was recorded), is refused
 * NOMINATED_PARTY_NOT_RECORDED by name, never paid to the main contractor; with the party live again it raises.
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

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("NPR");
  const templateId = (await db.documentTemplate.create({ data: { organisationId: o.organisationId, code: `ipc_${randomId()}`, nameEn: "Interim (test)", formCode: "IPC", bodyEn: "Certificate {{certificate.number}}.", bodyVersion: 1 } })).id;
  await db.certificateKindSetting.create({ data: { organisationId: o.organisationId, kind: "INTERIM_PAYMENT", templateId, routingTypeId: null, provenance: "ASSUMED" } });
  await db.postAwardPolicy.create({ data: { organisationId: o.organisationId, waterfallRemainder: "LARGEST_REMAINDER", waterfallProvenance: "ASSUMED" } });
});

describe("the interim's nominated tier with no party recorded (ruling 4)", () => {
  it("is refused by name while the tier's only party is retired, and raises once it is live", async () => {
    const k = await activeContract(o, { dueIn: 60 });
    await db.contractBaseline.update({ where: { id: k.baselineId }, data: { retentionApplies: true, retentionPercent: "5", retentionCapPercent: "5", retentionSource: "ENTERED", firstInterimMinimum: "0", subsequentInterimMinimum: "0" } });
    const party = await db.contractParty.create({ data: { organisationId: o.organisationId, contractId: k.contractId, kind: "NOMINATED_SUBCONTRACTOR", name: "Syarikat Elektrik NSC", recordedAt: new Date() } });
    const v = await db.interimValuation.create({ data: { organisationId: o.organisationId, contractId: k.contractId, trigger: "CLAIM", triggerDate: D(today()), valuationDate: D(today()), status: "OPEN", mainWorks: "100000.00", jointOn: D(today()), method: "Measured.", contractorAnswer: "AGREED", personId: o.so, recordedAt: new Date(), recordedOn: D(today()) } });
    await db.partyLine.create({ data: { organisationId: o.organisationId, valuationId: v.id, partyId: party.id, value: "30000.00", due: "27000.00", submittedOn: D(today()), recordedAt: new Date() } });
    await db.contractParty.update({ where: { id: party.id }, data: { retiredOn: new Date(), retireReason: "Left the contract (test)." } });
    h.who = o.staff(o.so);
    const refused = await raiseInterimCertificate({ ok: false }, form({ id: k.contractId, valuationId: v.id }));
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain("There is value for the nominated sub-contractors, but none is recorded on the contract");
    expect((await db.interimValuation.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("OPEN");
    await db.contractParty.update({ where: { id: party.id }, data: { retiredOn: null, retireReason: "" } });
    const raised = await raiseInterimCertificate({ ok: false }, form({ id: k.contractId, valuationId: v.id }));
    expect(raised.ok, raised.message).toBe(true);
  });
});
