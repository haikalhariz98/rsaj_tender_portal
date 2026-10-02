import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { latestNegotiatedPrice } from "./facts";

/**
 * 6.8 fix R-10: the price a bid is recommended at after negotiation is the one after its latest round
 * by round number, never by when the round was recorded.
 */

const at = (h: number) => new Date(Date.UTC(2026, 9, 2, h));
const m = (round: number, priceAfter: string | null, recordedHour: number, over: Record<string, unknown> = {}) => ({ bidderId: "b1", kind: "NEGOTIATION", round, closedAt: at(recordedHour + 1), openedAt: at(recordedHour), priceAfter, ...over });

describe("the negotiated price (R-10)", () => {
  it("round 2 recorded before round 1 (entered late): round 2's price", () => {
    expect(latestNegotiatedPrice([m(2, "95000.00", 8), m(1, "98000.00", 9)], "b1")).toBe("95000.00");
  });
  it("only closed negotiation rounds with a price, of that bidder", () => {
    expect(latestNegotiatedPrice([m(1, "98000.00", 8), m(2, null, 9), m(3, "90000.00", 10, { closedAt: null })], "b1")).toBe("98000.00");
    expect(latestNegotiatedPrice([m(1, "98000.00", 8, { kind: "CLARIFICATION" }), m(1, "97000.00", 8, { bidderId: "b2" })], "b1")).toBeNull();
  });
  it("the facts read it (source scan)", () => {
    const repo = readFileSync(join(process.cwd(), "src/lib/evaluation/repo.ts"), "utf8");
    expect(repo).toMatch(/const negotiated = latestNegotiatedPrice\(meetings, b\.id\);/);
    expect(repo).not.toMatch(/closedNegotiations\.at\(-1\)/);
  });
});
