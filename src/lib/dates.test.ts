import { describe, expect, it } from "vitest";

import { dayIn, dayOf, dayToDate, isDay, isTimeZone, storedDay } from "./dates";

describe("dayIn", () => {
  it("between 00:00 and 08:00 in UTC+8 the local day is already tomorrow's UTC day", () => {
    // 07:30 on 2 March in Kuala Lumpur is 23:30 on 1 March UTC.
    const instant = new Date("2026-03-01T23:30:00Z");
    expect(dayIn(instant, "Asia/Kuala_Lumpur")).toBe("2026-03-02");
    expect(dayIn(instant, null)).toBe("2026-03-01");
  });

  it("agrees with UTC from 08:00 local", () => {
    expect(dayIn(new Date("2026-03-02T00:30:00Z"), "Asia/Kuala_Lumpur")).toBe("2026-03-02");
  });

  it("judges in UTC when no zone is set", () => {
    expect(dayIn(new Date("2026-12-31T23:59:59Z"), null)).toBe("2026-12-31");
  });
});

describe("stored days", () => {
  it("round-trips a calendar date without a zone", () => {
    expect(storedDay(dayToDate("2026-09-30"))).toBe("2026-09-30");
  });
});

describe("isTimeZone", () => {
  it("knows IANA names and refuses others", () => {
    expect(isTimeZone("Asia/Kuala_Lumpur")).toBe(true);
    expect(isTimeZone("Malaysia Time")).toBe(false);
  });
});

describe("greetingAt", () => {
  it("greets by the hour in the organisation's zone, or UTC when unset", async () => {
    const { greetingAt, hourIn } = await import("./dates");
    const instant = new Date("2026-03-01T23:30:00Z"); // 07:30 in Kuala Lumpur
    expect(hourIn(instant, "Asia/Kuala_Lumpur")).toBe(7);
    expect(greetingAt(instant, "Asia/Kuala_Lumpur")).toBe("Good morning");
    expect(greetingAt(instant, null)).toBe("Welcome");
  });
});

describe("todayIn", () => {
  it("is null while the organisation has no zone: unset is not UTC", async () => {
    const { todayIn } = await import("./dates");
    expect(todayIn(new Date("2026-03-01T23:30:00Z"), null)).toBeNull();
    expect(todayIn(new Date("2026-03-01T23:30:00Z"), "Asia/Kuala_Lumpur")).toBe("2026-03-02");
  });
});

describe("isDay: a real calendar day, by the round trip", () => {
  it("accepts real days, the last of each month, and 29 February in a leap year", () => {
    for (const d of ["2026-10-01", "2026-11-30", "2026-02-28", "2028-02-29", "2026-12-31"]) expect(isDay(d), d).toBe(true);
  });
  it("refuses a day Date would roll into the next month", () => {
    for (const d of ["2026-11-31", "2026-02-30", "2026-02-29", "2026-04-31"]) expect(isDay(d), d).toBe(false);
  });
  it("refuses what is not YYYY-MM-DD", () => {
    for (const d of ["2026-13-01", "2026-00-10", "2026-1-1", "29/10/2026", "", "2026-10-01T00:00"]) expect(isDay(d), d).toBe(false);
  });
});

describe("dayOf: the organisation's day of an instant, never UTC's (Phase 2 close-out, 68-C5)", () => {
  it("an instant at 07:30 in Kuala Lumpur reads as that local day, where storedDay reads the day before", () => {
    const at = new Date("2026-09-19T23:30:00Z"); // 07:30 on 20 September in Kuala Lumpur
    expect(dayOf(at, "Asia/Kuala_Lumpur")).toBe("2026-09-20");
    expect(storedDay(at)).toBe("2026-09-19");
  });

  it("turns at local midnight, not UTC's", () => {
    expect(dayOf(new Date("2026-09-20T15:59:59Z"), "Asia/Kuala_Lumpur")).toBe("2026-09-20");
    expect(dayOf(new Date("2026-09-20T16:00:00Z"), "Asia/Kuala_Lumpur")).toBe("2026-09-21");
  });

  it("gives no day while no zone is set: never UTC's", () => {
    expect(dayOf(new Date("2026-09-19T23:30:00Z"), null)).toBeNull();
    expect(dayOf(new Date("2026-09-19T12:00:00Z"), "")).toBeNull();
  });
});
