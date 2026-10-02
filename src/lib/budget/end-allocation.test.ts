import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { dayToDate } from "@/lib/dates";
import { inForceOn } from "@/lib/effective";

import { endAllocationOn } from "./end-allocation";

const FROM = dayToDate("2026-01-01");

describe("ending a budget allocation stores the organisation's day (66-C1 a)", () => {
  it("ends on today, as a day: in force yesterday, not today", () => {
    const r = endAllocationOn({ effectiveFrom: FROM, effectiveTo: null, today: "2026-10-02" });
    expect(r).toEqual({ ok: true, effectiveTo: dayToDate("2026-10-02") });
    if (!r.ok) return;
    expect(r.effectiveTo.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(inForceOn({ effectiveFrom: FROM, effectiveTo: r.effectiveTo }, dayToDate("2026-10-01"))).toBe(true);
    expect(inForceOn({ effectiveFrom: FROM, effectiveTo: r.effectiveTo }, dayToDate("2026-10-02"))).toBe(false);
  });
  it("refuses with the time zone not set: today is never UTC's", () => {
    const r = endAllocationOn({ effectiveFrom: FROM, effectiveTo: null, today: null });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("TIME_ZONE_UNSET");
      expect(r.message).toMatch(/time zone is not set.*Configuration › Organisation/);
    }
  });
  it("refuses one already ended (as re-judged on the locked row), naming its end", () => {
    const r = endAllocationOn({ effectiveFrom: FROM, effectiveTo: dayToDate("2026-09-30"), today: "2026-10-02" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("ALREADY_ENDED");
      expect(r.message).toMatch(/30 Sep 2026/);
    }
  });
  it("on its first day, or before it begins, it is not ended: that would leave it no day in force", () => {
    for (const today of ["2026-01-01", "2025-12-31"]) {
      const r = endAllocationOn({ effectiveFrom: FROM, effectiveTo: null, today });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("NOT_BEGUN");
    }
    expect(endAllocationOn({ effectiveFrom: FROM, effectiveTo: null, today: "2026-01-02" }).ok).toBe(true);
  });
});

describe("the End action (source scan, 66-C1 a)", () => {
  const src = readFileSync("src/app/configuration/budget/actions.ts", "utf8");
  const body = src.slice(src.indexOf("export async function endAllocation"), src.indexOf("// ------------------------------------------------------------------ budget codes"));

  it("never stores the current instant as the end; the rule decides the day", () => {
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/effectiveTo\s*=\s*new Date\(\)/);
    expect(body).toMatch(/endAllocationOn\(\{/);
  });
  it("reads the organisation's today, never a UTC fallback", () => {
    expect(body).toMatch(/todayIn\(new Date\(\), org\.timeZone\)/);
    expect(body).not.toMatch(/toISOString\(\)\.slice/);
  });
  it("re-judges on the locked row inside the transaction that writes, and writes the locked judgement's day", () => {
    const tx = body.slice(body.indexOf("db.$transaction"));
    expect(tx).toMatch(/SELECT id FROM "BudgetAllocation" WHERE id = \$\{id\} FOR UPDATE/);
    expect(tx.indexOf("FOR UPDATE")).toBeLessThan(tx.indexOf("const locked = await judge(tx)"));
    expect(tx).toMatch(/const effectiveTo = locked\.result\.effectiveTo;/);
    expect(tx.indexOf("const locked = await judge(tx)")).toBeLessThan(tx.indexOf("tx.budgetAllocation.update"));
    expect(tx).toMatch(/writeAudit\(/);
  });
});
