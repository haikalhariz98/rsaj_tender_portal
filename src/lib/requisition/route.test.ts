import { describe, expect, it } from "vitest";

import type { Matrix } from "@/lib/authority/types";

import { REQ_MATRIX } from "./fixture";
import { resolveRequisitionRoute } from "./route";

const trace = (steps: { roleCode: string; act: string }[]) => steps.map((s) => `${s.roleCode}:${s.act}`);
const route = (value: number, m: Matrix = REQ_MATRIX, extra: Partial<Parameters<typeof resolveRequisitionRoute>[2]> = {}) =>
  resolveRequisitionRoute(m, null, { value, overBudget: false, fundingRouteCode: null, fundingSupersedesAuthority: false, ...extra });

describe("the requisition bands (FR-REQ-009, spec examples)", () => {
  it("RM49,999 goes Head of Department (R) then Head of Division (A)", () => {
    expect(trace(route(49_999).resolution.chain)).toEqual(["HOD_DEPT:R", "HOD_DIV:A"]);
  });

  it("RM300,001 goes HoDept (P), HoDiv (R), Functional Director (MR), CEO (A)", () => {
    expect(trace(route(300_001).resolution.chain)).toEqual(["HOD_DEPT:P", "HOD_DIV:R", "FD:MR", "CEO:A"]);
  });

  it.each([
    [500, "REQ_UPTO_500", "HOD_DEPT"],
    [500.01, "REQ_UPTO_50K", "HOD_DIV"],
    [50_000, "REQ_UPTO_50K", "HOD_DIV"],
    [50_000.01, "REQ_UPTO_300K", "FD"],
  ])("RM%s resolves to %s, approved by %s", (value, ruleKey, approver) => {
    const r = route(value);
    expect(r.resolution.rule?.ruleKey).toBe(ruleKey);
    expect(r.resolution.approverCode).toBe(approver);
    expect(r.faults).toEqual([]);
  });

  it("RM300,000.00 goes to the Functional Director under either boundary setting (ruling OD-4)", () => {
    for (const boundaryInclusive of [true, false]) {
      const m = { ...REQ_MATRIX, policy: { ...REQ_MATRIX.policy, boundaryInclusive } };
      const r = route(300_000, m);
      expect(r.resolution.approverCode).toBe("FD");
      expect(r.resolution.boundaryOperator).toBe("GT");
    }
  });
});

describe("over budget (FR-REQ-008)", () => {
  it("routes on the over-budget row: CEO (MR) then the Board (A), never the band", () => {
    const r = route(20_000, REQ_MATRIX, { overBudget: true });
    expect(trace(r.resolution.chain)).toEqual(["CEO:MR", "BOARD:A"]);
    expect(r.resolution.chain.at(-1)?.committeeCode).toBe("BOARD");
  });

  it("cannot be routed without an over-budget row", () => {
    const m = { ...REQ_MATRIX, rules: REQ_MATRIX.rules.filter((x) => x.cond == null) };
    const r = route(20_000, m, { overBudget: true });
    expect(r.faults.map((f) => f.code)).toContain("NO_OVER_BUDGET_ROUTE");
    expect(r.resolution.chain).toEqual([]);
  });
});

describe("a funder's rule set (FR-REQ-006)", () => {
  const funder: Matrix = {
    ...REQ_MATRIX,
    rules: [{ ...REQ_MATRIX.rules[1], ruleKey: "FUND_ANY", minValue: null, maxValue: null, recommenders: [], approverCode: "CEO" }],
  };
  const funded = { fundingRouteCode: "funder", fundingSupersedesAuthority: true };

  it("routes by the funder's chain and says the matrix was superseded", () => {
    const r = resolveRequisitionRoute(REQ_MATRIX, { id: "f1", label: "Funder rules", matrix: funder }, { value: 20_000, overBudget: false, ...funded });
    expect(r.fundingOverrideApplied).toBe(true);
    expect(r.overrideIssue?.id).toBe("f1");
    expect(trace(r.resolution.chain)).toEqual(["CEO:A"]);
    expect(r.warnings.find((w) => w.code === "GOV_OVERRIDE")?.clause).toBe("TEST 1.4");
  });

  it("falls back to the matrix, saying no funder's rule set is issued", () => {
    const r = resolveRequisitionRoute(REQ_MATRIX, null, { value: 20_000, overBudget: false, ...funded });
    expect(r.fundingOverrideApplied).toBe(false);
    expect(r.overrideGap).toBe("NO_OVERRIDE_ISSUE");
    expect(trace(r.resolution.chain)).toEqual(["HOD_DEPT:R", "HOD_DIV:A"]);
    expect(r.warnings.some((w) => w.code === "GOV_OVERRIDE")).toBe(true);
  });

  it("falls back to the matrix, saying the funder's set has no matching rule", () => {
    const empty = { ...funder, rules: [] };
    const r = resolveRequisitionRoute(REQ_MATRIX, { id: "f1", label: "Funder rules", matrix: empty }, { value: 20_000, overBudget: false, ...funded });
    expect(r.overrideGap).toBe("NO_OVERRIDE_RULE");
    expect(r.resolution.approverCode).toBe("HOD_DIV");
  });

  it("is not consulted where the route does not supersede", () => {
    const r = resolveRequisitionRoute(REQ_MATRIX, { id: "f1", label: "Funder rules", matrix: funder }, { value: 20_000, overBudget: false, fundingRouteCode: "opex", fundingSupersedesAuthority: false });
    expect(r.fundingOverrideApplied).toBe(false);
    expect(r.warnings.some((w) => w.code === "GOV_OVERRIDE")).toBe(false);
  });
});

describe("routes that cannot be relied on", () => {
  it("counts every error warning as a fault", () => {
    const m = { ...REQ_MATRIX, rules: REQ_MATRIX.rules.map((x) => (x.ruleKey === "REQ_OVER_300K" ? { ...x, followsBoundarySwitch: null } : x)) };
    expect(route(400_000, m).faults.map((f) => f.code)).toContain("UNROUTABLE");
  });

  it("refuses a value no rule covers", () => {
    const m = { ...REQ_MATRIX, rules: [] };
    expect(route(100, m).faults.length).toBeGreaterThan(0);
  });
});
