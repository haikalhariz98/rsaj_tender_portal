import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { storedDay } from "@/lib/dates";
import { formatOrgDay } from "@/lib/format";

/**
 * Phase 2 close-out, 68-C5 grep: the bill's finalising and a panel verification's clearing are
 * instants (written with the server's clock), so the day each shows is the organisation's day, never
 * the UTC day storedDay reads. With no zone set the day is marked as UTC (ruling BD-32).
 */

const KL = "Asia/Kuala_Lumpur";
const finalisedAt = new Date("2026-09-30T23:30:00Z"); // 07:30 on 1 October in Kuala Lumpur

describe("the bill's finalising day and a verification's clearing day (68-C5)", () => {
  it("an instant at 07:30 in Kuala Lumpur shows as that local day", () => {
    expect(formatOrgDay(finalisedAt, KL)).toBe("01 Oct 2026");
    expect(storedDay(finalisedAt)).toBe("2026-09-30");
  });

  it("with no zone the day says it is UTC's", () => {
    expect(formatOrgDay(finalisedAt, null)).toBe("30 Sep 2026 (UTC — time zone not set)");
  });

  it("the Scope tab and the bill read them on the organisation's clock, never storedDay (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/scope/read.ts"), "utf8");
    expect(src).toMatch(/clearedOn: formatOrgDay\(v\.clearedAt!, org\.timeZone\)/);
    expect(src).toMatch(/finalisedOn: v\.finalisedAt \? formatOrgDay\(v\.finalisedAt, org\.timeZone\) : null/);
    expect(src).not.toMatch(/storedDay\(v\.(clearedAt|finalisedAt)/);
  });
});
