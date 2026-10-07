import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderValue } from "@/lib/audit/diff";
import { formatOrgDateTime } from "@/lib/format";

import { ISSUE_TIME_ZONE_UNSET } from "./issue";

/**
 * Phase 2 close-out residual (68-C5 family, flagged against accepted 6.9): issuing an approval matrix
 * wrote `issuedAt: now` to the trail as a Date, which renderValue writes as its UTC day. It is now
 * written on the organisation's clock; with no zone the issue is refused, never stamped as UTC.
 */

describe("an issue's issuedAt in the trail", () => {
  it("07:30 in Kuala Lumpur is that day and time, where renderValue wrote the UTC day before", () => {
    const now = new Date("2026-10-01T23:30:00Z");
    expect(renderValue(now)).toBe("2026-10-01");
    expect(formatOrgDateTime(now, "Asia/Kuala_Lumpur")).toBe("02 Oct 2026 · 07:30");
  });

  it("the issue refuses with no zone and writes the formatted instant (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/configuration/approval-matrix/actions.ts"), "utf8");
    expect(src).toMatch(/if \(!timeZone\) return \{ ok: false, message: ISSUE_TIME_ZONE_UNSET \};/);
    // Phase 2c: the trail also says who issued it and who had made it, beside the instant, so the pattern allows those fields after the two it pins.
    expect(src).toMatch(/\{ issuedAt: formatOrgDateTime\(now, timeZone\), effectiveFrom: day(?:, \w+: [\w.()", ]+)* \}/);
    expect(src).not.toMatch(/\{ issuedAt: now, effectiveFrom: day \}\s*,?\s*\)/);
    expect(ISSUE_TIME_ZONE_UNSET).toMatch(/time zone/);
    expect(ISSUE_TIME_ZONE_UNSET).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });
});
