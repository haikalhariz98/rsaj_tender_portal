import { describe, expect, it } from "vitest";

import { timeZoneLabel, timeZoneOptions, utcOffsetLabel } from "./time-zone-label";

const JAN = new Date("2026-01-15T00:00:00Z");
const JUL = new Date("2026-07-15T00:00:00Z");

describe("time zone labels", () => {
  it("names the country, the city and the offset", () => {
    expect(timeZoneLabel("Asia/Kuala_Lumpur", JAN)).toBe("Malaysia (Kuala Lumpur, UTC+8)");
  });
  it("reads a zone with no country on file by region and city, never the IANA name", () => {
    const label = timeZoneLabel("America/Argentina/Buenos_Aires", JAN);
    expect(label).toBe("America (Buenos Aires, UTC-3)");
    expect(label).not.toMatch(/_|\//);
  });
  it("writes half-hour offsets in full and whole hours bare", () => {
    expect(utcOffsetLabel("Asia/Kolkata", JAN)).toBe("UTC+5:30");
    expect(utcOffsetLabel("Asia/Singapore", JAN)).toBe("UTC+8");
  });
  it("follows daylight saving at the instant asked", () => {
    expect(utcOffsetLabel("Europe/London", JAN)).toBe("UTC");
    expect(utcOffsetLabel("Europe/London", JUL)).toBe("UTC+1");
  });
  it("labels UTC itself", () => {
    expect(timeZoneLabel("UTC", JAN)).toBe("Coordinated Universal Time (UTC)");
  });
  it("offers Malaysia's zone, sorted, with no raw names", () => {
    const options = timeZoneOptions(JAN);
    expect(options.find((o) => o.value === "Asia/Kuala_Lumpur")?.label).toBe("Malaysia (Kuala Lumpur, UTC+8)");
    expect(options.some((o) => o.value === "UTC")).toBe(true);
    expect(options.every((o) => !/_/.test(o.label))).toBe(true);
  });
});
