import { describe, expect, it } from "vitest";

import { clockTimeIn, dayPlus, daysFrom, instantAt, isoWeekday } from "./dates";

/// 6.5: the instant a closing day and time names in the organisation's zone, and day counting.
describe("instantAt", () => {
  it("14:30 on 17 November 2026 in Kuala Lumpur is 06:30 UTC", () => {
    expect(instantAt("2026-11-17", "14:30", "Asia/Kuala_Lumpur")?.toISOString()).toBe("2026-11-17T06:30:00.000Z");
  });
  it("a null zone gives null, never UTC", () => {
    expect(instantAt("2026-11-17", "14:30", null)).toBeNull();
  });
  it("a day or a time that is not one gives null", () => {
    expect(instantAt("2026-11-31", "14:30", "Asia/Kuala_Lumpur")).toBeNull();
    expect(instantAt("2026-11-17", "24:00", "Asia/Kuala_Lumpur")).toBeNull();
    expect(instantAt("2026-11-17", "2:30", "Asia/Kuala_Lumpur")).toBeNull();
  });
  it("reads back on the zone's clock", () => {
    const t = instantAt("2026-11-17", "14:30", "Asia/Kuala_Lumpur")!;
    expect(clockTimeIn(t, "Asia/Kuala_Lumpur")).toBe("14:30");
    expect(clockTimeIn(t, null)).toBeNull();
  });
  it("follows a zone with summer time on both sides of the change", () => {
    expect(instantAt("2026-07-01", "14:30", "Europe/London")?.toISOString()).toBe("2026-07-01T13:30:00.000Z");
    expect(instantAt("2026-12-01", "14:30", "Europe/London")?.toISOString()).toBe("2026-12-01T14:30:00.000Z");
  });
});

describe("counting days", () => {
  it("Tuesday 3 November 2026 to Tuesday 17 November is 14 days; the 16th is 13", () => {
    expect(daysFrom("2026-11-03", "2026-11-17")).toBe(14);
    expect(daysFrom("2026-11-03", "2026-11-16")).toBe(13);
    expect(dayPlus("2026-11-03", 14)).toBe("2026-11-17");
    expect(dayPlus("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("ISO weekdays: 3 November 2026 is a Tuesday, 21 November a Saturday, 22 November a Sunday", () => {
    expect(isoWeekday("2026-11-03")).toBe(2);
    expect(isoWeekday("2026-11-21")).toBe(6);
    expect(isoWeekday("2026-11-22")).toBe(7);
  });
});
