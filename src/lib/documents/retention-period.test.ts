import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { documentFaultText, retentionText } from "./labels";
import { disposalFault, isRetentionPeriod, retentionState, type RetentionRule } from "./retention";

/**
 * BD-DS-10 as ruled (2026-10-01): the boundary stands (N months from day D elapses on
 * D + N months, month-end clamped), and zero months is refused by a CHECK rather than
 * read as "not set". Null is the only "not set". A period that is not one can reach
 * `retentionState` only from a snapshot taken before the CHECK; it never elapses and
 * blocks disposal naming it.
 */

const rule = (x: Partial<RetentionRule> = {}): RetentionRule => ({ retentionMonths: 84, retentionTrigger: "RECEIVED", disposalMethod: "DESTROY", disposalAuthorityRoleCode: "RMO", ...x });

describe("a retention period is at least one whole month", () => {
  it("one month is the smallest period; zero, negatives and fractions are not periods", () => {
    expect(isRetentionPeriod(1)).toBe(true);
    expect(isRetentionPeriod(84)).toBe(true);
    for (const m of [0, -1, 0.5, 1.5, Number.NaN]) expect(isRetentionPeriod(m), String(m)).toBe(false);
  });

  it("at the boundary: one month runs and elapses like any other", () => {
    expect(retentionState(rule({ retentionMonths: 1 }), "2026-09-01", "2026-09-30")).toEqual({ state: "RUNNING", elapsesOn: "2026-10-01" });
    expect(retentionState(rule({ retentionMonths: 1 }), "2026-09-01", "2026-10-01")).toEqual({ state: "ELAPSED", elapsedOn: "2026-10-01" });
  });

  it("zero is never read as not set, and never elapses, however far ahead today is", () => {
    for (const m of [0, -3, 2.5]) {
      const s = retentionState(rule({ retentionMonths: m }), "2000-01-01", "2999-12-31");
      expect(s).toEqual({ state: "PERIOD_INVALID", months: m });
    }
    // Even with no trigger set: the period is wrong, and that is what is said.
    expect(retentionState(rule({ retentionMonths: 0, retentionTrigger: null }), null, "2026-10-01").state).toBe("PERIOD_INVALID");
  });

  it("null alone is not set", () => {
    expect(retentionState(rule({ retentionMonths: null }), "2000-01-01", "2999-12-31")).toEqual({ state: "NOT_SET", missing: ["PERIOD"] });
  });

  it("disposal is refused on a period that is not one, in words, with the way out", () => {
    const f = disposalFault({ retention: rule({ retentionMonths: 0 }), triggerDay: "2000-01-01" }, [], [], "2999-12-31");
    expect(f.map((x) => x.code)).toEqual(["RETENTION_PERIOD_INVALID"]);
    const t = documentFaultText(f[0]);
    expect(t).toBe("Its retention period of 0 months is not a period, so it is never disposed of. A period is at least one month: correct it on the class.");
    expect(t).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    expect(retentionText({ state: "PERIOD_INVALID", months: 0 })).toBe("Not a period (0 months): never disposed of until it is corrected on the class");
  });
});

describe("the database refuses what the rule refuses (migration document_store_rulings)", () => {
  const dir = join(process.cwd(), "prisma/migrations");
  const name = readdirSync(dir).find((d) => d.endsWith("_document_store_rulings"));
  const sql = name ? readFileSync(join(dir, name, "migration.sql"), "utf8") : "";

  it("the migration exists and adds the CHECK, null allowed", () => {
    expect(name).toBeTruthy();
    expect(sql).toMatch(/ADD CONSTRAINT "DocumentClass_retention_positive"\s+CHECK \("retentionMonths" IS NULL OR "retentionMonths" > 0\)/);
  });

  it("no semicolon inside a comment (the WASM engine splits on every one)", () => {
    for (const line of sql.split("\n")) if (/^\s*--/.test(line)) expect(line).not.toContain(";");
  });
});
