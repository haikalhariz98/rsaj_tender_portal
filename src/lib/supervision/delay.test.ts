import { describe, expect, it } from "vitest";

import { contractEnded, inDelay } from "./delay";
import { plannedOn } from "./programme";

/**
 * FR-SUP-010, worked by hand (figures from the specification; the 70% is a test fixture, never shipped):
 * - Policy 70%. On the day progress is recorded the approved programme plans 87%. Actual 60.9%: 0.7 × 87 = 60.9,
 *   exactly on the line, so not In Delay. Actual 60.8%: below it, In Delay.
 * - The date for completion has passed and the work is not complete: In Delay whatever the policy says.
 * - Policy not set: NOT_SET, never "on track".
 */

const programme = [
  { day: "2026-03-02", plannedPct: "0" },
  { day: "2026-06-01", plannedPct: "87" },
  { day: "2026-09-01", plannedPct: "100" },
];
const base = { today: "2026-06-02", possessed: true, dateForCompletion: "2026-09-01", programme, policyPct: "70" };

describe("the worked example", () => {
  it("60.9% against 87% at 70% is exactly on the line: not In Delay", () => {
    expect(inDelay({ ...base, latest: { day: "2026-06-01", actualPct: "60.9" } })).toMatchObject({ state: "ON_TRACK", plannedPct: "87" });
  });
  it("60.8% is below it: In Delay, behind", () => {
    expect(inDelay({ ...base, latest: { day: "2026-06-01", actualPct: "60.8" } })).toMatchObject({ state: "IN_DELAY", why: "BEHIND", actualPct: "60.8", plannedPct: "87", policyPct: "70" });
  });
  it("a ten-thousandth below the line is below it", () => {
    expect(inDelay({ ...base, latest: { day: "2026-06-01", actualPct: "60.8999" } }).state).toBe("IN_DELAY");
  });
  it("completion lapsed with the work incomplete is In Delay, with or without the policy", () => {
    const late = { ...base, today: "2026-09-02", latest: { day: "2026-09-01", actualPct: "99.5" } };
    expect(inDelay(late)).toMatchObject({ state: "IN_DELAY", why: "LAPSED", dateForCompletion: "2026-09-01" });
    expect(inDelay({ ...late, policyPct: null })).toMatchObject({ state: "IN_DELAY", why: "LAPSED" });
    expect(inDelay({ ...late, today: "2026-09-01" }).state).not.toBe("IN_DELAY");
    expect(inDelay({ ...late, latest: { day: "2026-09-01", actualPct: "100" } }).state).toBe("ON_TRACK");
  });
  it("an ended contract is not judged, however late and however short of 100%", () => {
    const late = { ...base, today: "2026-09-02", latest: { day: "2026-09-01", actualPct: "40" } };
    expect(inDelay(late).state).toBe("IN_DELAY");
    expect(inDelay({ ...late, ended: true })).toEqual({ state: "NOT_JUDGED", why: "ENDED" });
    expect(["ACTIVE", "EXECUTED"].some(contractEnded)).toBe(false);
    expect(["PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "TERMINATED", "CLOSED", "CANCELLED"].every(contractEnded)).toBe(true);
  });
  it("policy not set: NOT_SET, never on track", () => {
    expect(inDelay({ ...base, policyPct: null, latest: { day: "2026-06-01", actualPct: "10" } })).toEqual({ state: "NOT_SET" });
  });
  it("what cannot be judged says why", () => {
    expect(inDelay({ ...base, possessed: false, latest: null })).toEqual({ state: "NOT_JUDGED", why: "NOT_POSSESSED" });
    expect(inDelay({ ...base, programme: null, latest: { day: "2026-06-01", actualPct: "1" } })).toEqual({ state: "NOT_JUDGED", why: "NO_PROGRAMME" });
    expect(inDelay({ ...base, latest: null })).toEqual({ state: "NOT_JUDGED", why: "NO_PROGRESS" });
    expect(inDelay({ ...base, latest: { day: "2026-03-01", actualPct: "0" } })).toEqual({ state: "NOT_JUDGED", why: "BEFORE_PROGRAMME" });
  });
});

describe("planned progress between points is read on the straight line, exactly (ASSUMED, BD-613-12)", () => {
  it("halfway between 0% (2 Mar) and 87% (1 Jun, 91 days) on day 45 is 87 × 45 / 91", () => {
    const p = plannedOn(programme, "2026-04-16")!;
    // 0 + (870000 − 0) × 45 / 91 ten-thousandths
    expect(p).toEqual({ num: 870000n * 91n * 0n + 870000n * 45n, den: 91n });
  });
  it("on a point, the point; after the last, the last; before the first, nothing", () => {
    expect(plannedOn(programme, "2026-06-01")).toEqual({ num: 870000n, den: 1n });
    expect(plannedOn(programme, "2026-12-01")).toEqual({ num: 1000000n, den: 1n });
    expect(plannedOn(programme, "2026-03-01")).toBeNull();
  });
  it("judged against the interpolated figure: 70% of 43.0219…% on day 45", () => {
    // planned = 870000 × 45 / 91 = 430219.78… ten-thousandths; 70% of it = 30.1153…%
    const r = (a: string) => inDelay({ ...base, latest: { day: "2026-04-16", actualPct: a } }).state;
    expect(r("30.1154")).toBe("ON_TRACK");
    expect(r("30.1153")).toBe("IN_DELAY");
  });
});
