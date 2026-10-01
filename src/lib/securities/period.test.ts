import { describe, expect, it } from "vitest";

import { addMonths, addPeriod, completionDay, requiredInsuranceEnd } from "./period";

describe("adding periods", () => {
  it("clamps to the month's end: 31 January plus one month is 28 February (spec worked example)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
  });

  it("adds months first, then days", () => {
    expect(addPeriod("2026-01-31", { months: 1, days: 1 })).toBe("2026-03-01");
  });

  it("counts a completion period in weeks as days", () => {
    expect(completionDay("2026-03-01", 2, "WEEKS")).toBe("2026-03-15");
    expect(completionDay("2026-03-01", 24, "MONTHS")).toBe("2028-03-01");
  });
});

describe("how long a policy must run (§8.10)", () => {
  it("24 months, 12 months' defects liability and a 3 months 14 days tail, summed and added once", () => {
    expect(requiredInsuranceEnd("2026-03-01", { n: 24, unit: "MONTHS" }, 12, { months: 3, days: 14 })).toEqual({ state: "SET", day: "2029-06-15" });
  });

  it("the design-and-build tail of 3 months 28 days is its own row", () => {
    expect(requiredInsuranceEnd("2026-03-01", { n: 24, unit: "MONTHS" }, 12, { months: 3, days: 28 })).toEqual({ state: "SET", day: "2029-06-29" });
  });

  it("starting on the 31st, the months are summed and clamped once — never clamp upon clamp", () => {
    // 31 Jan + 1 month completion + 1 month DLP + 1 month tail = 31 Jan + 3 months = 30 Apr.
    expect(requiredInsuranceEnd("2026-01-31", { n: 1, unit: "MONTHS" }, 1, { months: 1, days: 0 })).toEqual({ state: "SET", day: "2026-04-30" });
    // Clamping at each step would give 28 Feb → 28 Mar → 28 Apr.
    expect(addMonths(addMonths(addMonths("2026-01-31", 1), 1), 1)).toBe("2026-04-28");
  });

  it("an unset defects liability period is not zero", () => {
    expect(requiredInsuranceEnd("2026-03-01", { n: 24, unit: "MONTHS" }, null, { months: 3, days: 14 })).toEqual({ state: "NOT_SET", missing: ["DLP"] });
  });

  it("no start day, no tail: not set, naming both", () => {
    expect(requiredInsuranceEnd(null, { n: 24, unit: "MONTHS" }, 0, null)).toEqual({ state: "NOT_SET", missing: ["START", "TAIL"] });
  });
});
