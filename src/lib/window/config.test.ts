import { describe, expect, it } from "vitest";

import { configFaultText, floorFaults, parseHolidayCsv, policyFaults, weekendFaults, yearFault, type PolicyInput } from "./config";

/// Configuration › Invitation controls: what a save refuses, with words. Nothing supplies a value.

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const empty: PolicyInput = { minAdvertisementDays: null, targetAdvertisementDays: null, newspaperWarnDays: null, purchaseCutoffDays: null, defaultClosingTime: null, advertisementDayRule: null, advertisementChannelId: null, calendarId: null, templateIds: [] };
const known = { channels: [{ id: "c1", retiredOn: null }, { id: "c2", retiredOn: "2026-01-01" }], calendars: [{ id: "cal", retiredOn: null }], templateIds: ["t1"], today: "2026-10-01" };

describe("the window policy", () => {
  it("everything not set is a valid save: unset stays unset", () => expect(policyFaults(empty, known)).toEqual([]));
  it("days are whole and in range; the target not below the minimum", () => {
    expect(codes(policyFaults({ ...empty, minAdvertisementDays: -1 }, known))).toEqual(["DAYS_NOT_VALID"]);
    expect(codes(policyFaults({ ...empty, minAdvertisementDays: 14, targetAdvertisementDays: 10 }, known))).toEqual(["TARGET_BELOW_MINIMUM"]);
    expect(policyFaults({ ...empty, minAdvertisementDays: 14, targetAdvertisementDays: 14 }, known)).toEqual([]);
  });
  it("the default time is a clock time", () => {
    expect(codes(policyFaults({ ...empty, defaultClosingTime: "2.30pm" }, known))).toEqual(["TIME_NOT_VALID"]);
    expect(policyFaults({ ...empty, defaultClosingTime: "14:30" }, known)).toEqual([]);
  });
  it("a named channel only with the named-channel rule, live and configured", () => {
    expect(codes(policyFaults({ ...empty, advertisementDayRule: "NAMED_CHANNEL" }, known))).toEqual(["NAMED_CHANNEL_REQUIRED"]);
    expect(codes(policyFaults({ ...empty, advertisementDayRule: "LATEST_REQUIRED_CHANNEL", advertisementChannelId: "c1" }, known))).toEqual(["CHANNEL_NOT_FOR_RULE"]);
    expect(codes(policyFaults({ ...empty, advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: "c2" }, known))).toEqual(["CHANNEL_RETIRED"]);
    expect(codes(policyFaults({ ...empty, advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: "zz" }, known))).toEqual(["CHANNEL_UNKNOWN"]);
  });
  it("with no time zone a retirement day is not judged against a guessed day: refused naming the setting, unless nothing has a retirement day", () => {
    const noZone = { ...known, today: null };
    expect(codes(policyFaults({ ...empty, advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: "c2" }, noZone))).toEqual(["TIME_ZONE_NOT_SET"]);
    expect(policyFaults({ ...empty, advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: "c1" }, noZone)).toEqual([]);
  });
  it("a calendar and templates that exist", () => {
    expect(codes(policyFaults({ ...empty, calendarId: "zz", templateIds: ["t9"] }, known))).toEqual(["CALENDAR_UNKNOWN", "TEMPLATE_UNKNOWN"]);
  });
});

describe("floors and calendars", () => {
  it("a floor per known band, once", () => {
    expect(floorFaults("tender", [], null)).toEqual([]);
    expect(codes(floorFaults("works", [], null))).toEqual(["REGIME_UNKNOWN"]);
    expect(codes(floorFaults("tender", [{ id: "a", regime: "tender" }], null))).toEqual(["FLOOR_EXISTS"]);
    expect(floorFaults("tender", [{ id: "a", regime: "tender" }], "a")).toEqual([]);
  });
  it("weekend days are ISO weekdays; a year is a year", () => {
    expect(weekendFaults([6, 7])).toEqual([]);
    expect(codes(weekendFaults([0]))).toEqual(["WEEKDAY_NOT_VALID"]);
    expect(yearFault(2027)).toBeNull();
    expect(yearFault(27)?.code).toBe("YEAR_NOT_VALID");
  });
});

describe("a year's holidays from CSV", () => {
  it("reads day and name, with the Malay name and gazette reference optional, after a header", () => {
    const r = parseHolidayCsv('day,name,nameMs,gazette\n2027-01-01,New Year\'s Day,Tahun Baru,"P.U. (B) 1/2027"\n\n2027-02-06,"Holiday, observed"\n', 2027);
    expect(r.faults).toEqual([]);
    expect(r.rows).toEqual([
      { day: "2027-01-01", nameEn: "New Year's Day", nameMs: "Tahun Baru", gazetteRef: "P.U. (B) 1/2027" },
      { day: "2027-02-06", nameEn: "Holiday, observed", nameMs: null, gazetteRef: "" },
    ]);
  });
  it("judges every line and names it: bad day, other year, no name, a day already a holiday", () => {
    const r = parseHolidayCsv("2027-02-30,Bad\n2026-12-25,Christmas\n2027-03-01,\n2027-05-01,Labour Day\n2027-05-01,Again", 2027, ["2027-08-31"]);
    expect(r.faults.map((f) => [f.line, f.code])).toEqual([[1, "HOLIDAY_DAY_NOT_VALID"], [2, "HOLIDAY_OTHER_YEAR"], [3, "HOLIDAY_NAME_REQUIRED"], [5, "HOLIDAY_EXISTS"]]);
    expect(configFaultText(r.faults[1])).toBe("Line 2: the day is not in 2027.");
  });
});
