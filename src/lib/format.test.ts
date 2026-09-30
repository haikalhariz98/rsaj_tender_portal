import { describe, expect, it } from "vitest";

import { formatOrgDay } from "./format";

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
