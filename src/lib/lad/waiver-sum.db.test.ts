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

import { recordLadWaiver } from "@/app/projects/[id]/damages-actions";

let o: TestOrg;
beforeAll(async () => {
  o = await contractOrg("WVS");
});

const record = (contractId: string, decisionId: string, waived: string) => {
  h.who = o.staff(o.so);
  return recordLadWaiver({ ok: false }, form({ id: contractId, decisionId, waived, waiverLetterRef: "", reason: "Part of the delay was the authority's." }));
};

describe("waivers on one decision never add up past its LAD amount (review M4)", () => {
  it("a second waiver beyond what is left is refused; one within it is recorded", async () => {
    const k = await activeContract(o);
    const decisionId = await ladDecision(o, k);
    const first = await record(k.contractId, decisionId, "6000.00");
    expect(first.ok, first.message).toBe(true);
    const past = await record(k.contractId, decisionId, "4000.00");
    expect(past.ok).toBe(false);
    expect(past.message).toMatch(/Other waivers on this decision already take RM6,000\.00/);
    expect(await db.ladWaiver.count({ where: { decisionId } })).toBe(1);
    const within = await record(k.contractId, decisionId, "2000.00");
    expect(within.ok, within.message).toBe(true);
    expect(await db.ladWaiver.count({ where: { decisionId } })).toBe(2);
  });
});
