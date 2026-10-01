import { describe, expect, it } from "vitest";

import { formatDate, formatOrgDateTime, formatOrgDay } from "./format";

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
