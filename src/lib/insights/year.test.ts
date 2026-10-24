import { describe, expect, it } from "vitest";

import type { Period } from "@/lib/budget/periods";
import { dayIn, storedDay } from "@/lib/dates";

import { byMonth, monthSlots } from "./months";
import { financialYear, inYear } from "./year";

const d = (day: string) => new Date(`${day}T00:00:00Z`);
let n = 0;
const period = (year: number, startsOn: string, endsOn: string, sortOrder = 0): Period => ({
  id: `p${++n}`,
  year,
  code: `P${n}`,
  nameEn: `Period ${n}`,
  nameMs: null,
  startsOn: d(startsOn),
  endsOn: d(endsOn),
  openedOn: null,
  closedOn: null,
  sortOrder,
});

/// Twelve monthly periods from a first day, each ending (exclusive) on the next month's first.
const monthly = (year: number, firstMonth: string): Period[] => {
  const [y0, m0] = firstMonth.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const a = new Date(Date.UTC(y0, m0 - 1 + i, 1));
    const b = new Date(Date.UTC(y0, m0 + i, 1));
    return period(year, storedDay(a), storedDay(b), i);
  });
};

describe("the financial year comes from budget periods (DB-5)", () => {
  it("runs from the earliest start to the latest end", () => {
    const fy = financialYear(monthly(2026, "2026-01"), 2026);
    expect(fy).toMatchObject({ state: "SET", year: 2026, from: "2026-01-01", to: "2027-01-01" });
  });
  it("takes quarters as readily as months, whatever order they were entered in", () => {
    const q = [period(2026, "2026-07-01", "2026-10-01", 3), period(2026, "2026-01-01", "2026-04-01", 1), period(2026, "2026-10-01", "2027-01-01", 4), period(2026, "2026-04-01", "2026-07-01", 2)];
    expect(financialYear(q, 2026)).toMatchObject({ state: "SET", from: "2026-01-01", to: "2027-01-01" });
  });
  it("is not set for a year with no periods, and the calendar year is never assumed", () => {
    expect(financialYear(monthly(2026, "2026-01"), 2025)).toEqual({ state: "NOT_SET", year: 2025 });
    expect(financialYear([], 2026)).toEqual({ state: "NOT_SET", year: 2026 });
    expect(financialYear([], null)).toEqual({ state: "NOT_SET", year: null });
  });
  it("a record dated on the last end day belongs to the next year (endsOn is exclusive)", () => {
    const fy = financialYear(monthly(2026, "2026-01"), 2026);
    if (fy.state !== "SET") throw new Error("set");
    expect(inYear(fy, "2026-01-01")).toBe(true);
    expect(inYear(fy, "2026-12-31")).toBe(true);
    expect(inYear(fy, "2027-01-01")).toBe(false);
    expect(inYear(fy, "2025-12-31")).toBe(false);
  });
});

describe("months of the year", () => {
  it("a twelve-month calendar year has twelve slots, January to December", () => {
    const slots = monthSlots({ from: "2026-01-01", to: "2027-01-01" });
    expect(slots).toHaveLength(12);
    expect([slots[0], slots[11]]).toEqual(["2026-01", "2026-12"]);
  });
  it("a July-start year has its twelve slots July to June", () => {
    const fy = financialYear(monthly(2026, "2026-07"), 2026);
    if (fy.state !== "SET") throw new Error("set");
    const slots = monthSlots(fy);
    expect(slots).toHaveLength(12);
    expect([slots[0], slots[5], slots[6], slots[11]]).toEqual(["2026-07", "2026-12", "2027-01", "2027-06"]);
  });
  it("every month has a slot, empty ones included, and a row outside the year is left out", () => {
    const fy = { from: "2026-01-01", to: "2027-01-01" };
    const out = byMonth([{ day: "2026-03-05", amount: 150n }, { day: "2026-03-31", amount: 50n }, { day: "2027-01-01", amount: 999n }, { day: "2025-12-31", amount: 999n }, { day: "2026-12-31" }], fy);
    expect(out).toHaveLength(12);
    expect(out[0]).toEqual({ month: "2026-01", count: 0, amount: 0n });
    expect(out[2]).toEqual({ month: "2026-03", count: 2, amount: 200n });
    expect(out[11]).toEqual({ month: "2026-12", count: 1, amount: 0n });
    expect(out.reduce((s, m) => s + m.count, 0)).toBe(3);
  });
  it("months are the organisation's: 31 Dec 23:30 UTC is January in Kuala Lumpur, and an award at 20:00 UTC too", () => {
    const fy = { from: "2026-01-01", to: "2027-01-01" };
    const late = new Date("2025-12-31T23:30:00Z");
    const evening = new Date("2025-12-31T20:00:00Z");
    expect(dayIn(late, "Asia/Kuala_Lumpur")).toBe("2026-01-01");
    const out = byMonth([late, evening].map((at) => ({ day: dayIn(at, "Asia/Kuala_Lumpur") })), fy);
    expect(out[0].count).toBe(2);
    // With no zone set the day is UTC's (said in the header), so both are still last year.
    expect(byMonth([late, evening].map((at) => ({ day: dayIn(at, null) })), fy)[0].count).toBe(0);
  });
  it("a stored day is read as stored, never shifted by the zone", () => {
    expect(storedDay(d("2026-01-01"))).toBe("2026-01-01");
  });
});
