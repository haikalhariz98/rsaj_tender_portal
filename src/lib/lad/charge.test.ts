import { describe, expect, it } from "vitest";

import { ladDailyOf } from "@/lib/contract/baseline";
import { parseSen, senToDecimalString } from "@/lib/money";

import { ladFaults, ladLine, type Decision } from "./charge";

/**
 * FR-LAD-001, 002, 007, 008; §8.6; OD-A1 A as ruled. FIXTURE: 0.025% of RM1,077,508.60 = RM269.38 a day is the
 * spec's worked figure, never seeded.
 */

const s = parseSen;
const RATE = s("269.38");
const applies = (over: Partial<Decision> = {}): Decision => ({ outcome: "LAD_APPLIES", reason: "No ground for an extension", certificateIssued: true, from: "2026-07-01", until: null, rate: RATE, ...over });

describe("the rate and the amount (§8.6)", () => {
  it("daily 269.38 (0.025% of 1,077,508.60, half up, resolved once at baseline); 30 days → 8,081.40", () => {
    expect(ladDailyOf("PERCENT_OF_SUM_PER_DAY", null, "0.025", s("1077508.60"))).toBe(RATE);
    const l = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-30", decision: applies(), chargedUntil: null });
    expect(l).toMatchObject({ state: "CHARGED", from: "2026-07-01", to: "2026-07-30", days: 30 });
    if (l.state === "CHARGED") expect(senToDecimalString(l.amount)).toBe("8081.40");
  });
  it("the rate is the baseline's: a decision with none stated refuses (never keyed)", () => {
    const l = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-30", decision: applies({ rate: null }), chargedUntil: null });
    expect(ladFaults(l).map((f) => f.code)).toEqual(["LAD_RATE_NOT_SET"]);
  });
});

describe("the chain before any damages line (FR-LAD-001, 007)", () => {
  it("on or before the date for completion nothing is due", () => {
    expect(ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-06-30", decision: null, chargedUntil: null })).toEqual({ state: "NOT_DUE" });
    expect(ladLine({ dateForCompletion: null, valuationDate: "2026-06-30", decision: null, chargedUntil: null })).toEqual({ state: "NOT_DUE" });
  });
  it("past it with no decision: refused, naming the decision to record (never issued silently without damages)", () => {
    const l = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-01", decision: null, chargedUntil: null });
    expect(ladFaults(l)).toEqual([{ code: "NON_COMPLETION_DECISION_REQUIRED", level: "block", data: { day: "2026-06-30" } }]);
  });
  it("no Certificate of Non-Completion issued: no damages line (FR-LAD-007), and the certificate waits", () => {
    const l = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-10", decision: applies({ certificateIssued: false }), chargedUntil: null });
    expect(l).toEqual({ state: "CNC_NOT_ISSUED" });
    expect(ladFaults(l).map((f) => f.code)).toEqual(["CNC_NOT_ISSUED"]);
  });
  it("excusable or entitlement pending: the certificate proceeds without a damages line, with the reasons", () => {
    const l = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-10", decision: { ...applies(), outcome: "EXCUSED_OR_PENDING", reason: "Extension claimed for late possession; determination pending" }, chargedUntil: null });
    expect(l).toEqual({ state: "EXCUSED", reason: "Extension claimed for late possession; determination pending" });
    expect(ladFaults(l)).toEqual([]);
  });
});

describe("the accrual window (FR-LAD-008, ASSUMED: entered with the decision)", () => {
  it("each certificate charges the days not charged before, up to and including its valuation day", () => {
    const first = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-10", decision: applies(), chargedUntil: null });
    expect(first).toMatchObject({ state: "CHARGED", from: "2026-07-01", to: "2026-07-10", until: "2026-07-11", days: 10 });
    const second = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-08-10", decision: applies(), chargedUntil: "2026-07-11" });
    expect(second).toMatchObject({ state: "CHARGED", from: "2026-07-11", to: "2026-08-10", days: 31 });
  });
  it("the window closes at completion (its `until`, the first day not charged)", () => {
    const l = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-08-10", decision: applies({ until: "2026-07-21" }), chargedUntil: "2026-07-11" });
    expect(l).toMatchObject({ state: "CHARGED", from: "2026-07-11", to: "2026-07-20", days: 10 });
    expect(ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-09-10", decision: applies({ until: "2026-07-21" }), chargedUntil: "2026-07-21" })).toEqual({ state: "NOTHING_TO_CHARGE", chargedUntil: "2026-07-21" });
  });
  it("waived (Part B) comes off the gross", () => {
    const l = ladLine({ dateForCompletion: "2026-06-30", valuationDate: "2026-07-10", decision: applies(), chargedUntil: null, waived: s("693.80") });
    if (l.state !== "CHARGED") throw new Error(l.state);
    expect([l.gross, l.waived, l.amount].map(senToDecimalString)).toEqual(["2693.80", "693.80", "2000.00"]);
  });
});
