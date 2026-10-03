import { describe, expect, it } from "vitest";

import { DAL_FIXTURE } from "./dal-fixture";
import { resolveApproval, rulesTiedWith, specificity } from "./resolve";
import type { Matrix, Rule } from "./types";

/**
 * FR-APR-002 (carried from 6.9 to 6.13 Part A step 1): an authority row may be confined to a contract type
 * (`AuthorityRule.contractTypeCode`, null = any). A row for the matter's type is preferred to one for any type,
 * ranking between a row confined to a method and one confined to a condition; a row for another type never
 * applies. Invented rows, for tests only.
 */

const base = DAL_FIXTURE.rules.find((r) => r.ruleKey === "PAY_100K_TO_500K") ?? DAL_FIXTURE.rules.find((r) => r.domain === "payment")!;
const rule = (over: Partial<Rule>): Rule => ({ ...base, ...over });
const anyType = rule({ ruleKey: "PAY_ANY", contractTypeCode: null, approverCode: "HODIV", recommenders: [], generateCoreChain: false, coreChainReason: "test" });
const works = rule({ ruleKey: "PAY_WORKS", contractTypeCode: "WORKS", approverCode: "FD", recommenders: [], generateCoreChain: false, coreChainReason: "test" });
const m: Matrix = { ...DAL_FIXTURE, rules: [anyType, works] };
const q = { domain: base.domain, method: base.method, value: (base.minValue ?? 0) + 1, contractValue: base.contractValueMin != null ? base.contractValueMin + 1 : null };

describe("the contract-type dimension", () => {
  it("a row for the matter's type is preferred to one for any type", () => {
    expect(resolveApproval(m, { ...q, contractTypeCode: "WORKS" }).rule?.ruleKey).toBe("PAY_WORKS");
  });
  it("a row for another type never applies; the row for any type does", () => {
    expect(resolveApproval(m, { ...q, contractTypeCode: "SUPPLY" }).rule?.ruleKey).toBe("PAY_ANY");
  });
  it("a matter with no type takes only rows for any type", () => {
    expect(resolveApproval(m, q).rule?.ruleKey).toBe("PAY_ANY");
    expect(resolveApproval({ ...m, rules: [works] }, q).rule).toBeNull();
  });
  it("ranks between a method and a condition, and leaves every earlier ordering as it was", () => {
    const at = (r: Partial<Rule>) => specificity(rule({ contractValueMin: null, contractValueMax: null, pctMin: null, pctMax: null, minValue: null, maxValue: null, method: null, cond: null, contractTypeCode: null, isGap: false, ...r }));
    expect(at({ method: "tender" })).toBeGreaterThan(at({ contractTypeCode: "WORKS" }));
    expect(at({ contractTypeCode: "WORKS" })).toBeGreaterThan(at({ cond: "x" }));
    expect(at({ minValue: 1 })).toBeGreaterThan(at({ method: "tender", contractTypeCode: "WORKS", cond: "x" }));
    expect(at({ isGap: true, contractValueMin: 1, pctMin: "1", minValue: 1, method: "m", contractTypeCode: "T", cond: "c" })).toBeLessThan(at({}));
  });
  it("two rows tie only for the same type", () => {
    const sameBand = rule({ ruleKey: "PAY_WORKS_2", contractTypeCode: "WORKS" });
    expect(rulesTiedWith(sameBand, [works]).map((r) => r.ruleKey)).toEqual(["PAY_WORKS"]);
    expect(rulesTiedWith(rule({ ruleKey: "PAY_SUPPLY", contractTypeCode: "SUPPLY" }), [works])).toEqual([]);
  });
  it("the worked examples' fixture names no type, so every printed route is as it was", () => {
    expect(DAL_FIXTURE.rules.every((r) => r.contractTypeCode == null)).toBe(true);
  });
});
