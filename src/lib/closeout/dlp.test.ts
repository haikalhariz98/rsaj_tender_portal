import { describe, expect, it } from "vitest";

import { dlpDaysLeft, dlpOffsetsDue } from "./dlp";

/** Plan closeout-plan.md §4.3: the defects liability period's notice, once per offset reached. */

describe("dlpOffsetsDue", () => {
  it("tells each offset reached while the period runs, largest first; none once it has ended, none with no rule's offsets", () => {
    expect(dlpOffsetsDue("2026-11-01", "2026-10-02", [30, 7])).toEqual([30]);
    expect(dlpOffsetsDue("2026-11-01", "2026-10-01", [30, 7])).toEqual([]);
    expect(dlpOffsetsDue("2026-11-01", "2026-10-26", [30, 7])).toEqual([30, 7]);
    expect(dlpOffsetsDue("2026-11-01", "2026-09-30", [30, 7])).toEqual([]);
    expect(dlpOffsetsDue("2026-11-01", "2026-11-01", [30, 7])).toEqual([]);
    expect(dlpOffsetsDue("2026-11-01", "2026-10-26", [])).toEqual([]);
  });
  it("counts the days left to the end", () => {
    expect(dlpDaysLeft("2026-11-01", "2026-10-26")).toBe(6);
    expect(dlpDaysLeft("2026-11-01", "2026-11-02")).toBe(0);
  });
});
