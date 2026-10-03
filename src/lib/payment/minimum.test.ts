import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { minimumFaults, minimumReading } from "./minimum";

/// FR-PAY-013. The minimums are read from the baseline (6.12 computed the first once); FIXTURE figures only.
const s = parseSen;
const first = (min: string | null, gross: string) => minimumReading({ first: true, firstMinimum: min == null ? null : s(min), subsequentMinimum: null, gross: s(gross), carryForward: 0n });

describe("the first interim minimum", () => {
  it("baseline minimum 1,000.00 (BWV 293,473.70): 999.99 withheld, 1,000.00 passes", () => {
    expect(first("1000.00", "999.99").state).toBe("BELOW");
    expect(first("1000.00", "1000.00").state).toBe("MET");
  });
  it("baseline minimum 850.00 (BWV 8,500.00): 849.99 withheld", () => {
    expect(first("850.00", "849.99").state).toBe("BELOW");
    expect(first("850.00", "850.00").state).toBe("MET");
  });
  it("below: held to the next cycle (an exit), and the figures are said", () => {
    expect(minimumFaults(first("1000.00", "999.99"))).toEqual([{ code: "BELOW_MINIMUM", level: "block", data: { minimum: "100000", value: "99999", first: "yes" } }]);
  });
  it("unset: NOT_SET, never a default", () => {
    expect(first(null, "5000.00")).toEqual({ state: "NOT_SET", field: "firstInterimMinimum" });
  });
});

describe("a later certificate's minimum", () => {
  const later = (min: string | null, cf: string) => minimumReading({ first: false, firstMinimum: s("1000.00"), subsequentMinimum: min == null ? null : s(min), gross: s("999999.00"), carryForward: s(cf) });
  it("judged on what it carries forward", () => {
    expect(later("5000.00", "4999.99").state).toBe("BELOW");
    expect(later("5000.00", "5000.00").state).toBe("MET");
  });
  it("unset: NOT_SET", () => {
    expect(minimumFaults(later(null, "1.00"))).toEqual([{ code: "MINIMUM_NOT_SET", level: "block", data: { field: "subsequentInterimMinimum" } }]);
  });
});
