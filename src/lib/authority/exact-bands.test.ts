import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatPercentBand } from "@/lib/format";
import { parseSen } from "@/lib/money";
import { comparePercent, ratioOfPercent } from "@/lib/percent-band";

import { pctBandMatch, resolveApproval, rulesTiedWith } from "./resolve";
import type { Matrix, Policy, Rule } from "./types";

/**
 * ADR 0024 Amendment 1 (6.13 Part A step 1, the rulings' must-fix before the first production caller): the
 * approval engine judges a percentage band on the exact ratio of two amounts, with the issue's boundary switch as
 * the side of an edge (null: EDGE_UNDECIDED). The float `pct` is gone from the query type; the edges load as
 * decimal strings; ties are judged exactly.
 *
 * The rulings' edge cases, each of which a float gets wrong (worked by hand):
 * - RM7,000.00 of RM100,000.00 is exactly 7%; in binary 7000 / 100000 × 100 is 7.000000000000001, above 7.
 * - RM29,000.00 of RM100,000.00 is exactly 29%; in binary 29000 / 100000 × 100 is 28.999999999999996, below 29.
 * - RM21,000.00 of RM300,000.00 is exactly 7%; in binary 21000 / 300000 × 100 is 7.000000000000001, above 7.
 * A sen either side of each edge lands on its side whatever the switch says.
 */

const ratio = (num: string, den: string) => ({ num: parseSen(num), den: parseSen(den) });
const policy = (boundaryInclusive: boolean): Policy => ({ boundaryValue: 300_000, boundaryInclusive, quotationFloor: 15_000, tenderFloor: 300_000, requisitionBoundary: 50_000, currency: "MYR" });
const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey">): Rule => ({
  domain: "vo",
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: null,
  labelEn: r.ruleKey,
  labelMs: null,
  proposerCode: null,
  approverCode: null,
  committeeCode: null,
  committeeAct: null,
  nonDelegable: false,
  approverMandatory: false,
  isGap: false,
  gapNote: null,
  note: "",
  clause: "TEST",
  sortOrder: 0,
  recommenders: [],
  generateCoreChain: false,
  coreChainReason: "test",
  ...r,
});
const roles = Object.fromEntries(["LOW", "HIGH"].map((c) => [c, { code: c, nameEn: c, nameMs: c, isCommittee: false, escalatesToCode: null, selfApprovalEscalatesToCode: null }]));
/// Two bands meeting at `edge`: LOW up to it, HIGH from it.
const split = (edge: string, inclusive: boolean): Matrix => ({
  policy: policy(inclusive),
  roles,
  rules: [rule({ ruleKey: "LOW", pctMax: edge, approverCode: "LOW" }), rule({ ruleKey: "HIGH", pctMin: edge, approverCode: "HIGH" })],
});
const approver = (m: Matrix, r: ReturnType<typeof ratio>) => resolveApproval(m, { domain: "vo", pctRatio: r }).approverCode;

describe("the rulings' edge tests: a float lands on the wrong side, the exact ratio does not", () => {
  it("RM7,000.00 / RM100,000.00 at a 7% edge", () => {
    expect((7000 / 100000) * 100 > 7).toBe(true); // what a float would judge
    expect(comparePercent(ratio("7000.00", "100000.00"), "7")).toBe(0);
    expect(approver(split("7", true), ratio("7000.00", "100000.00"))).toBe("LOW");
    expect(approver(split("7", false), ratio("7000.00", "100000.00"))).toBe("HIGH");
  });
  it("RM29,000.00 / RM100,000.00 at a 29% edge", () => {
    expect((29000 / 100000) * 100 < 29).toBe(true); // what a float would judge
    expect(approver(split("29", false), ratio("29000.00", "100000.00"))).toBe("HIGH");
    expect(approver(split("29", true), ratio("29000.00", "100000.00"))).toBe("LOW");
  });
  it("RM21,000.00 / RM300,000.00 at a 7% edge", () => {
    expect((21000 / 300000) * 100 > 7).toBe(true); // what a float would judge
    expect(approver(split("7", true), ratio("21000.00", "300000.00"))).toBe("LOW");
    expect(approver(split("7", false), ratio("21000.00", "300000.00"))).toBe("HIGH");
  });
  it("a sen either side of the edge lands on its side, whatever the switch", () => {
    for (const inclusive of [true, false]) {
      expect(approver(split("7", inclusive), ratio("6999.99", "100000.00"))).toBe("LOW");
      expect(approver(split("7", inclusive), ratio("7000.01", "100000.00"))).toBe("HIGH");
      expect(approver(split("7", inclusive), ratio("20999.99", "300000.00"))).toBe("LOW");
      expect(approver(split("7", inclusive), ratio("21000.01", "300000.00"))).toBe("HIGH");
    }
  });
  it("an edge stored at four places reads as the same edge", () => {
    expect(approver(split("7.0000", true), ratio("7000.00", "100000.00"))).toBe("LOW");
  });
});

describe("the side not decided: EDGE_UNDECIDED (the ruled null reading)", () => {
  it("exactly on an edge is in neither band; off it, the band is the same either way", () => {
    expect(pctBandMatch(ratio("7000.00", "100000.00"), null, "7", null)).toBe("EDGE_UNDECIDED");
    expect(pctBandMatch(ratio("7000.00", "100000.00"), "7", null, null)).toBe("EDGE_UNDECIDED");
    expect(pctBandMatch(ratio("6999.99", "100000.00"), null, "7", null)).toBe("IN");
    expect(pctBandMatch(ratio("7000.01", "100000.00"), null, "7", null)).toBe("OUT");
  });
  it("the route warns as an error, naming the percentage; no band is chosen at the edge", () => {
    // `AuthorityMatrix.boundaryInclusive` is not nullable today (BD-613-5), so an issue cannot reach this; the
    // engine reads it all the same, as the ruling asks.
    const m = { ...split("7", true), policy: { ...policy(true), boundaryInclusive: null as unknown as boolean } };
    const r = resolveApproval(m, { domain: "vo", pctRatio: ratio("7000.00", "100000.00") });
    expect(r.rule).toBeNull();
    expect(r.warnings.find((w) => w.code === "EDGE_UNDECIDED")).toMatchObject({ level: "err", messageEn: expect.stringMatching(/exactly 7%, a band edge/) });
    expect(resolveApproval(m, { domain: "vo", pctRatio: ratio("7000.01", "100000.00") }).approverCode).toBe("HIGH");
  });
  it("a banded rule needs a ratio; an unbanded rule matches without one", () => {
    expect(pctBandMatch(null, null, "7", true)).toBe("OUT");
    expect(pctBandMatch(null, null, null, true)).toBe("IN");
  });
});

describe("two rules tie only where their bands share a value, judged exactly", () => {
  const base = { domain: "vo", method: null, cond: null };
  it("touching bands never tie; overlapping ones do; four places and none read alike", () => {
    const a = rule({ ruleKey: "A", ...base, pctMin: "10", pctMax: "15" });
    const touching = rule({ ruleKey: "B", ...base, pctMin: "15.0000", pctMax: "30" });
    const overlapping = rule({ ruleKey: "C", ...base, pctMin: "14.9999", pctMax: "30" });
    expect(rulesTiedWith(touching, [a])).toEqual([]);
    expect(rulesTiedWith(overlapping, [a]).map((r) => r.ruleKey)).toEqual(["A"]);
  });
});

describe("a typed percentage reads as the exact ratio it states", () => {
  it("12.5% is 125,000 / 1,000,000; 7% equals RM7,000.00 of RM100,000.00", () => {
    expect(ratioOfPercent("12.5")).toEqual({ num: 125_000n, den: 1_000_000n });
    expect(comparePercent(ratioOfPercent("7"), "7")).toBe(0);
    expect(approver(split("7", true), ratioOfPercent("7"))).toBe("LOW");
  });
});

describe("a percentage band says which side its edges fall", () => {
  it("(min, max] reads ≤ and >; [min, max) reads < and ≥", () => {
    expect(formatPercentBand(null, "10.0000", true)).toBe("≤ 10%");
    expect(formatPercentBand("10", null, true)).toBe("> 10%");
    expect(formatPercentBand(null, "10", false)).toBe("< 10%");
    expect(formatPercentBand("10.5000", null, false)).toBe("≥ 10.5%");
    expect(formatPercentBand("5", "10", true)).toBe("5% – 10%");
  });
});

describe("the float path is retired from production (source)", () => {
  const ROOT = path.join(__dirname, "../../..");
  const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
  it("the query type has no float percentage; the rule's edges are strings", () => {
    const t = read("src/lib/authority/types.ts");
    expect(t).not.toMatch(/\bpct\?: number/);
    expect(t).toMatch(/pctRatio\?: ExactRatio \| null/);
    expect(t).toMatch(/pctMin: string \| null;/);
  });
  it("the loader reads the edges as decimal strings, not through num()", () => {
    const l = read("src/lib/authority/load.ts");
    expect(l).toMatch(/pctMin: pctEdge\(r\.pctMin\)/);
    expect(l).not.toMatch(/pctM(in|ax): num\(/);
  });
  it("the resolver has no float band and compares percentages exactly", () => {
    const r = read("src/lib/authority/resolve.ts");
    expect(r).not.toMatch(/export function inPercentBand\(/);
    expect(r).toMatch(/inPercentBandExact\(/);
    expect(r).toMatch(/bandsMeet\(o\.pctMin, o\.pctMax, rule\.pctMin, rule\.pctMax, tenThousandths\)/);
  });
});
