import { describe, expect, it } from "vitest";

import { parseSen, senToDecimalString } from "@/lib/money";

import { waterfall, type WaterfallParty } from "./waterfall";

/// FR-PAY-015; §8.4; OD-A4 A (the tier's total due as the denominator, ASSUMED). FIXTURE figures (the plan's).
const s = parseSen;
const p = (id: string, tier: WaterfallParty["tier"], due: string): WaterfallParty => ({ id, tier, due: s(due) });
const paid = (w: ReturnType<typeof waterfall>) => Object.fromEntries(w.allocations.map((a) => [a.id, senToDecimalString(a.paid)]));

describe("the payment waterfall", () => {
  it("recommended 50,000.00, NSC due 40,000.00, NS due 20,000.00 → 33,333.33 / 16,666.67 (the shares sum to the pot)", () => {
    const w = waterfall(s("50000.00"), [p("nsc", "NOMINATED", "40000.00"), p("ns", "NOMINATED", "20000.00")], "LARGEST_REMAINDER");
    expect(paid(w)).toEqual({ nsc: "33333.33", ns: "16666.67" });
    expect(w.allocations.reduce((a, x) => a + x.paid, 0n)).toBe(s("50000.00"));
    expect(w.contractor).toBe(0n);
    expect(w.sufficient).toBe(false);
    expect(senToDecimalString(w.nominatedDue)).toBe("60000.00");
    expect(w.remainderSen).toBe(1n);
  });
  it("the first-party rule gives the sen left over to the first party", () => {
    expect(paid(waterfall(s("50000.00"), [p("nsc", "NOMINATED", "40000.00"), p("ns", "NOMINATED", "20000.00")], "FIRST_PARTY"))).toEqual({ nsc: "33333.34", ns: "16666.66" });
  });
  it("the remainder rule unset: a split that leaves a sen is refused (NOT_SET); an exact split needs no rule", () => {
    expect(waterfall(s("50000.00"), [p("a", "NOMINATED", "40000.00"), p("b", "NOMINATED", "20000.00")], null).faults.map((f) => f.code)).toEqual(["REMAINDER_RULE_NOT_SET"]);
    const exact = waterfall(s("30000.00"), [p("a", "NOMINATED", "40000.00"), p("b", "NOMINATED", "20000.00")], null);
    expect(exact.faults).toEqual([]);
    expect(paid(exact)).toEqual({ a: "20000.00", b: "10000.00" });
  });
  it("100,000.00 with an assignee due 30,000.00 → the tier paid, the assignee 30,000.00, the contractor 10,000.00", () => {
    const w = waterfall(s("100000.00"), [p("nsc", "NOMINATED", "40000.00"), p("ns", "NOMINATED", "20000.00"), p("asg", "ASSIGNEE", "30000.00")], null);
    expect(paid(w)).toEqual({ nsc: "40000.00", ns: "20000.00", asg: "30000.00" });
    expect(senToDecimalString(w.contractor)).toBe("10000.00");
    expect(w.sufficient).toBe(true);
  });
  it("assignees in turn, each up to its due, after the nominated tier", () => {
    const w = waterfall(s("70000.00"), [p("nsc", "NOMINATED", "60000.00"), p("a1", "ASSIGNEE", "8000.00"), p("a2", "ASSIGNEE", "5000.00")], null);
    expect(paid(w)).toEqual({ nsc: "60000.00", a1: "8000.00", a2: "2000.00" });
    expect(w.contractor).toBe(0n);
  });
  it("nothing to pay is refused; a party with nothing due takes nothing", () => {
    expect(waterfall(s("-1.00"), [], null).faults.map((f) => f.code)).toEqual(["NOTHING_TO_PAY"]);
    expect(senToDecimalString(waterfall(s("100.00"), [], null).contractor)).toBe("100.00");
  });
  it("property: the allocations and the contractor always sum to the pot (seeded)", () => {
    let seed = 7;
    const r = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    for (let k = 0; k < 300; k++) {
      const parties = Array.from({ length: 1 + r(4) }, (_, n) => ({ id: `p${n}`, tier: (r(3) === 0 ? "ASSIGNEE" : "NOMINATED") as WaterfallParty["tier"], due: BigInt(r(5_000_000)) }));
      const w = waterfall(BigInt(r(8_000_000)), parties, "LARGEST_REMAINDER");
      expect(w.allocations.reduce((a, x) => a + x.paid, 0n) + w.contractor).toBe(w.pot);
      for (const a of w.allocations) expect(a.paid <= a.due).toBe(true);
    }
  });
});
