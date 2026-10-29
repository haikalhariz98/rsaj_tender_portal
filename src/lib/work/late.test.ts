import { describe, expect, it } from "vitest";

import { todayIn } from "@/lib/dates";

import { latenessWords } from "./labels";
import { lateness } from "./late";

/** Lateness (W-9, WS-19): read against the organisation's today, never stored, never judged without a time zone. */

const TODAY = "2026-11-05";

describe("lateness", () => {
  it("due yesterday reads late by one day; due today and tomorrow do not", () => {
    expect(lateness("2026-11-04", "IN_PROGRESS", TODAY)).toEqual({ state: "LATE", days: 1 });
    expect(lateness("2026-11-05", "IN_PROGRESS", TODAY)).toEqual({ state: "DUE" });
    expect(lateness("2026-11-06", "TO_DO", TODAY)).toEqual({ state: "DUE" });
    expect(lateness("2026-10-31", "IN_REVIEW", TODAY)).toEqual({ state: "LATE", days: 5 });
  });

  it("Done and Cancelled are never late", () => {
    expect(lateness("2026-01-01", "DONE", TODAY)).toEqual({ state: "DUE" });
    expect(lateness("2026-01-01", "CANCELLED", TODAY)).toEqual({ state: "DUE" });
  });

  it("no due date is NO_DUE, with or without a today", () => {
    expect(lateness(null, "TO_DO", TODAY)).toEqual({ state: "NO_DUE" });
    expect(lateness(null, "TO_DO", null)).toEqual({ state: "NO_DUE" });
  });

  it("with no time zone an open item with a due date is NOT_JUDGED, however old the date (WS-19)", () => {
    expect(lateness("2020-01-01", "TO_DO", null)).toEqual({ state: "NOT_JUDGED" });
  });

  it("23:59 and 00:00 in Kuala Lumpur fall on two days: an item due on the first is late at the second", () => {
    const tz = "Asia/Kuala_Lumpur";
    const before = todayIn(new Date("2026-11-04T15:59:00.000Z"), tz); // 23:59 on 4 Nov in KL
    const after = todayIn(new Date("2026-11-04T16:00:00.000Z"), tz); // 00:00 on 5 Nov in KL
    expect([before, after]).toEqual(["2026-11-04", "2026-11-05"]);
    expect(lateness("2026-11-04", "TO_DO", before)).toEqual({ state: "DUE" });
    expect(lateness("2026-11-04", "TO_DO", after)).toEqual({ state: "LATE", days: 1 });
    // The same instants read in UTC would both be 4 Nov: the zone decides, and with none set there is no today.
    expect(todayIn(new Date("2026-11-04T16:00:00.000Z"), null)).toBeNull();
  });

  it("reads as the screen says it, and says nothing unless late", () => {
    expect(latenessWords({ state: "LATE", days: 1 })).toBe("1 day late");
    expect(latenessWords({ state: "LATE", days: 2 })).toBe("2 days late");
    for (const state of ["DUE", "NO_DUE", "NOT_JUDGED"] as const) expect(latenessWords({ state })).toBeNull();
  });
});
