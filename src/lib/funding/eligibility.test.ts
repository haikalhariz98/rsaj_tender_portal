import { describe, expect, it } from "vitest";

import { eligibilityBlocks, eligibilityOf, inForce } from "./eligibility";

describe("eligibilityOf (SF-02, FS-4)", () => {
  const only = { categoriesRestricted: true, eligibleCategoryCodes: ["WATER", "LAND"] };
  it("only these: a listed category is eligible, another is not, none is missing", () => {
    expect(eligibilityOf(only, "WATER")).toEqual({ state: "ELIGIBLE" });
    expect(eligibilityOf(only, "OFFICE")).toEqual({ state: "NOT_ELIGIBLE", categoryCode: "OFFICE" });
    expect(eligibilityOf(only, null)).toEqual({ state: "CATEGORY_MISSING" });
  });
  it("any category needs no category, and passes without a warning", () => {
    expect(eligibilityOf({ categoriesRestricted: false, eligibleCategoryCodes: [] }, null)).toEqual({ state: "UNRESTRICTED" });
    expect(eligibilityOf({ categoriesRestricted: false, eligibleCategoryCodes: ["WATER"] }, "OFFICE")).toEqual({ state: "UNRESTRICTED" });
  });
  it("not set passes, as not set, whatever the category; its list is never read", () => {
    expect(eligibilityOf({ categoriesRestricted: null, eligibleCategoryCodes: ["WATER"] }, "OFFICE")).toEqual({ state: "NOT_SET" });
    expect(eligibilityOf({ categoriesRestricted: null, eligibleCategoryCodes: [] }, null)).toEqual({ state: "NOT_SET" });
  });
  it("only a missing or ineligible category blocks", () => {
    expect(["ELIGIBLE", "UNRESTRICTED", "NOT_SET", "CATEGORY_MISSING", "NOT_ELIGIBLE"].map((state) => eligibilityBlocks({ state, categoryCode: "X" } as never))).toEqual([false, false, false, true, true]);
  });
  it("a source is in force until the day it is retired", () => {
    const on = new Date("2026-10-28T00:00:00Z");
    expect(inForce({ retiredOn: null }, on)).toBe(true);
    expect(inForce({ retiredOn: new Date("2026-10-29T00:00:00Z") }, on)).toBe(true);
    expect(inForce({ retiredOn: on }, on)).toBe(false);
  });
});
