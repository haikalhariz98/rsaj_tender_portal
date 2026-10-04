import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isSulitField, SULIT_FIELDS } from "@/lib/sulit-fields";

/**
 * Review S4 (6.13 Part B, Run 1a fix round): a contract matter's amount and ratio are SULIT wherever shown (a CONTRACT
 * matter's amount is not decided, read as SULIT, BD-613-73). The registry matches whole words, so the columns take
 * names of their own before any data exists: routedValue was also the approval module's function and the variation
 * order's figure, and ratioNum and ratioDen said nothing of what they are a ratio of.
 */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const model = /\nmodel ContractMatter \{([\s\S]*?)\n\}/.exec(schema)![1];
const NAMES = ["matterRoutedValue", "matterRatioNum", "matterRatioDen"] as const;
const DIR = path.join(ROOT, "prisma/migrations/20261004100501_contract_matter_sulit_names");

describe("S4: the matter's amount and ratio, named for the registry", () => {
  it("the model holds them under their new names, Decimal(18,2), and not the old ones", () => {
    for (const f of NAMES) expect(model, f).toMatch(new RegExp(`\\n\\s+${f}\\s+Decimal\\?\\s+@db\\.Decimal\\(18, 2\\)`));
    for (const f of ["routedValue", "ratioNum", "ratioDen"]) expect(model, f).not.toMatch(new RegExp(`\\n\\s+${f}\\s`));
  });

  it("each is registered SULIT, saying what it is", () => {
    for (const f of NAMES) {
      expect(isSulitField(f), f).toBe(true);
      expect(SULIT_FIELDS.find((x) => x.field === f)!.what, f).toMatch(/contract matter/);
    }
  });

  it("each name is specific: no source outside the schema and the generated client uses it yet (the whole-word scan cannot misfire)", () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
    const users = walk(path.join(ROOT, "src")).filter((f) => /\.tsx?$/.test(f) && !f.includes("/generated/") && !f.endsWith(".test.ts") && !f.endsWith("sulit-fields.ts")).filter((f) => NAMES.some((n) => new RegExp(`\\b${n}\\b`).test(readFileSync(f, "utf8"))));
    expect(users).toEqual([]);
  });

  it("the migration: the pre-check first, then the renames, then the shape CHECK restated under the new names", () => {
    const sql = readFileSync(path.join(DIR, "migration.sql"), "utf8");
    const statements = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n");
    expect(statements.indexOf("SELECT CAST((SELECT 'Pre-check failed: a contract matter already holds a routed value or a ratio")).toBe(0);
    expect(statements).toMatch(/WHERE EXISTS \(SELECT 1 FROM "ContractMatter" WHERE "routedValue" IS NOT NULL OR "ratioNum" IS NOT NULL OR "ratioDen" IS NOT NULL\)\) AS INTEGER\);/);
    for (const [from, to] of [["routedValue", "matterRoutedValue"], ["ratioNum", "matterRatioNum"], ["ratioDen", "matterRatioDen"]]) expect(statements).toContain(`ALTER TABLE "ContractMatter" RENAME COLUMN "${from}" TO "${to}";`);
    expect(statements).toContain(`ALTER TABLE "ContractMatter" DROP CONSTRAINT "ContractMatter_shape";`);
    expect(statements).toMatch(/"ContractMatter_shape" CHECK \(\n\s+\("matterRoutedValue" IS NULL OR "matterRoutedValue" >= 0\)\n\s+AND \(\("matterRatioNum" IS NULL\) = \("matterRatioDen" IS NULL\)\)\n\s+AND \("matterRatioDen" IS NULL OR "matterRatioDen" > 0\)\n\s+AND \("matterRatioNum" IS NULL OR "matterRatioNum" >= 0\)\n\s+AND \("closedAt" IS NULL OR "closeReason" <> ''\)\n\);/);
    for (const l of sql.split("\n").filter((x) => x.trim().startsWith("--"))) expect(l, l).not.toContain(";");
  });
});
