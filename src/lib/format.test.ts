import { describe, expect, it } from "vitest";

import { boundaryOperatorFor, inBand } from "./authority/resolve";
import { formatDate, formatOrgDateTime, formatOrgDay, formatRouteBand } from "./format";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

describe("a timestamp on the organisation's day (ruling BD-32)", () => {
  // 20:00 UTC on 30 September is already 1 October in Kuala Lumpur.
  const late = new Date("2026-09-30T20:00:00.000Z");

  it("reads the day in the organisation's zone", () => {
    expect(formatOrgDay(late, "Asia/Kuala_Lumpur")).toMatch(/^01 Oct 2026$/);
  });

  it("marks the day as UTC, zone not set, rather than passing UTC off as the organisation's day", () => {
    const shown = formatOrgDay(late, null);
    expect(shown).toMatch(/^30 Sept? 2026 \(UTC — time zone not set\)$/);
  });

  it("shows a dash for no timestamp", () => {
    expect(formatOrgDay(null, null)).toBe("—");
  });
});

describe("a day, as every screen writes it", () => {
  it("two-digit day, three-letter month — September is Sep, never the locale's Sept", () => {
    expect(formatDate("2026-09-24")).toBe("24 Sep 2026");
    expect(formatDate(new Date("2026-11-02T00:00:00Z"))).toBe("02 Nov 2026");
    expect(formatDate("2026-01-31")).toBe("31 Jan 2026");
  });
  it("nothing, or no valid date, reads as a dash", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
  it("a timestamp's organisation day uses the same format", () => {
    expect(formatOrgDay(new Date("2026-09-01T03:00:00Z"), "Asia/Kuala_Lumpur")).toBe("01 Sep 2026");
  });
});

describe("an instant with its time, on the organisation's clock", () => {
  it("20:00 UTC on 30 September is 04:00 on 1 October in Kuala Lumpur", () => {
    expect(formatOrgDateTime(new Date("2026-09-30T20:00:00Z"), "Asia/Kuala_Lumpur")).toBe("01 Oct 2026 · 04:00");
  });
  it("with no zone set it is UTC, and says so", () => {
    expect(formatOrgDateTime(new Date("2026-09-30T20:00:00Z"), null)).toBe("30 Sep 2026 · 20:00 (UTC — time zone not set)");
    expect(formatOrgDateTime(null, null)).toBe("—");
  });
});

describe("the date in English, whatever argument is passed (founder, 2026-10-19: English only)", () => {
  const late = new Date("2026-09-30T20:00:00Z");

  it("English is unchanged, and an explicit en equals no argument", () => {
    expect(formatDate("2026-10-05", "en")).toBe("05 Oct 2026");
    expect(formatOrgDay(late, null, "en")).toBe("30 Sep 2026 (UTC — time zone not set)");
    for (const day of ["2026-01-31", "2026-03-05", "2026-05-05", "2026-08-05", "2026-10-05", "2026-12-05"]) {
      expect(formatDate(day, "en")).toBe(formatDate(day));
    }
    expect(formatOrgDateTime(late, null, "en")).toBe(formatOrgDateTime(late, null));
    expect(formatOrgDateTime(late, "Asia/Kuala_Lumpur", "en")).toBe(formatOrgDateTime(late, "Asia/Kuala_Lumpur"));
  });
});

describe("a route's band, from its pinned rule and stored boundary operator (FR-APR-019, ruling R4)", () => {
  // Worked example: the boundary is RM300,000. Two rules meet there — (RM50,000,
  // RM300,000] and (RM300,000, —) — and both follow the switch. Whether a requisition of
  // exactly RM300,000 sits in the lower or the upper band is the customer's setting.
  const policy = (boundaryInclusive: boolean) => ({ boundaryValue: 300_000, boundaryInclusive, quotationFloor: 15_000, tenderFloor: 300_000, requisitionBoundary: 50_000, currency: "MYR" });
  const lower = { minValue: 50_000, maxValue: 300_000, contractValueMin: null, contractValueMax: null, followsBoundarySwitch: true };
  const upper = { minValue: 300_000, maxValue: null, contractValueMin: null, contractValueMax: null, followsBoundarySwitch: true };
  const text = (rule: typeof lower | typeof upper, inclusive: boolean) =>
    formatRouteBand({ min: rule.minValue == null ? null : String(rule.minValue), max: rule.maxValue == null ? null : String(rule.maxValue) }, { value: "300000.00", operator: boundaryOperatorFor(rule, policy(inclusive)) });

  it("inclusive (a value exactly on the boundary stays below): the lower band runs up to and including it, the upper starts above it", () => {
    expect(text(lower, true)).toBe("More than RM50,000 and up to and including RM300,000");
    expect(text(upper, true)).toBe("More than RM300,000");
  });

  it("not inclusive (a value exactly on the boundary moves up): the lower band ends below it, the upper starts at it", () => {
    expect(text(lower, false)).toBe("More than RM50,000 and below RM300,000");
    expect(text(upper, false)).toBe("At least RM300,000");
  });

  it("says what the engine does with a value exactly on the boundary, under both settings", () => {
    for (const inclusive of [true, false]) {
      const p = policy(inclusive);
      const inLower = inBand(300_000, lower.minValue, lower.maxValue, p, true);
      const inUpper = inBand(300_000, upper.minValue, upper.maxValue, p, true);
      expect(inLower).toBe(inclusive);
      expect(inUpper).toBe(!inclusive);
      // The words agree: the band that holds RM300,000 is the one whose text includes it.
      expect(/up to and including RM300,000$/.test(text(lower, inclusive))).toBe(inLower);
      expect(/^At least RM300,000/.test(text(upper, inclusive))).toBe(inUpper);
    }
  });

  it("an edge off the boundary is always (min, max], whatever the operator", () => {
    expect(formatRouteBand({ min: "500.00", max: "50000.00" }, { value: "300000.00", operator: "GTE" })).toBe("More than RM500 and up to and including RM50,000");
    expect(formatRouteBand({ min: null, max: "500" }, { value: "300000", operator: null })).toBe("Up to and including RM500");
  });

  it("no edges reads as any value; sen are kept exactly", () => {
    expect(formatRouteBand({ min: null, max: null }, { value: null, operator: null })).toBe("Any value");
    expect(formatRouteBand({ min: "0.01", max: null }, { value: null, operator: null })).toBe("More than RM0.01");
  });

  it("an edge on the stored boundary with no operator recorded says which band holds the boundary is not recorded", () => {
    expect(formatRouteBand({ min: "300000", max: null }, { value: "300000", operator: null })).toBe("More than RM300,000 — which band a value of exactly RM300,000 falls in was not recorded");
  });
});
