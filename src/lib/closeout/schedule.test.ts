import { describe, expect, it } from "vitest";

import { scheduleRaiseFaults, type ScheduleRaiseInput } from "./schedule";

/** FR-CMP-013; plan closeout-plan.md §4.3, §6.3. */

const codes = (fs: readonly { code: string; level: string }[]) => fs.map((f) => `${f.code}${f.level === "warn" ? " (warn)" : ""}`);
const ok: ScheduleRaiseInput = { cpcIssued: true, dlp: { applies: true, start: "2025-10-01", endExclusive: "2026-10-01" }, today: "2026-10-01", open: 2, live: null, rectifyBy: "2026-12-31", limit: { length: 3, unit: "MONTHS" } };

describe("scheduleRaiseFaults", () => {
  it("DLP_NOT_ENDED on the last day, allowed on the end day", () => {
    expect(scheduleRaiseFaults(ok)).toEqual([]);
    expect(codes(scheduleRaiseFaults({ ...ok, today: "2026-09-30", rectifyBy: "2026-12-30" }))).toEqual(["DLP_NOT_ENDED"]);
  });
  it("RECTIFY_BY_PAST_LIMIT with the clock at 3 months (fixture); a warning when the clock is unset", () => {
    expect(scheduleRaiseFaults({ ...ok, rectifyBy: "2027-01-01" })).toEqual([]);
    expect(codes(scheduleRaiseFaults({ ...ok, rectifyBy: "2027-01-02" }))).toEqual(["RECTIFY_BY_PAST_LIMIT"]);
    expect(codes(scheduleRaiseFaults({ ...ok, limit: null, rectifyBy: "2028-01-01" }))).toEqual(["LIMIT_NOT_SET (warn)"]);
  });
  it("refuses each by name", () => {
    expect(codes(scheduleRaiseFaults({ ...ok, cpcIssued: false }))).toEqual(["CPC_NOT_ISSUED"]);
    expect(codes(scheduleRaiseFaults({ ...ok, dlp: { applies: false } }))).toEqual(["DLP_NOT_APPLICABLE"]);
    expect(codes(scheduleRaiseFaults({ ...ok, open: 0 }))).toEqual(["NO_OPEN_DEFECTS"]);
    expect(codes(scheduleRaiseFaults({ ...ok, live: { number: null } }))).toEqual(["SCHEDULE_LIVE"]);
    expect(codes(scheduleRaiseFaults({ ...ok, rectifyBy: "2026-10-01" }))).toEqual(["RECTIFY_BY_NOT_AFTER_TODAY"]);
  });
});
