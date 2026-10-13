import { describe, expect, it } from "vitest";

import { RATE_LIMITS, rateRefusalLogged, rateVerdict } from "./limits";

/**
 * Ruling 20w: of a signed-in account's rate refusals, only the first in each rate window writes a SealedAccessEvent; the rest are refused without a row, so one
 * account cannot fill the append-only log (S19).
 */

describe("which rate refusal is logged (20w)", () => {
  it("only the first refusal in a window: the request just over the limit", () => {
    const limit = 10;
    expect(rateRefusalLogged(limit, limit)).toBe(false);
    expect(rateRefusalLogged(limit + 1, limit)).toBe(true);
    expect(rateRefusalLogged(limit + 2, limit)).toBe(false);
    expect(rateRefusalLogged(limit + 50, limit)).toBe(false);
    expect(rateRefusalLogged(1, limit)).toBe(false);
  });

  it("over a window of requests, exactly one refusal is logged, and it is the first one refused", () => {
    const { limit } = RATE_LIMITS["payment-attempt"];
    const now = new Date("2026-11-04T03:00:10Z");
    const refusedAndLogged = Array.from({ length: limit + 25 }, (_, i) => i + 1).filter((count) => rateVerdict("payment-attempt", count, now).limited && rateRefusalLogged(count, limit));
    const firstRefused = Array.from({ length: limit + 25 }, (_, i) => i + 1).find((count) => rateVerdict("payment-attempt", count, now).limited);
    expect(refusedAndLogged).toEqual([firstRefused]);
  });
});
