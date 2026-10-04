import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Review S7 (6.13 Part B, Run 1a fix round): each switch and ceiling records where its own value came from. One
 * provenance over two release switches, or over a bond rate, a quotation ceiling and the letters' switch, could only
 * say one of them truly: a STATED release on making good beside an ASSUMED retention release would read as both stated.
 * The shared columns held nothing (no editor before run 2/3), so they are dropped, after a pre-check, in favour of one
 * nullable column each, shipped unset.
 */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const m = /\nmodel PostAwardPolicy \{([\s\S]*?)\n\}/.exec(schema)![1];
const fieldLine = (f: string) => m.split("\n").find((l) => new RegExp(`^\\s+${f}\\s`).test(l)) ?? "";
const DIR = path.join(ROOT, "prisma/migrations/20261004100601_post_award_provenance_split");

/// Each switch or ceiling, and the provenance that is its own.
const OWN: Record<string, string> = {
  performanceBondReleaseAt: "performanceBondReleaseProvenance",
  retentionBalanceReleaseAt: "retentionBalanceReleaseProvenance",
  nominatedBondPct: "nominatedBondProvenance",
  nominatedQuotationCeiling: "nominatedQuotationCeilingProvenance",
  nominationLetterForms: "nominationLetterFormsProvenance",
};

describe("S7: one provenance per switch and ceiling", () => {
  it("each has its own nullable provenance column, with no default, right after it", () => {
    const lines = m.split("\n").map((l) => l.trim().split(/\s+/)[0]);
    for (const [f, p] of Object.entries(OWN)) {
      expect(fieldLine(p), p).toMatch(/Provenance\?/);
      expect(fieldLine(p), p).not.toContain("@default");
      expect(lines.indexOf(p), p).toBe(lines.indexOf(f) + 1);
    }
  });

  it("the shared columns are gone, so no provenance speaks for two values", () => {
    expect(fieldLine("releaseProvenance")).toBe("");
    expect(fieldLine("nominatedProvenance")).toBe("");
  });

  it("the migration: the pre-check first, the five columns with no DEFAULT, the two shared ones dropped, no row written", () => {
    const sql = readFileSync(path.join(DIR, "migration.sql"), "utf8");
    const statements = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n");
    expect(statements.indexOf("SELECT CAST((SELECT 'Pre-check failed: a post-award policy already records the provenance of its releases or its nominated settings")).toBe(0);
    expect(statements).toMatch(/WHERE EXISTS \(SELECT 1 FROM "PostAwardPolicy" WHERE "releaseProvenance" IS NOT NULL OR "nominatedProvenance" IS NOT NULL\)\) AS INTEGER\);/);
    for (const p of Object.values(OWN)) expect(statements, p).toMatch(new RegExp(`ADD COLUMN\\s+"${p}" "Provenance"[,;]`));
    expect(statements).toMatch(/DROP COLUMN "releaseProvenance"/);
    expect(statements).toMatch(/DROP COLUMN "nominatedProvenance"/);
    expect(statements).not.toMatch(/\bDEFAULT\b/);
    expect(statements).not.toMatch(/^\s*(UPDATE|INSERT|DELETE)\b/m);
    for (const l of sql.split("\n").filter((x) => x.trim().startsWith("--"))) expect(l, l).not.toContain(";");
  });
});
