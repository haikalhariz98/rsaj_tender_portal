import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { prelimsFirst } from "./prelims";
import { calendarFaults, issueClockFrom, jointFaults, openFaults, valuationDayIn, type OpenInput } from "./valuation";
import { valuableVariation, variationFaults } from "./variation-check";

/// FR-PAY-003–006, 008, 009. FIXTURE figures.
const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("the valuation calendar (FR-PAY-003)", () => {
  it("the agreed day, or the month's last day where it is shorter", () => {
    expect(valuationDayIn("2026-07", 25)).toBe("2026-07-25");
    expect(valuationDayIn("2026-02", 31)).toBe("2026-02-28");
    expect(valuationDayIn("2028-02", 30)).toBe("2028-02-29");
  });
  it("a day 1–31, the day agreed and with whom; a change says why", () => {
    expect(codes(calendarFaults({ dayOfMonth: 25, agreedOn: "2026-07-01", agreedWith: "Tan Ah Kow", today: "2026-07-02", existing: false, reason: "" }))).toEqual([]);
    expect(codes(calendarFaults({ dayOfMonth: 32, agreedOn: null, agreedWith: " ", today: "2026-07-02", existing: true, reason: "" }))).toEqual(["CALENDAR_DAY_INVALID", "CALENDAR_AGREED_ON_REQUIRED", "CALENDAR_AGREED_WITH_REQUIRED", "CALENDAR_CHANGE_REASON_REQUIRED"]);
  });
});

describe("opening a valuation (FR-PAY-004)", () => {
  const base: OpenInput = { trigger: "VALUATION_DATE", triggerDate: null, valuationDate: "2026-07-25", today: "2026-07-26", calendarDay: 25, inProgress: false, lastIssuedOn: "2026-06-25", baselineInForce: true };
  it("on the calendar's day; a claim on or after the day it was received", () => {
    expect(codes(openFaults(base))).toEqual([]);
    expect(codes(openFaults({ ...base, valuationDate: "2026-07-24" }))).toEqual(["NOT_THE_VALUATION_DAY"]);
    expect(codes(openFaults({ ...base, trigger: "CLAIM", triggerDate: "2026-07-20", valuationDate: "2026-07-22" }))).toEqual([]);
    expect(codes(openFaults({ ...base, trigger: "CLAIM", triggerDate: "2026-07-23", valuationDate: "2026-07-22" }))).toEqual(["VALUED_BEFORE_CLAIM"]);
  });
  it("one at a time, forward only, never in the future, and only on a baseline in force", () => {
    expect(codes(openFaults({ ...base, inProgress: true }))).toEqual(["VALUATION_IN_PROGRESS"]);
    expect(codes(openFaults({ ...base, lastIssuedOn: "2026-07-25" }))).toEqual(["NOT_AFTER_LAST"]);
    // Ruling 1a (code review of close-out stage B): not dated before the last retention release; on its day is allowed.
    expect(codes(openFaults({ ...base, lastReleaseOn: "2026-07-26" }))).toEqual(["BEFORE_RELEASE"]);
    expect(codes(openFaults({ ...base, lastReleaseOn: "2026-07-25" }))).toEqual([]);
    expect(codes(openFaults({ ...base, today: "2026-07-24" }))).toEqual(["FUTURE_DATE"]);
    expect(codes(openFaults({ ...base, baselineInForce: false }))).toEqual(["NO_BASELINE"]);
    expect(codes(openFaults({ ...base, calendarDay: null }))).toEqual(["CALENDAR_NOT_SET"]);
  });
  it("the issue period runs from the claim's day, or the valuation day", () => {
    expect(issueClockFrom("CLAIM", "2026-07-20", "2026-07-22")).toBe("2026-07-20");
    expect(issueClockFrom("VALUATION_DATE", null, "2026-07-25")).toBe("2026-07-25");
  });
});

describe("the joint valuation (FR-PAY-006)", () => {
  const ok = { participants: ["QS", "Contractor's agent"], method: "Measured on site against the bill", answer: "AGREED" as const, dissent: "", on: "2026-07-25", valuationDate: "2026-07-25", today: "2026-07-26" };
  it("participants, the method and the contractor's answer; a dissent says what is disputed", () => {
    expect(codes(jointFaults(ok))).toEqual([]);
    expect(codes(jointFaults({ ...ok, participants: ["QS"], method: "", answer: "DISSENT" }))).toEqual(["PARTICIPANTS_REQUIRED", "METHOD_REQUIRED", "DISSENT_REQUIRED"]);
    expect(codes(jointFaults({ ...ok, on: "2026-07-24" }))).toEqual(["JOINT_BEFORE_VALUATION"]);
  });
});

describe("variation work at valuation (FR-PAY-008)", () => {
  it("an unapproved variation is not valued", () => {
    expect(valuableVariation([{ approved: true, value: parseSen("100.00") }, { approved: false, value: parseSen("50.00") }])).toBe(parseSen("100.00"));
  });
  it("valued beyond the revised sum needs a Variation Order Certificate first; exactly the sum is not beyond it", () => {
    expect(codes(variationFaults({ valuedTotal: parseSen("1115308.61"), revisedSum: parseSen("1115308.60"), unapproved: 0 }))).toEqual(["VOC_REQUIRED"]);
    expect(codes(variationFaults({ valuedTotal: parseSen("1115308.60"), revisedSum: parseSen("1115308.60"), unapproved: 0 }))).toEqual([]);
  });
});

describe("preliminaries (FR-PAY-009)", () => {
  it("priced insurance 12,000.00 > premium paid 8,000.00 → 8,000.00 in the first valuation, 4,000.00 spread", () => {
    expect(prelimsFirst({ category: "FIRST", priced: parseSen("12000.00"), premiumPaid: parseSen("8000.00") })).toEqual({ first: parseSen("8000.00"), progressive: parseSen("4000.00"), onCompletion: 0n });
  });
  it("each category as it says", () => {
    expect(prelimsFirst({ category: "FIRST", priced: 100n, premiumPaid: null }).first).toBe(100n);
    expect(prelimsFirst({ category: "PROGRESSIVE", priced: 100n, premiumPaid: null }).progressive).toBe(100n);
    expect(prelimsFirst({ category: "ON_COMPLETION", priced: 100n, premiumPaid: null }).onCompletion).toBe(100n);
  });
});
