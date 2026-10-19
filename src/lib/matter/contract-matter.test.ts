import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex, rawCallText, rawCalls } from "@/lib/scan/source";
import { toPosix } from "@/lib/scan/files";

/**
 * 6.13 Part B run 1a (ADR 0029, OD-B5 A, BD-613-73): a post-award matter decided on an approval route is one record,
 * ContractMatter. Built with its CHECKs and the pre-check. Run 1b names its one writer (the scan at the end).
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
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [toPosix(rel)] : [];
  });
}

/// A raw call's text writes ContractMatter: it names the table and inserts, updates or deletes. Run 1b C3 (flagged against
/// run 1a): a row lock (`FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`) is a read, not a write, so it is taken out first.
const rawWritesMatter = (text: string) => /"ContractMatter"/.test(text) && /\b(INSERT|UPDATE|DELETE)\b/i.test(text.replace(/\bFOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|SHARE)\b/gi, ""));

describe("the raw-write test (self-test, run 1b C3)", () => {
  it("a lock is a read; an update, insert or delete of ContractMatter is a write", () => {
    expect(rawWritesMatter(`SELECT id FROM "ContractMatter" WHERE id = $1 FOR UPDATE`)).toBe(false);
    expect(rawWritesMatter(`SELECT id FROM "ContractMatter" WHERE id = $1 FOR NO KEY UPDATE`)).toBe(false);
    expect(rawWritesMatter(`UPDATE "ContractMatter" SET "closedAt" = now()`)).toBe(true);
    expect(rawWritesMatter(`SELECT id FROM "ContractMatter" FOR UPDATE; UPDATE "ContractMatter" SET x = 1`)).toBe(true);
    expect(rawWritesMatter(`DELETE FROM "ContractMatter"`)).toBe(true);
  });
});

/**
 * 6.13 Part B run 1b C8 (flagged against run 1a, stricter): run 1a's "no writer before run 1b" becomes "one named writer".
 * ContractMatter is written only by src/lib/matter/write.ts, through the four writers it exports; a route names its
 * matter only in sendMatterRoute's create (src/lib/matter/route-write.ts); a committee matter names it only through
 * tablingOf's keys (src/lib/matter/tabling.ts), spread by the one act that tables a CONTRACT matter (tableContractMatter).
 * Nothing writes it in raw SQL, nor through a nested relation write.
 *
 * Blind spots, declared: a computed key (`["contractMatterId"]`) or a data object built under another name and passed
 * whole; a write through a client not named `tx`, `db` or `client` is still found (the delegate is matched on any
 * receiver); a `contractMatterId:` in a where clause fails closed (it is reported, and must be named here).
 */
const WRITER_FILE = toPosix(path.normalize("src/lib/matter/write.ts"));
const ROUTE_FILE = toPosix(path.normalize("src/lib/matter/route-write.ts"));
const KEY_FILE = toPosix(path.normalize("src/lib/matter/tabling.ts"));
const TABLING_ACTS = toPosix(path.normalize("src/app/projects/[id]/matter-actions.ts"));

/// What one source does to ContractMatter that the rule restricts, after comments and strings are lexed out.
function matterWritesOf(file: string, src: string): string[] {
  const found: string[] = [];
  const m = lex(src);
  if (/\.contractMatter\.(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\b/.test(m) && file !== WRITER_FILE) found.push(`${file}: contractMatter write`);
  if (/\bcontractMatter\s*:\s*\{\s*(connect|connectOrCreate|create|update|upsert|delete|disconnect|set)\b/.test(m)) found.push(`${file}: nested contractMatter write`);
  // A select of the key (`contractMatterId: true`) is a read; any other `contractMatterId:` sets or filters it.
  const sets = (m.replace(/\bcontractMatterId\s*:\s*true\b/g, "").match(/\bcontractMatterId\s*:/g) ?? []).length;
  const allowed = file === KEY_FILE ? 2 : file === ROUTE_FILE ? 1 : 0;
  if (sets !== allowed) found.push(`${file}: contractMatterId set ${sets} time(s), ${allowed} named`);
  if (/tablingOf\(\{ kind: "CONTRACT"/.test(src) && file !== TABLING_ACTS) found.push(`${file}: tables a CONTRACT matter`);
  for (const c of rawCalls(m)) {
    const text = rawCallText(src, m, c);
    if (text === null) found.push(`${file}: an unreadable raw call`);
    else if (rawWritesMatter(text)) found.push(`${file}: raw write to ContractMatter`);
  }
  return found;
}

describe("the one-writer scan's self-test", () => {
  it("a write outside the writer, a nested write, an unnamed key set and a select are told apart", () => {
    expect(matterWritesOf("src/app/x.ts", "await tx.contractMatter.update({ where: { id } });")).toEqual(["src/app/x.ts: contractMatter write"]);
    expect(matterWritesOf(WRITER_FILE, "await tx.contractMatter.update({ where: { id } });")).toEqual([]);
    expect(matterWritesOf("src/app/x.ts", "await tx.approvalInstance.update({ data: { contractMatter: { connect: { id } } } });")).toEqual(["src/app/x.ts: nested contractMatter write"]);
    expect(matterWritesOf("src/app/x.ts", "select: { contractMatterId: true }")).toEqual([]);
    expect(matterWritesOf("src/app/x.ts", "data: { contractMatterId: m.id }")).toEqual(["src/app/x.ts: contractMatterId set 1 time(s), 0 named"]);
    expect(matterWritesOf(ROUTE_FILE, "data: { contractMatterId: m.id, other: { contractMatterId: x } }")).toEqual([`${ROUTE_FILE}: contractMatterId set 2 time(s), 1 named`]);
    expect(matterWritesOf("src/app/x.ts", 'tablingOf({ kind: "CONTRACT", id })')).toEqual(["src/app/x.ts: tables a CONTRACT matter"]);
    expect(matterWritesOf("src/app/x.ts", 'await tx.$executeRaw`UPDATE "ContractMatter" SET x = 1`;')).toEqual(["src/app/x.ts: raw write to ContractMatter"]);
    // A comment or a string naming the write is not code.
    expect(matterWritesOf("src/app/x.ts", '// tx.contractMatter.update(\nconst s = "contractMatterId: m.id";')).toEqual([]);
  });
});

describe("one named writer (single-writer scan, run 1b)", () => {
  const sources = [...files("src/app"), ...files("src/lib"), ...files("prisma")].map((file) => ({ file, src: readFileSync(path.join(ROOT, file), "utf8") }));
  it("only src/lib/matter/write.ts writes ContractMatter; only the route's create and the tabling keys name it", () => {
    expect(sources.flatMap(({ file, src }) => matterWritesOf(file, src))).toEqual([]);
  });
  it("the writer exports exactly its four writers, and each writes the matter", () => {
    const src = readFileSync(path.join(ROOT, WRITER_FILE), "utf8");
    const exported = [...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((x) => x[1]);
    expect(exported.sort()).toEqual(["closeMatter", "markSent", "openMatter", "writeApprovalOfRecord"]);
    for (const n of exported) {
      const body = src.slice(src.indexOf(`function ${n}(`)).split(/\n}\n/)[0];
      expect(body, n).toMatch(/tx\.contractMatter\.(create|updateMany)\(/);
    }
  });
  it("the route's key is set only in sendMatterRoute's create, and the committee matter's only by tableContractMatter spreading tablingOf's keys", () => {
    const route = readFileSync(path.join(ROOT, ROUTE_FILE), "utf8");
    const send = route.slice(route.indexOf("export async function sendMatterRoute("));
    expect(send.slice(0, send.indexOf("\n}\n"))).toMatch(/tx\.approvalInstance\.create\(\{\n\s+data: \{\n\s+organisationId: c\.l\.org\.id,\n\s+matterKind: "CONTRACT",\n\s+contractMatterId: m\.id,/);
    const acts = readFileSync(path.join(ROOT, TABLING_ACTS), "utf8");
    const table = acts.slice(acts.indexOf("export async function tableContractMatter("), acts.indexOf("export async function citeContractMatterDecision("));
    expect(table).toMatch(/const tabledFrom = tablingOf\(\{ kind: "CONTRACT", id: m\.id, reference: m\.reference \}, tablingFactsOf\(m\)\);/);
    expect(table).toMatch(/committeeDecision\.create\(\{ data: \{ meetingId: s!\.meeting\.id, subject, domain: open!\.domain, \.\.\.tabledFrom\.keys,/);
  });
});
