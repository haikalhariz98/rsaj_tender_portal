import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RETURN_WITHHELD_FIELDS } from "@/lib/award/return-withheld";

/**
 * Go-live N7 (plan `docs/notes/plans/golive-n7.md` step 2, threat T4): the migration that widens the change guard touches no row. It replaces a function and nothing
 * else, so no backfill or later erasure of a decided change can ride in with it. The scan strips comments and quoted text first, so the refusal messages, which name
 * "UPDATE on ConfigurationChange", are not read as statements, while a statement hidden in the function's $$ body still is.
 */

const MIGRATION = join(process.cwd(), "prisma", "migrations", "20261114000000_change_payload_withheld", "migration.sql");
const sql = readFileSync(MIGRATION, "utf8");

const ROW_WRITE = /\b(UPDATE|DELETE\s+FROM|INSERT\s+INTO|TRUNCATE(\s+TABLE)?|MERGE\s+INTO)\s+(ONLY\s+)?(public\.)?"ConfigurationChange"/i;
const ROW_READ = /\b(FROM|JOIN)\s+(ONLY\s+)?(public\.)?"ConfigurationChange"/i;

/// The SQL with `--` comments and single-quoted literals removed. Dollar-quoted bodies are kept, since that is where a hidden statement would sit.
function statementsOf(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''");
}

describe("the N7 migration", () => {
  const code = statementsOf(sql);

  it("catches a row write when one is there (the scan's own control)", () => {
    expect(statementsOf(`UPDATE "ConfigurationChange" SET "payload" = '{}'`)).toMatch(ROW_WRITE);
    expect(statementsOf(`  DELETE FROM public."ConfigurationChange" WHERE true`)).toMatch(ROW_WRITE);
    expect(statementsOf(`INSERT INTO "ConfigurationChange" VALUES (1)`)).toMatch(ROW_WRITE);
    expect(statementsOf(`RAISE EXCEPTION 'UPDATE on "ConfigurationChange" is refused'`)).not.toMatch(ROW_WRITE);
  });

  it("holds no UPDATE, DELETE, INSERT or TRUNCATE on ConfigurationChange, and reads none of its rows", () => {
    expect(code).not.toMatch(ROW_WRITE);
    expect(code).not.toMatch(ROW_READ);
  });

  it("replaces the guard function only, pinning its search_path in its own text, and recreates no trigger", () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\."guard_configuration_change"\(\) RETURNS trigger\s+LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp/);
    expect(code).not.toMatch(/\b(CREATE|DROP|ALTER)\s+TRIGGER\b/i);
    expect(code).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(code).not.toMatch(/\bDROP\s+FUNCTION\b/i);
  });

  it("holds the same withheld names as RETURN_WITHHELD_FIELDS, in the same order", () => {
    const list = /withheld CONSTANT text\[\] := ARRAY\[([^\]]*)\]/.exec(sql);
    expect(list).not.toBeNull();
    const names = [...list![1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(names).toEqual([...RETURN_WITHHELD_FIELDS]);
  });

  it("has no ';' inside a comment", () => {
    const commented = sql.split("\n").filter((line) => /--.*;/.test(line));
    expect(commented).toEqual([]);
  });
});
