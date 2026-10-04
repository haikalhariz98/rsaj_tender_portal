import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { rateSegments, splitBySegments } from "./segments";

/** 6.13 Part B run 1b (plan B5 lad/segments.ts; FR-LAD-010): damages by rate segment. Pure. */

const R = parseSen("269.38");
const CPO = parseSen("215.50");

describe("rate segments", () => {
  it("no occupation: one segment at the decision's rate", () => expect(rateSegments(R, null)).toEqual([{ from: null, until: null, rate: R }]));
  it("an unconfirmed occupation changes nothing", () => expect(rateSegments(R, { occupiedOn: "2026-09-10", confirmedRate: null })).toEqual([{ from: null, until: null, rate: R }]));
  it("confirmed: the CNC's rate to the day before occupation, the CPO's confirmed rate from it", () => {
    expect(rateSegments(R, { occupiedOn: "2026-09-10", confirmedRate: CPO })).toEqual([
      { from: null, until: "2026-09-10", rate: R },
      { from: "2026-09-10", until: null, rate: CPO },
    ]);
  });
});

describe("a charged range split by segment (end exclusive)", () => {
  it("one segment", () => expect(splitBySegments("2026-09-01", "2026-10-01", rateSegments(R, null))).toEqual([{ from: "2026-09-01", until: "2026-10-01", rate: R, days: 30 }]));
  it("a range straddling the occupation day splits at it", () => {
    expect(splitBySegments("2026-09-01", "2026-10-01", rateSegments(R, { occupiedOn: "2026-09-10", confirmedRate: CPO }))).toEqual([
      { from: "2026-09-01", until: "2026-09-10", rate: R, days: 9 },
      { from: "2026-09-10", until: "2026-10-01", rate: CPO, days: 21 },
    ]);
  });
  it("an empty range has no segment", () => expect(splitBySegments("2026-09-01", "2026-09-01", rateSegments(R, null))).toEqual([]));
});
