import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, rawCallText, rawCalls } from "@/lib/scan/source";

/**
 * 6.13 Part B run 1a (ADR 0029, OD-B5 A, BD-613-73): a post-award matter decided on an approval route is one record,
 * ContractMatter. Built with its CHECKs and the pre-check; no act writes it before run 1b, which this scan holds until
 * run 1b names the writers.
 */

const ROOT = path.join(__dirname, "../../..");
const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(path.join(ROOT, "prisma/migrations/20261004100301_contract_matter/migration.sql"), "utf8");
const statements = sql.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).join("\n");
const model = (name: string) => new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];

describe("the model", () => {
  it("ContractMatterKind has the seven matters, created whole", () => {
    const m = /\nenum ContractMatterKind \{([\s\S]*?)\n\}/.exec(schema)![1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
    expect(m).toEqual(["EOT", "PERIOD_EXTENSION", "LAD_WAIVER", "TERMINATION", "NOMINATED_INCREASE", "NOMINATION", "LOSS_EXPENSE"]);
    expect(statements).toContain(`CREATE TYPE "ContractMatterKind" AS ENUM ('EOT', 'PERIOD_EXTENSION', 'LAD_WAIVER', 'TERMINATION', 'NOMINATED_INCREASE', 'NOMINATION', 'LOSS_EXPENSE');`);
  });
  it("the matter: its contract, kind, reference, value or exact ratio, condition, approval of record, close, who", () => {
    const m = model("ContractMatter");
    // Run 1a fix round (review S4, faithful): the amount and the ratio renamed for the SULIT registry
    // (contract-matter-sulit.test.ts); the same fields, the same types.
    for (const f of ["organisationId", "contractId", "kind", "reference", "matterRoutedValue", "matterRatioNum", "matterRatioDen", "cond", "approvedRouteId", "closedAt", "closeReason", "personId", "recordedAt"]) expect(m, f).toMatch(new RegExp(`\\n\\s+${f}\\s`));
    expect(m).toMatch(/matterRoutedValue\s+Decimal\?\s+@db\.Decimal\(18, 2\)/);
    expect(m).toMatch(/approvedRouteId String\?\s+@unique/);
    expect(m).toMatch(/contract\s+Contract\s+@relation\(fields: \[contractId\], references: \[id\], onDelete: Restrict\)/);
    expect(m).toMatch(/@@unique\(\[organisationId, reference\]\)/);
  });
  it("routes and committee matters point to it, Restrict", () => {
    expect(model("ApprovalInstance")).toMatch(/contractMatter\s+ContractMatter\?\s+@relation\("ContractMatterRoutes", fields: \[contractMatterId\], references: \[id\], onDelete: Restrict\)/);
    expect(model("CommitteeDecision")).toMatch(/contractMatter\s+ContractMatter\? @relation\(fields: \[contractMatterId\], references: \[id\], onDelete: Restrict\)/);
  });
});

describe("the migration", () => {
  it("the pre-check runs first: no route or committee matter is a CONTRACT matter yet (the SELECT CAST pattern)", () => {
    const pre = statements.indexOf(`SELECT CAST((SELECT 'Pre-check failed: an approval route or a committee matter is already a CONTRACT matter`);
    expect(pre).toBe(0);
    expect(statements).toMatch(/WHERE EXISTS \(SELECT 1 FROM "ApprovalInstance" WHERE "matterKind" = 'CONTRACT'\) OR EXISTS \(SELECT 1 FROM "CommitteeDecision" WHERE "matterKind" = 'CONTRACT'\)\) AS INTEGER\);/);
  });
  it("the CHECKs: a CONTRACT route names its matter and only it does; a committee matter names one only as a CONTRACT matter; the matter's shape", () => {
    expect(statements).toContain(`ALTER TABLE "ApprovalInstance" ADD CONSTRAINT "ApprovalInstance_contract_matter" CHECK (("matterKind" = 'CONTRACT') = ("contractMatterId" IS NOT NULL));`);
    expect(statements).toContain(`ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_contract_matter" CHECK ("contractMatterId" IS NULL OR "matterKind" = 'CONTRACT');`);
    expect(statements).toMatch(/"ContractMatter_shape" CHECK \(\n\s+\("routedValue" IS NULL OR "routedValue" >= 0\)\n\s+AND \(\("ratioNum" IS NULL\) = \("ratioDen" IS NULL\)\)\n\s+AND \("ratioDen" IS NULL OR "ratioDen" > 0\)\n\s+AND \("ratioNum" IS NULL OR "ratioNum" >= 0\)\n\s+AND \("closedAt" IS NULL OR "closeReason" <> ''\)\n\);/);
  });
  it("one open termination matter a contract (partial unique index)", () => {
    expect(statements).toContain(`CREATE UNIQUE INDEX "ContractMatter_one_open_termination" ON "ContractMatter"("contractId") WHERE "kind" = 'TERMINATION' AND "closedAt" IS NULL;`);
  });
  it("no semicolon inside a comment (the WASM engine splits on every one)", () => {
    for (const l of sql.split("\n").filter((x) => x.trim().startsWith("--"))) expect(l, l).not.toContain(";");
  });
});

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    if (rel === path.normalize("src/generated")) return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}

describe("no writer before run 1b (single-writer scan)", () => {
  const sources = [...files("src/app"), ...files("src/lib"), ...files("prisma")].map((file) => ({ file, src: readFileSync(path.join(ROOT, file), "utf8") }));
  it("no product code or demo writes ContractMatter, nor sets a route's or a committee matter's contractMatterId", () => {
    const found: string[] = [];
    for (const { file, src } of sources) {
      const m = lex(src);
      if (/\.contractMatter\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(m)) found.push(`${file}: contractMatter write`);
      // The one named exception: tablingOf's keys builder names the key for a CONTRACT matter's committee matter (a pure
      // value; tabling.test.ts holds that no act passes it a CONTRACT matter before run 1b).
      const keyBuilder = path.normalize("src/lib/matter/tabling.ts");
      if (/\bcontractMatterId\s*:/.test(m) && !(file === keyBuilder && (m.match(/\bcontractMatterId\s*:/g) ?? []).length === 2 && /matterKind: "CONTRACT"; matterRef: string \| null; contractMatterId: string/.test(src))) found.push(`${file}: contractMatterId set`);
      for (const c of rawCalls(m)) {
        const text = rawCallText(src, m, c);
        if (text === null) found.push(`${file}: an unreadable raw call`);
        else if (/"ContractMatter"/.test(text) && /\b(INSERT|UPDATE|DELETE)\b/i.test(text)) found.push(`${file}: raw write to ContractMatter`);
      }
    }
    expect(found).toEqual([]);
  });
});
