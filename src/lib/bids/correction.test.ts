import { describe, expect, it } from "vitest";

import { correctionFaults } from "./correction";
import { CLOSING, exercise, S } from "./fixture";

const env = { kind: "BID" as const, status: "RECEIVED" as const, channel: "COUNTER" as const, markings: "Tender SX/1", receivedByPersonId: "p1" };
const base = { exercise: exercise(), now: new Date(CLOSING.getTime() - 60 * S), envelope: env, change: { markings: "Tender SX/1, closing 17 Nov" }, reason: "Typed short", personActive: true };
const codes = (i: Partial<typeof base>) => correctionFaults({ ...base, ...i }).map((f) => f.code);

describe("a clerical correction (FR-BID-005)", () => {
  it("of the markings, channel or receiving officer before the closing, with a reason", () => {
    expect(codes({})).toEqual([]);
    expect(codes({ change: { channel: "POST" } as never })).toEqual([]);
    expect(codes({ change: { receivedByPersonId: "p2" } as never })).toEqual([]);
  });
  it("after the closing nothing changes", () => expect(codes({ now: new Date(CLOSING.getTime() + 1 * S) })).toEqual(["CORRECTION_CLOSED"]));
  it("needs a reason and a change", () => {
    expect(codes({ reason: " " })).toEqual(["REASON_REQUIRED"]);
    expect(codes({ change: { markings: "Tender SX/1" } })).toEqual(["NOTHING_CHANGED"]);
  });
  it.each(["receivedAt", "sequence", "late", "kind"])("%s in the change is refused by name", (field) => {
    const fs = correctionFaults({ ...base, change: { [field]: "x" } });
    expect(fs.map((f) => f.code)).toEqual(["IMMUTABLE_FIELD"]);
    expect(fs[0].data).toEqual({ field });
  });
  it("never to the box, never on a withdrawn envelope or the estimate", () => {
    expect(codes({ change: { channel: "BOX" } as never })).toEqual(["CHANNEL_NOT_FOR_OFFICER"]);
    expect(codes({ envelope: { ...env, status: "WITHDRAWN" } as never })).toEqual(["WITHDRAWN"]);
    expect(codes({ envelope: { ...env, kind: "COMPANY_ESTIMATE" } as never })).toEqual(["NOT_A_BID"]);
  });
  it("never on an envelope submitted through the supplier portal, nor to the portal's channel (wave 3b, ADR 0036 D12)", () => {
    expect(codes({ envelope: { ...env, channel: "ONLINE", receivedByPersonId: null } as never })).toEqual(["ONLINE_NOT_CORRECTED"]);
    expect(codes({ change: { channel: "ONLINE" } as never })).toEqual(["CHANNEL_NOT_FOR_OFFICER"]);
  });
});
