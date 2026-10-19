import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { recordCancellationFaults } from "./cancellation";
import { hasFaultText, supplierFaultText } from "./labels";
import { standing } from "./standing";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * 6.13 Part B Run 0 fix round (consider, adapted to M-1 as BD-613-109): one live registration cancelled per registration,
 * held by the database as well as by the act (which locks the supplier row and refuses ALREADY_CANCELLED).
 *
 * The consider asked for a partial unique index on StandingEvent(supplierId) WHERE kind = REGISTRATION_CANCELLED AND
 * withdrawnAt IS NULL. With M-1 a cancellation that stood is ended by a new registration but stays on the record, not
 * withdrawn, so that index would refuse the supplier's next genuine cancellation for ever. Each cancellation therefore
 * names the registration it cancels (cancelsRegistrationOn, the supplier's registeredOn when recorded, CHECK
 * StandingEvent_cancels_registration), and the index is unique on (supplierId, cancelsRegistrationOn) for live rows.
 */

const dir = join(process.cwd(), "prisma/migrations");
const sqlOf = (name: string) => readFileSync(join(dir, name, "migration.sql"), "utf8");
const COLUMN = "20261004014157_cancellation_registration_day";
const INDEX = "20261004014158_one_live_cancellation";

describe("the migrations", () => {
  it("apply in order: the column (with its pre-check, backfill and CHECK), then the index in its own migration", () => {
    const names = readdirSync(dir).filter((d) => d.startsWith("2026")).sort();
    expect(names.indexOf(INDEX)).toBe(names.indexOf(COLUMN) + 1);
  });
  it("the column: the pre-check first, then the column, the backfill from the supplier's registration day, the CHECK", () => {
    const sql = sqlOf(COLUMN);
    const at = (s: string) => sql.indexOf(s);
    expect(sql).toMatch(/SELECT CAST\(\(SELECT 'Pre-check failed: [^']*(''[^']*)*' WHERE EXISTS \(SELECT 1 FROM "StandingEvent" e JOIN "Supplier" s ON s\."id" = e\."supplierId" WHERE e\."kind" = 'REGISTRATION_CANCELLED' AND s\."registeredOn" IS NULL\)\) AS INTEGER\);/);
    expect(at("SELECT CAST")).toBeLessThan(at("ALTER TABLE"));
    expect(at('ADD COLUMN     "cancelsRegistrationOn" TIMESTAMP(3)')).toBeLessThan(at('UPDATE "StandingEvent" e SET "cancelsRegistrationOn" = s."registeredOn"'));
    expect(sql).toMatch(/"StandingEvent_cancels_registration"\s+CHECK \(\("kind" = 'REGISTRATION_CANCELLED'\) = \("cancelsRegistrationOn" IS NOT NULL\)\);/);
    expect(at("UPDATE")).toBeLessThan(at("StandingEvent_cancels_registration"));
  });
  it("the index: a duplicate pre-check first, then the partial unique index on the supplier and the registration", () => {
    const sql = sqlOf(INDEX);
    expect(sql).toMatch(/SELECT CAST\(\(SELECT 'Pre-check failed: [^']*' WHERE EXISTS \(SELECT 1 FROM "StandingEvent" WHERE "kind" = 'REGISTRATION_CANCELLED' AND "withdrawnAt" IS NULL GROUP BY "supplierId", "cancelsRegistrationOn" HAVING count\(\*\) > 1\)\) AS INTEGER\);/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "StandingEvent_one_live_cancellation" ON "StandingEvent"\("supplierId", "cancelsRegistrationOn"\) WHERE "kind" = 'REGISTRATION_CANCELLED' AND "withdrawnAt" IS NULL;/);
    expect(sql.indexOf("SELECT CAST")).toBeLessThan(sql.indexOf("CREATE UNIQUE INDEX"));
  });
  it("no semicolon inside a comment or a string (the WASM engine splits on every one)", () => {
    for (const name of [COLUMN, INDEX]) {
      const sql = sqlOf(name);
      for (const line of sql.split("\n").filter((l) => l.trim().startsWith("--"))) expect(line, name).not.toContain(";");
      for (const lit of sql.matchAll(/'(?:[^']|'')*'/g)) expect(lit[0], name).not.toContain(";");
    }
  });
  it("the schema has the column, with its doc naming the CHECK and the index", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/cancelsRegistrationOn DateTime\?/);
    expect(schema).toMatch(/StandingEvent_one_live_cancellation/);
  });
});

describe("the act names the registration it cancels", () => {
  it("the writer sets cancelsRegistrationOn from the supplier's registeredOn, read under the lock", () => {
    const acts = readFileSync("src/app/suppliers/standing-actions.ts", "utf8");
    expect(acts).toMatch(/kind: "REGISTRATION_CANCELLED", cancellingBodyId: body!\.id, bodyLabelSnapshot: body!\.labelEn, externalReference: ref, cancelsRegistrationOn: s\.registeredOn!,/);
  });
  it("a registered supplier with no registration day recorded is refused, in words (EN and MS)", () => {
    const reading = standing({ status: "REGISTERED", registeredOn: null }, [], [], { autoSuspendOnLapse: null }, "2026-10-04");
    const fs = recordCancellationFaults({ bodyId: "b", reference: "R/1", effectiveOn: "2026-10-04", personActive: true }, { today: "2026-10-04", status: "REGISTERED", registeredOn: null, reading, bodyConfigured: true });
    expect(fs).toEqual([{ code: "REGISTRATION_DAY_NOT_RECORDED", level: "block" }]);
    expect(hasFaultText("REGISTRATION_DAY_NOT_RECORDED")).toBe(true);
    expect(supplierFaultText(fs[0])).toBe("The supplier's registration day is not recorded, so the registration a cancellation ends cannot be named.");
  });
});
