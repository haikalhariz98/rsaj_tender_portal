import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.13 Part B run 1b, C3: the schema of time and damages (plan B4 run 1; BD-613-112). Read from the migration folders
 * and schema.prisma. Blind spots, declared: the SQL is read as text (a statement built at run time would not be seen),
 * and whether Postgres accepts it is verify.sh's (it rebuilt perolehan_verify from these folders, "-- This is an empty
 * migration."), not this test's.
 */

const ROOT = process.cwd();
const DIR = path.join(ROOT, "prisma/migrations");
const sqlOf = (d: string) => readFileSync(path.join(DIR, d, "migration.sql"), "utf8");
const RUN1B = readdirSync(DIR).filter((d) => /^2026100411\d{4}_/.test(d)).sort();
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

describe("run 1b's migrations", () => {
  it("each enum value it uses lands alone in its own migration (BD-613-112)", () => {
    const values: Record<string, string> = {
      "20261004110101_baseline_reason_extension_of_time": `ALTER TYPE "BaselineReason" ADD VALUE 'EXTENSION_OF_TIME';`,
      "20261004110102_baseline_reason_period_extension": `ALTER TYPE "BaselineReason" ADD VALUE 'PERIOD_EXTENSION';`,
      "20261004110103_attachment_purpose_delay_notice": `ALTER TYPE "AttachmentPurpose" ADD VALUE 'DELAY_NOTICE';`,
      "20261004110104_attachment_purpose_meteorological_record": `ALTER TYPE "AttachmentPurpose" ADD VALUE 'METEOROLOGICAL_RECORD';`,
      "20261004110105_attachment_purpose_eot_calculation": `ALTER TYPE "AttachmentPurpose" ADD VALUE 'EOT_CALCULATION';`,
    };
    for (const [dir, stmt] of Object.entries(values)) {
      expect(RUN1B, dir).toContain(dir);
      const statements = sqlOf(dir).split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
      expect(statements, dir).toEqual([stmt]);
    }
    for (const d of RUN1B) expect((sqlOf(d).match(/ADD VALUE/g) ?? []).length, d).toBeLessThanOrEqual(1);
  });

  it("no comment holds a semicolon, no DO block, and the main migration runs its pre-check first", () => {
    for (const d of RUN1B) {
      const sql = sqlOf(d);
      for (const line of sql.split("\n")) if (line.trim().startsWith("--")) expect(line.includes(";"), `${d}: ${line}`).toBe(false);
      expect(/\bDO\s+\$/.test(sql), d).toBe(false);
    }
    const main = sqlOf("20261004110201_post_award_time");
    const firstStatement = main.split("\n").find((l) => l.trim() && !l.trim().startsWith("--"))!;
    expect(firstStatement).toMatch(/^SELECT CAST\(\(SELECT 'Pre-check failed: /);
  });

  it("the CHECKs: a claim's shape, a reason's days and group, an extension later, a waiver within its LAD amount", () => {
    const main = sqlOf("20261004110201_post_award_time");
    expect(main).toMatch(/ADD CONSTRAINT "EotClaim_shape"\s+CHECK \(\(\("scope" = 'SECTION'\) = \("sectionRef" IS NOT NULL\)\)/);
    expect(main).toMatch(/NOT "isWeather" OR "entitlement" IS NULL OR "exceptional" IS NOT NULL/);
    expect(main).toMatch(/"entitlement" IS DISTINCT FROM 'NOT_ENTITLED' OR length\(btrim\("entitlementReason"\)\) > 0/);
    expect(main).toMatch(/ADD CONSTRAINT "EotReason_shape"\s+CHECK \("delayUntil" > "delayFrom" AND "extensionDays" >= 0 AND \(\("concurrency" = 'CONCURRENT'\) = \("group" IS NOT NULL\)\)\)/);
    expect(main).toMatch(/ADD CONSTRAINT "ExtensionOfTime_shape"\s+CHECK \("grantedDays" > 0 AND "computedDays" >= 0 AND "newCompletion" > "previousCompletion"\)/);
    expect(main).toMatch(/ADD CONSTRAINT "LadWaiver_shape"\s+CHECK \("ladAmount" > 0 AND "waived" > 0 AND "waived" <= "ladAmount"/);
    expect(main).toMatch(/ADD CONSTRAINT "PeriodExtension_shape"\s+CHECK \("newExpiry" > "currentExpiry"/);
    expect(main).toMatch(/ADD CONSTRAINT "LossExpenseClaim_shape"\s+CHECK \("claimed" >= 0/);
  });

  it("each matter record points to its ContractMatter once (matterId unique), and every new model carries organisationId", () => {
    for (const m of ["EotClaim", "PeriodExtension", "LadWaiver"]) expect(schema, m).toMatch(new RegExp(`model ${m} \\{[\\s\\S]*?\\n  matterId\\s+String\\s+@unique\\n`));
    expect(schema).toMatch(/model LossExpenseClaim \{[\s\S]*?\n  matterId\s+String\?\s+@unique\n/);
    for (const m of ["DelayNotice", "EotClaimNotice", "EotClaim", "EotReason", "ExtensionOfTime", "LossExpenseClaim", "PeriodExtension", "PeriodAgreement", "LadWaiver"]) {
      const body = new RegExp(`\\nmodel ${m} \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
      expect(body, m).toMatch(/\n\s+organisationId\s+String\n/);
    }
  });

  it("BD-613-135: one live EOT certificate a claim and one live agreement an extension are held in lib, not by a unique key", () => {
    expect(schema).toMatch(/model ExtensionOfTime \{[\s\S]*?\n  claimId\s+String\n/);
    expect(schema).toMatch(/model PeriodAgreement \{[\s\S]*?\n  extensionId\s+String\n/);
  });
});
