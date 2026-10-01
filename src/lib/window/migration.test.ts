import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.5's hand-written rules in the invitation_window migration: Prisma does not model CHECKs or
 * partial indexes, so they are held here (and confirmed in pg_constraint / pg_indexes after a
 * rebuild). A rule removed from the SQL fails here.
 */

const dir = join(process.cwd(), "prisma/migrations");
const name = readdirSync(dir).find((d) => d.endsWith("_invitation_window"))!;
const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");

describe("the invitation window's database rules", () => {
  it.each([
    ["WindowPolicy_days_not_negative", /"minAdvertisementDays"/],
    ["WindowPolicy_closing_time", /"defaultClosingTime" ~ '\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'/],
    ["WindowPolicy_named_channel", /\("advertisementDayRule" = 'NAMED_CHANNEL'\) = \("advertisementChannelId" IS NOT NULL\)/],
    ["DocumentFeeFloor_minimum_not_negative", /"minimum" >= 0/],
    ["HolidayCalendar_weekend_days", /"weekendDays" <@ ARRAY\[1, 2, 3, 4, 5, 6, 7\]/],
    ["ExerciseWindow_purchase_days", /"purchaseFromDay" <= "purchaseCloseDay"/],
    ["ExerciseWindow_published", /"publishedAt" IS NULL OR \("advertisementDay" IS NOT NULL AND "policySnapshot" IS NOT NULL\)/],
    ["ClosingChange_one_outcome", /NOT \("appliedAt" IS NOT NULL AND "refusedAt" IS NOT NULL\)/],
    ["WindowCancellation_one_outcome", /NOT \("appliedAt" IS NOT NULL AND "refusedAt" IS NOT NULL\)/],
    ["DocumentSale_void_reason", /"voidedAt" IS NULL OR btrim\("voidReason"\) <> ''/],
    ["Addendum_issued", /"status" <> 'ISSUED' OR \("number" IS NOT NULL AND "issuedOn" IS NOT NULL AND "renderedText" IS NOT NULL/],
    ["Addendum_void_reason", /"status" <> 'VOID' OR btrim\("voidReason"\) <> ''/],
    ["WindowNotice_one_parent", /num_nonnulls\("closingChangeId", "cancellationId"\) = 1/],
  ])("%s", (constraint, rule) => {
    const m = new RegExp(`ADD CONSTRAINT "${constraint}"\\s*CHECK\\s*([\\s\\S]*?);`).exec(sql);
    expect(m, constraint).not.toBeNull();
    expect(m![1]).toMatch(rule);
  });

  it("one live sale per party, as a partial unique index", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "DocumentSale_one_live_per_party" ON "DocumentSale"\("windowId", "partyId"\) WHERE "voidedAt" IS NULL;/);
  });

  it("no comment holds a semicolon (the WASM engine splits on every one)", () => {
    expect(sql.split("\n").filter((l) => l.trim().startsWith("--") && l.includes(";"))).toEqual([]);
  });

  it("no closing kind for 6.4's approved dates (X-2: they are the pack's)", () => {
    expect(sql).toMatch(/CREATE TYPE "ClosingChangeKind" AS ENUM \('CORRECTION', 'EXTENSION'\);/);
  });
});
