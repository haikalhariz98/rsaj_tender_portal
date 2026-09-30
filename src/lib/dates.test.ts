import { describe, expect, it } from "vitest";

import { dayIn, dayToDate, isTimeZone, storedDay } from "./dates";

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
    expect(greetingAt(instant, null)).toBe("Good evening");
  });
});
