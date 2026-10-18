import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";
import { formatDate, formatOrgDay } from "@/lib/format";

/**
 * Phase 1 carry item 10, the converse (found with 68-C5): a route's openedAt is a stored day (the
 * organisation's day at midnight UTC; opened-day.test.ts), so the "Opened", "Sent", "Requested",
 * "asked" and "Submitted" days on the route cards are shown with formatDate. formatOrgDay read it as
 * an instant: the same day in Kuala Lumpur, but the day before west of UTC, and "(UTC — time zone not
 * set)" on what is no instant at all when no zone is set.
 */

const FILES = [
  "src/app/requisitions/[id]/page.tsx",
  // C-3 (wave C step C4): the award's route cards moved with ApprovalPanel; /awards/[id]/page.tsx imports it.
  "src/app/projects/[id]/award/approval-panel.tsx",
  "src/app/sourcing/[id]/page.tsx",
  "src/app/sourcing/[id]/window/window-section.tsx",
  "src/app/sourcing/[id]/documents/workspace.tsx",
];

describe("a route's opened day on screen (item 10)", () => {
  it("a stored day reads as itself with formatDate, in every zone; formatOrgDay moved it west of UTC", () => {
    const openedAt = dayToDate("2026-10-02");
    expect(formatDate(openedAt)).toBe("02 Oct 2026");
    expect(formatOrgDay(openedAt, "Asia/Kuala_Lumpur")).toBe("02 Oct 2026");
    expect(formatOrgDay(openedAt, "America/New_York")).toBe("01 Oct 2026");
    expect(formatOrgDay(openedAt, null)).toBe("02 Oct 2026 (UTC — time zone not set)");
  });

  it("the route cards show it with formatDate, two places in each file (source scan)", () => {
    for (const f of FILES) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect((src.match(/formatDate\((inst|e)\.openedAt\)/g) ?? []).length, f).toBe(2);
      expect(src, f).not.toMatch(/formatOrg(Day|DateTime)\((inst|e)\.openedAt/);
    }
  });
});
