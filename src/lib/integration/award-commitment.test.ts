import { describe, expect, it } from "vitest";

import { manualCommitment, matchesFormat } from "./award-commitment";

describe("the manual commitment adapter (INT-05)", () => {
  const ctx = { pattern: "IN\\d{4}\\d{5}", today: "2026-09-30", taken: false };
  it("accepts a number in the configured format", () => {
    expect(manualCommitment.check({ number: "IN202600395", kind: "INDENT", receivedOn: "2026-09-18" }, ctx)).toEqual([]);
  });
  it("refuses a number in another format, a future day and a number already used", () => {
    expect(manualCommitment.check({ number: "IN2026", kind: "INDENT", receivedOn: "2026-10-01" }, { ...ctx, taken: true })).toEqual(["FORMAT", "FUTURE_DATE", "TAKEN"]);
  });
  it("with no format set the number is not checked, and says so", () => {
    expect(matchesFormat("anything", null)).toBeNull();
    expect(manualCommitment.check({ number: "anything", kind: "INDENT", receivedOn: "2026-09-18" }, { ...ctx, pattern: null })).toEqual([]);
  });
});
