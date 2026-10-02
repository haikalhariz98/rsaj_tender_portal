import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dayToDate, todayIn } from "@/lib/dates";
import { inForceOn } from "@/lib/effective";

import { endAssignment } from "./end-assignment";

const from = dayToDate("2026-01-01");

describe("ending a role assignment stores a day, not an instant", () => {
  it("stores the chosen day at midnight UTC, the form every effective-dated end day takes", () => {
    const r = endAssignment({ effectiveFrom: from, effectiveTo: null, endDay: "2026-10-03", today: "2026-10-02" });
    expect(r).toEqual({ ok: true, effectiveTo: new Date("2026-10-03T00:00:00.000Z") });
  });

  it("the end day is not included: in force the day before, not on the day", () => {
    const r = endAssignment({ effectiveFrom: from, effectiveTo: null, endDay: "2026-10-03", today: "2026-10-02" });
    if (!r.ok) throw new Error(r.message);
    const period = { effectiveFrom: from, effectiveTo: r.effectiveTo };
    expect(inForceOn(period, dayToDate("2026-10-02"))).toBe(true);
    expect(inForceOn(period, dayToDate("2026-10-03"))).toBe(false);
  });

  it("ending today means it is no longer held today", () => {
    const r = endAssignment({ effectiveFrom: from, effectiveTo: null, endDay: "2026-10-02", today: "2026-10-02" });
    if (!r.ok) throw new Error(r.message);
    expect(inForceOn({ effectiveFrom: from, effectiveTo: r.effectiveTo }, dayToDate("2026-10-02"))).toBe(false);
  });

  it("today is the organisation's day: 07:00 in Kuala Lumpur is already the next day there", () => {
    // 2026-10-01T23:00Z is 07:00 on 2 October in Kuala Lumpur, still 1 October in UTC.
    const today = todayIn(new Date("2026-10-01T23:00:00Z"), "Asia/Kuala_Lumpur");
    expect(today).toBe("2026-10-02");
    const r = endAssignment({ effectiveFrom: from, effectiveTo: null, endDay: "2026-10-01", today });
    expect(r.ok ? null : r.code).toBe("BEFORE_TODAY");
  });

  it("refuses with no time zone: an unset zone is not UTC", () => {
    const r = endAssignment({ effectiveFrom: from, effectiveTo: null, endDay: "2026-10-03", today: null });
    expect(r.ok ? null : r.code).toBe("TIME_ZONE_UNSET");
    expect(r.ok ? "" : r.message).toMatch(/Configuration › Organisation/);
  });

  it("refuses no day, an impossible day, a day not after the start, a day before today and an ended assignment", () => {
    const base = { effectiveFrom: from, effectiveTo: null, today: "2026-10-02" };
    const code = (endDay: string, extra = {}) => {
      const r = endAssignment({ ...base, endDay, ...extra });
      return r.ok ? null : r.code;
    };
    expect(code("")).toBe("END_DAY_REQUIRED");
    expect(code("2026-02-30")).toBe("END_DAY_REQUIRED");
    expect(code("2026-01-01", { today: "2025-12-01" })).toBe("NOT_AFTER_START");
    expect(code("2026-01-02", { today: "2025-12-01" })).toBe(null);
    expect(code("2026-10-01")).toBe("BEFORE_TODAY");
    expect(code("2026-10-03", { effectiveTo: dayToDate("2026-11-01") })).toBe("ALREADY_ENDED");
  });
});

describe("the End action (source scan)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "configuration", "users", "actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function endAssignment"), src.indexOf("class RecommendationRefused"));

  it("never stores the current instant as the end", () => {
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/effectiveTo\s*=\s*new Date\(\)/);
    expect(body).toMatch(/endAssignmentDay\(\{/);
  });

  it("reads the organisation's today, never a UTC fallback", () => {
    expect(body).toMatch(/todayIn\(/);
    expect(body).not.toMatch(/toISOString\(\)\.slice/);
  });
});
