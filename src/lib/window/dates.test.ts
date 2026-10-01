import { describe, expect, it } from "vitest";

import { advertisementDay, closingFaults, policySnapshot, type ClosingInput } from "./dates";
import { klAt, NEWSPAPER, NOTICE_BOARD, SPEC_CALENDAR, SPEC_CHANNELS, SPEC_POLICY, WEBSITE } from "./fixture";
import { windowFindingText } from "./labels";
import { UNSET_WINDOW_POLICY, type WindowPolicyFacts } from "./types";

/**
 * FR-ADV-001 and 004–007 against the spec's worked examples (SK002 7.4.1, 7.4.2), configured in the
 * fixture as a customer would; every rule unset blocks on its own (OD-3, OD-7).
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const TZ = "Asia/Kuala_Lumpur";
const base = (over: Partial<ClosingInput> = {}): ClosingInput => ({
  advertisementDay: "2026-11-03",
  closingAt: klAt("2026-11-24"),
  purchaseCloseDay: "2026-11-20",
  closingTimeReason: "",
  timeZone: TZ,
  policy: SPEC_POLICY,
  calendar: SPEC_CALENDAR,
  ...over,
});
const blocks = (i: ClosingInput) => codes(closingFaults(i).filter((f) => f.level === "block"));
const of = (i: ClosingInput, code: string) => closingFaults(i).find((f) => f.code === code);

describe("the advertisement day (OD-3)", () => {
  const records = [
    { channelId: NEWSPAPER.id, publishedOn: "2026-11-02" },
    { channelId: NOTICE_BOARD.id, publishedOn: "2026-11-03" },
    { channelId: WEBSITE.id, publishedOn: "2026-11-05" },
  ];
  it("newspaper 2 Nov, board 3 Nov, website 5 Nov: the 5th under the latest required channel", () => {
    expect(advertisementDay(records, SPEC_CHANNELS, SPEC_POLICY, "2026-11-10").day).toBe("2026-11-05");
  });
  it("the 2nd where the rule names the newspaper", () => {
    expect(advertisementDay(records, SPEC_CHANNELS, { advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: NEWSPAPER.id }, "2026-11-10").day).toBe("2026-11-02");
  });
  it("a required channel with no record gives no day, and names the channel", () => {
    const r = advertisementDay(records.slice(0, 2), SPEC_CHANNELS, SPEC_POLICY, "2026-11-10");
    expect(r.day).toBeNull();
    expect(r.missing.map((c) => c.nameEn)).toEqual(["Website"]);
    expect(windowFindingText(r.faults[0])).toMatch(/Website/);
  });
  it("the rule unset gives no day and names the setting", () => {
    const r = advertisementDay(records, SPEC_CHANNELS, { advertisementDayRule: null, advertisementChannelId: null }, "2026-11-10");
    expect(r.day).toBeNull();
    expect(r.faults).toEqual([{ code: "RULE_NOT_SET", level: "block", data: { setting: "advertisementDayRule" } }]);
    expect(windowFindingText(r.faults[0])).toMatch(/advertisement day.*Invitation controls/);
  });
  it("no channel configured or none required refuses (CHANNELS_NOT_SET)", () => {
    expect(codes(advertisementDay([], [], SPEC_POLICY, "2026-11-10").faults)).toEqual(["CHANNELS_NOT_SET"]);
    expect(codes(advertisementDay([], [{ ...WEBSITE, requiredWhenAdvertised: false }], SPEC_POLICY, "2026-11-10").faults)).toEqual(["CHANNELS_NOT_SET"]);
  });
  it("a channel whose requirement is not set blocks, naming it", () => {
    const r = advertisementDay(records, [...SPEC_CHANNELS, { id: "tg", nameEn: "Social media", requiredWhenAdvertised: null, retiredOn: null }], SPEC_POLICY, "2026-11-10");
    expect(codes(r.faults)).toEqual(["CHANNEL_REQUIREMENT_NOT_SET"]);
    expect(r.day).toBeNull();
  });
  it("a retired channel is no longer required", () => {
    const r = advertisementDay(records.slice(0, 2), [NEWSPAPER, NOTICE_BOARD, { ...WEBSITE, retiredOn: "2026-10-01" }], SPEC_POLICY, "2026-11-10");
    expect(r.day).toBe("2026-11-03");
  });
  it("a named channel that is not required is refused", () => {
    const r = advertisementDay(records, SPEC_CHANNELS, { advertisementDayRule: "NAMED_CHANNEL", advertisementChannelId: "nope" }, "2026-11-10");
    expect(codes(r.faults)).toEqual(["NAMED_CHANNEL_NOT_REQUIRED"]);
  });
});

describe("two weeks from the advertisement day (FR-ADV-004, worked example)", () => {
  it("advertised Tuesday 3 November with a minimum of 14: closing Monday the 16th (D+13) is refused, citing the source", () => {
    const f = of(base({ closingAt: klAt("2026-11-16"), purchaseCloseDay: "2026-11-13" }), "CLOSING_TOO_SOON")!;
    expect(f).toMatchObject({ level: "block", data: { days: 13, min: 14 } });
    expect(windowFindingText(f)).toBe("The closing date must be at least 14 days after the advertisement date (SK002 7.4.2(g)): it is 13 days after 3 November 2026. Move the closing later.");
  });
  it("Tuesday the 17th (D+14) passes", () => {
    expect(blocks(base({ closingAt: klAt("2026-11-17"), purchaseCloseDay: "2026-11-15" }))).toEqual([]);
  });
  it("below the target of 21 is a warning, never a refusal", () => {
    const fs = closingFaults(base({ closingAt: klAt("2026-11-17"), purchaseCloseDay: "2026-11-15" }));
    expect(fs.find((f) => f.code === "BELOW_TARGET")).toMatchObject({ level: "warn", data: { days: 14, target: 21 } });
    expect(of(base({ closingAt: klAt("2026-11-24") }), "BELOW_TARGET")).toBeUndefined();
  });
  it("within the newspaper margin is a warning", () => {
    expect(of(base({ closingAt: klAt("2026-11-17"), purchaseCloseDay: "2026-11-15" }), "NEAR_NEWSPAPER_DAY")?.level).toBe("warn");
    // 17 days: a newspaper three days late would still leave 14.
    expect(of(base({ closingAt: klAt("2026-11-20"), purchaseCloseDay: "2026-11-18" }), "NEAR_NEWSPAPER_DAY")).toBeUndefined();
  });
  it("with no advertisement day yet, the days are not judged and it says so", () => {
    expect(of(base({ advertisementDay: null }), "ADVERTISEMENT_DAY_NOT_KNOWN")?.level).toBe("info");
    expect(of(base({ advertisementDay: null, closingAt: klAt("2026-11-04"), purchaseCloseDay: "2026-11-02" }), "CLOSING_TOO_SOON")).toBeUndefined();
  });
});

describe("weekends and public holidays (FR-ADV-005, OD-7)", () => {
  it("Saturday 21 November is refused with the rule and its configured source", () => {
    const f = of(base({ closingAt: klAt("2026-11-21"), purchaseCloseDay: "2026-11-19" }), "CLOSING_ON_WEEKEND")!;
    expect(f.level).toBe("block");
    expect(windowFindingText(f)).toMatch(/^The closing date must not fall on a weekend or a public holiday \(SK002 7\.4\.2\(g\)\): 21 November 2026 is a Saturday/);
  });
  it("with no source recorded, no citation is invented", () => {
    const f = of(base({ closingAt: klAt("2026-11-21"), purchaseCloseDay: "2026-11-19", policy: { ...SPEC_POLICY, dateRuleSource: "" } }), "CLOSING_ON_WEEKEND")!;
    expect(windowFindingText(f)).toMatch(/^The closing date must not fall on a weekend or a public holiday: 21 November 2026/);
  });
  it("a public holiday of the calendar is refused, naming it", () => {
    const f = of(base({ closingAt: klAt("2026-12-25"), purchaseCloseDay: "2026-12-23" }), "PUBLIC_HOLIDAY")!;
    expect(windowFindingText(f)).toMatch(/25 December 2026 is Christmas Day in State calendar/);
  });
  it("a closing in a year not maintained in full blocks", () => {
    expect(blocks(base({ closingAt: klAt("2027-01-12"), purchaseCloseDay: "2027-01-08" }))).toEqual(["CALENDAR_NOT_MAINTAINED"]);
  });
  it("weekend days not set block; no calendar chosen blocks", () => {
    expect(blocks(base({ calendar: { ...SPEC_CALENDAR, weekendDays: [] } }))).toEqual(["WEEKEND_NOT_SET"]);
    expect(blocks(base({ calendar: null }))).toEqual(["CALENDAR_NOT_SET"]);
  });
  it("a weekday that is no holiday passes", () => {
    expect(blocks(base({ closingAt: klAt("2026-11-24") }))).toEqual([]);
  });
});

describe("the closing time (FR-ADV-006)", () => {
  it("17:00 with no reason is refused; with a reason it passes and is said", () => {
    expect(blocks(base({ closingAt: klAt("2026-11-24", "17:00") }))).toEqual(["TIME_NOT_DEFAULT"]);
    const fs = closingFaults(base({ closingAt: klAt("2026-11-24", "17:00"), closingTimeReason: "Public holiday eve: the counter closes later." }));
    expect(fs.filter((f) => f.level === "block")).toEqual([]);
    expect(fs.find((f) => f.code === "TIME_DIFFERS")).toMatchObject({ level: "info", data: { time: "17:00", default: "14:30" } });
  });
});

describe("the last day of sale (FR-ADV-007, worked example)", () => {
  it("closing Tuesday 17 November: the 15th (exactly 2 days before) passes, the 16th is refused", () => {
    expect(blocks(base({ closingAt: klAt("2026-11-17"), purchaseCloseDay: "2026-11-15" }))).toEqual([]);
    expect(blocks(base({ closingAt: klAt("2026-11-17"), purchaseCloseDay: "2026-11-16" }))).toEqual(["PURCHASE_CUTOFF_TOO_LATE"]);
  });
  it("not set blocks; a last day already past blocks", () => {
    expect(blocks(base({ purchaseCloseDay: null }))).toEqual(["PURCHASE_CLOSE_NOT_SET"]);
    expect(blocks(base({ today: "2026-11-21" }))).toEqual(["PURCHASE_CLOSE_IN_PAST"]);
  });
});

describe("every rule unset blocks on its own, naming its setting", () => {
  it.each(["minAdvertisementDays", "targetAdvertisementDays", "newspaperWarnDays", "purchaseCutoffDays", "defaultClosingTime"] as const)("%s", (setting) => {
    const policy: WindowPolicyFacts = { ...SPEC_POLICY, [setting]: null };
    const fs = closingFaults(base({ policy }));
    expect(fs.filter((f) => f.level === "block")).toEqual([{ code: "RULE_NOT_SET", level: "block", data: { setting } }]);
    expect(windowFindingText(fs.find((f) => f.code === "RULE_NOT_SET")!)).toMatch(/^Not set: .*Invitation controls/);
  });
  it("a policy with nothing set refuses with all of them, never a default", () => {
    const fs = closingFaults(base({ policy: UNSET_WINDOW_POLICY, calendar: null }));
    expect(codes(fs.filter((f) => f.level === "block")).sort()).toEqual(["CALENDAR_NOT_SET", "RULE_NOT_SET", "RULE_NOT_SET", "RULE_NOT_SET", "RULE_NOT_SET", "RULE_NOT_SET"].sort());
  });
  it("a null zone refuses outright: never UTC", () => {
    expect(closingFaults(base({ timeZone: null }))).toEqual([{ code: "TIME_ZONE_UNSET", level: "block" }]);
  });
});

describe("the publication's snapshot", () => {
  it("holds every rule value with its provenance and the calendar's years", () => {
    const s = policySnapshot(SPEC_POLICY, SPEC_CALENDAR, SPEC_CHANNELS, { regime: "tender", minimum: "250.00", provenance: "STATED" });
    expect(s.dateRules).toMatchObject({ minAdvertisementDays: 14, provenance: "STATED", source: "SK002 7.4.2(g)" });
    expect(s.calendar?.years).toEqual([{ year: 2026, complete: true }, { year: 2027, complete: false }]);
    expect(s.channels.map((c) => c.name)).toEqual(["Newspaper", "Notice board", "Website"]);
  });
});
