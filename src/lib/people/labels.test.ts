import { describe, expect, it } from "vitest";

import { delegationCeilingText, delegationPeriodText } from "./labels";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("delegationPeriodText", () => {
  it("reads a closed period as two days in the format used everywhere", () => {
    expect(delegationPeriodText({ effectiveFrom: day("2026-09-28"), effectiveTo: day("2026-10-16") })).toBe("28 Sep 2026 to 16 Oct 2026");
  });
  it("says an open period has no end date rather than showing a blank end", () => {
    expect(delegationPeriodText({ effectiveFrom: day("2026-09-01"), effectiveTo: null })).toBe("From 01 Sep 2026, no end date");
  });
});

describe("delegationCeilingText", () => {
  it("formats the ceiling as money", () => {
    expect(delegationCeilingText("50000")).toBe("Up to RM50,000");
    expect(delegationCeilingText("1250.50")).toBe("Up to RM1,250.50");
  });
  it("says none is set; it is not a ceiling of zero", () => {
    expect(delegationCeilingText(null)).toBe("No ceiling set");
    expect(delegationCeilingText("0")).toBe("Up to RM0");
  });
});
