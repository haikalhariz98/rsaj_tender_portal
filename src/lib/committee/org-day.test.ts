import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderValue } from "@/lib/audit/diff";
import { formatOrgDateTime } from "@/lib/format";

/**
 * Phase 2 close-out, 68-C5 grep: a sitting's minutedAt and a matter's withdrawnAt are instants (the
 * server's clock). Passed to the trail as Dates they were written by renderValue as their UTC day;
 * they are now written on the organisation's clock, as the opening's and evaluation's rows are.
 */

const KL = "Asia/Kuala_Lumpur";
const at = new Date("2026-10-01T23:30:00Z"); // 07:30 on 2 October in Kuala Lumpur

describe("a sitting minuted and a matter withdrawn are written on the organisation's clock (68-C5)", () => {
  it("07:30 in Kuala Lumpur is written as that day and time, where renderValue wrote the UTC day before", () => {
    expect(renderValue(at)).toBe("2026-10-01");
    expect(formatOrgDateTime(at, KL)).toBe("02 Oct 2026 · 07:30");
    expect(formatOrgDateTime(at, null)).toBe("01 Oct 2026 · 23:30 (UTC — time zone not set)");
  });

  it("the two acts pass the instants formatted, never as Dates (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/committees/actions.ts"), "utf8");
    expect(src).toMatch(/minutedAt: formatOrgDateTime\(minutedAt, s\.timeZone\)/);
    expect(src).toMatch(/minutedAt: m\.minutedAt \? formatOrgDateTime\(m\.minutedAt, s\.timeZone\) : null/);
    expect(src).toMatch(/withdrawnAt: formatOrgDateTime\(withdrawnAt, s\.timeZone\)/);
    expect(src).not.toMatch(/diffFields\(\{ withdrawnAt: null \}, \{ withdrawnAt,/);
  });
});
