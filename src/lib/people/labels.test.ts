import { describe, expect, it } from "vitest";

import { statusOf, type Delegation } from "./delegation";
import { delegationCeilingText, delegationPeriodText } from "./labels";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const plain = (s: string) => s.replaceAll("\u00a0", " ");

describe("delegationPeriodText", () => {
  it("reads a closed period as two days in the format used everywhere", () => {
    // 65-C1: the end day is exclusive (inForceOn), so the text says it is not included.
    expect(plain(delegationPeriodText({ effectiveFrom: day("2026-09-28"), effectiveTo: day("2026-10-16") }))).toBe("28 Sep 2026 until 16 Oct 2026 (not included)");
  });
  it("a one-day delegation (From D, Ends on D+1) is in force on D only, and its text names D+1 as not included", () => {
    const d: Delegation = { id: "dg1", fromPersonId: "p1", toPersonId: "p2", roleCode: "HOD", capabilityCodes: [], valueCeiling: null, reason: "Leave", reasonMs: "", noSubDelegation: true, effectiveFrom: day("2026-10-05"), effectiveTo: day("2026-10-06") };
    expect(statusOf(d, day("2026-10-04"))).toBe("SCHEDULED");
    expect(statusOf(d, day("2026-10-05"))).toBe("IN_FORCE");
    expect(statusOf(d, day("2026-10-06"))).toBe("ENDED");
    expect(plain(delegationPeriodText(d))).toBe("05 Oct 2026 until 06 Oct 2026 (not included)");
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
