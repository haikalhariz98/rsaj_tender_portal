import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { activeContract, contractOrg, form, ladDecision, type TestOrg } from "@/lib/test-db/contract.fixture";

/**
 * Close-out stage A review M4: waivers recorded on one decision could add up past its LAD amount (each was compared with the whole amount), and
 * then every later interim was refused. The record (and the send) take the decision's other waivers off the LAD amount first. Here the decision
 * has charged RM300 a day since the day after the date for completion 30 days ago: RM9,000 to today.
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

import { recordLadWaiver, sendLadWaiver } from "@/app/projects/[id]/damages-actions";

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("WVS");
});

const record = (contractId: string, decisionId: string, waived: string) => {
  h.who = o.staff(o.so);
  return recordLadWaiver({ ok: false }, form({ id: contractId, decisionId, waived, waiverLetterRef: "", reason: "Part of the delay was the authority's." }));
};

/// The waiver's matter sent: its route pending, as `sendLadWaiver` leaves it (the route's own acts are tested with the matrix elsewhere).
async function sent(decisionId: string, waived: string) {
  const w = await db.ladWaiver.findFirstOrThrow({ where: { decisionId, waived }, orderBy: { recordedAt: "desc" } });
  await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: w.matterId, domain: "lad_waiver", status: "PENDING", openedAt: new Date() } });
  return w;
}

describe("waivers on one decision never add up past its LAD amount (review M4)", () => {
  // Changed for ruling 4 (code review of close-out stage B, P7, flagged): a waiver recorded and never sent takes nothing, so the first waiver is sent
  // (its route pending) before the second is judged against what is left. The assertions are kept.
  it("a second waiver beyond what is left is refused; one within it is recorded", async () => {
    const k = await activeContract(o);
    const decisionId = await ladDecision(o, k);
    const first = await record(k.contractId, decisionId, "6000.00");
    expect(first.ok, first.message).toBe(true);
    await sent(decisionId, "6000");
    const past = await record(k.contractId, decisionId, "4000.00");
    expect(past.ok).toBe(false);
    expect(past.message).toMatch(/Other waivers on this decision already take RM6,000\.00/);
    expect(await db.ladWaiver.count({ where: { decisionId } })).toBe(1);
    const within = await record(k.contractId, decisionId, "2000.00");
    expect(within.ok, within.message).toBe(true);
    expect(await db.ladWaiver.count({ where: { decisionId } })).toBe(2);
  });
});

// Ruling 4 (code review of close-out stage B, P7) and money test 7: only an applied waiver, an open approved one or one with a pending route takes from
// the decision's LAD amount, at the record, at the send and at the resend.
describe("a waiver recorded and never sent takes nothing (ruling 4)", () => {
  const send = (contractId: string, waiverId: string) => {
    h.who = o.staff(o.so);
    return sendLadWaiver({ ok: false }, form({ id: contractId, waiverId }));
  };
  it("A recorded at the full LAD and never sent; B sent against the full headroom; sending A is then refused WAIVED_PAST_LAD", async () => {
    const k = await activeContract(o);
    const decisionId = await ladDecision(o, k);
    expect((await record(k.contractId, decisionId, "9000.00")).ok).toBe(true);
    const a = await db.ladWaiver.findFirstOrThrow({ where: { decisionId }, orderBy: { recordedAt: "desc" } });
    const b = await record(k.contractId, decisionId, "9000.00");
    expect(b.ok, b.message).toBe(true);
    const bRow = await db.ladWaiver.findFirstOrThrow({ where: { decisionId, id: { not: a.id } } });
    await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: bRow.matterId, domain: "lad_waiver", status: "PENDING", openedAt: new Date() } });
    const r = await send(k.contractId, a.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Other waivers on this decision already take RM9,000\.00/);
  });
  it("a refused or abandoned waiver takes nothing: its amount is free again", async () => {
    const k = await activeContract(o);
    const decisionId = await ladDecision(o, k);
    expect((await record(k.contractId, decisionId, "9000.00")).ok).toBe(true);
    const w = await db.ladWaiver.findFirstOrThrow({ where: { decisionId } });
    await db.approvalInstance.create({ data: { organisationId: o.organisationId, matterKind: "CONTRACT", contractMatterId: w.matterId, domain: "lad_waiver", status: "REJECTED", openedAt: new Date() } });
    expect((await record(k.contractId, decisionId, "9000.00")).ok).toBe(true);
    await db.contractMatter.update({ where: { id: w.matterId }, data: { closedAt: new Date(), closeReason: "Abandoned." } });
    expect((await record(k.contractId, decisionId, "9000.00")).ok).toBe(true);
  });
});
