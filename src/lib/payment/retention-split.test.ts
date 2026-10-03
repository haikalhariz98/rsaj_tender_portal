import { describe, expect, it } from "vitest";

import { parseSen, senToDecimalString } from "@/lib/money";
import { ratioOfSen } from "@/lib/securities/money";

import { capShare, retentionHeld, retentionReading, ZERO_TIERS, type Tiers } from "./retention";

/// BD-613-28 as amended (code review run 2): the retention cap shared pro rata, its leftover sen by the payment
/// waterfall's configured rule; no tier ever below nothing or above what it would hold uncapped.
const s = parseSen;
const money = (t: Tiers) => [t.MAIN, t.NSC, t.NS].map(senToDecimalString);

describe("the −1 sen case", () => {
  // Would hold 0.00 / 0.01 / 0.01 against a cap of 0.01: rounding the two nominated shares half up gave 0.01 each,
  // and the main tier "taking the rounding" was left at −0.01.
  const computed: Tiers = { MAIN: 0n, NSC: 1n, NS: 1n };
  it("reproduced under the old rule", () => {
    const nsc = ratioOfSen(computed.NSC, 1n, 2n);
    const ns = ratioOfSen(computed.NS, 1n, 2n);
    expect(1n - nsc - ns).toBe(-1n);
  });
  it("now: the sen goes by the rule, and no tier is below nothing", () => {
    expect(money(capShare(computed, 1n, "LARGEST_REMAINDER").held)).toEqual(["0.00", "0.01", "0.00"]);
    expect(money(capShare(computed, 1n, "FIRST_PARTY").held)).toEqual(["0.00", "0.01", "0.00"]);
    expect(capShare(computed, 1n, null).faults.map((f) => f.code)).toEqual(["RETENTION_REMAINDER_RULE_NOT_SET"]);
  });
});

describe("the leftover sen follow the waterfall's rule", () => {
  const terms = retentionReading({ applies: true, percent: "10", capPercent: "5", source: "AWARD" });
  it("largest remainder: 3,333.33 each against a cap of 5,000.00 → 1,666.67 / 1,666.67 / 1,666.66", () => {
    const h = retentionHeld(terms, s("100000.00"), { MAIN: s("33333.33"), NSC: s("33333.33"), NS: s("33333.34") }, ZERO_TIERS, "LARGEST_REMAINDER");
    expect(money(h.held)).toEqual(["1666.67", "1666.67", "1666.66"]);
    expect(h.faults).toEqual([]);
  });
  it("first party: both sen to the main contractor", () => {
    const h = retentionHeld(terms, s("100000.00"), { MAIN: s("33333.33"), NSC: s("33333.33"), NS: s("33333.34") }, ZERO_TIERS, "FIRST_PARTY");
    expect(money(h.held)).toEqual(["1666.68", "1666.66", "1666.66"]);
  });
  it("unset refuses only when sen are left over", () => {
    expect(retentionHeld(terms, s("100000.00"), { MAIN: s("33333.33"), NSC: s("33333.33"), NS: s("33333.34") }).faults.map((f) => f.code)).toEqual(["RETENTION_REMAINDER_RULE_NOT_SET"]);
    const even = retentionHeld(terms, s("100000.00"), { MAIN: s("60000.00"), NSC: s("30000.00"), NS: s("10000.00") });
    expect(even.faults).toEqual([]);
    expect(money(even.held)).toEqual(["3000.00", "1500.00", "500.00"]);
  });
});

describe("property: over 2,000 seeded splits, every tier 0 ≤ held ≤ computed and the tiers sum to the cap", () => {
  let seed = 20261003n;
  const next = (max: bigint) => {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n;
    return (seed >> 16n) % max;
  };
  it.each(["LARGEST_REMAINDER", "FIRST_PARTY"] as const)("%s", (rule) => {
    for (let k = 0; k < 2000; k++) {
      const scale = [10n, 1000n, 10_000_000n][k % 3];
      const computed: Tiers = { MAIN: next(scale), NSC: next(scale), NS: k % 5 === 0 ? 0n : next(scale) };
      const total = computed.MAIN + computed.NSC + computed.NS;
      if (total < 2n) continue;
      const cap = 1n + next(total - 1n);
      const { held, faults } = capShare(computed, cap, rule);
      expect(faults, JSON.stringify({ computed: String(Object.values(computed)), cap: String(cap) })).toEqual([]);
      for (const t of ["MAIN", "NSC", "NS"] as const) {
        expect(held[t] >= 0n).toBe(true);
        expect(held[t] <= computed[t]).toBe(true);
      }
      expect(held.MAIN + held.NSC + held.NS).toBe(cap);
    }
  });
});
