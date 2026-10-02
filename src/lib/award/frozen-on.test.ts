import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { dayOf } from "@/lib/dates";

/**
 * Phase 2 close-out residual 4 (68-C5 family, flagged against accepted 6.11): the frozen tender's
 * day (TenderPack.frozenAt, an instant) is read with dayOf: the organisation's day, and none with no
 * zone, where dayIn fell back to the UTC day.
 */

describe("the frozen tender's day on the award", () => {
  it("07:30 in Kuala Lumpur is that day; with no zone there is no day", () => {
    const frozenAt = new Date("2026-09-30T23:30:00Z");
    expect(dayOf(frozenAt, "Asia/Kuala_Lumpur")).toBe("2026-10-01");
    expect(dayOf(frozenAt, null)).toBeNull();
  });

  it("frozenTenderOf reads it with dayOf, never dayIn (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/award/repo.ts"), "utf8");
    expect(src).toMatch(/frozenOn: pack\.frozenAt \? dayOf\(pack\.frozenAt, timeZone\) : null,/);
    expect(src).not.toMatch(/dayIn\(/);
  });
});
