import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lex, rawCallText, rawCalls } from "@/lib/scan/source";
import { posixRelative } from "@/lib/scan/files";

/**
 * The sealed-figure rule, by source scan (OD-1, ADR 0012): one accessor reads the company
 * estimate's figure and amendment reason, and nothing else can. Each scan here fails if a
 * second reader appears — an `omit` that sets the columns back, a select or include that
 * names them in a file that touches the estimate, raw SQL against the versions table, or a
 * figure built outside the store. The global omit itself is checked too.
 */

const root = process.cwd();
const STORE = "src/lib/scope/estimate-store.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = dir + "/" + name;
    if (rel.startsWith("src/generated") || name === "node_modules") continue;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(rel);
  }
  return out;
}

const files = [...walk("src"), ...walk("prisma")].map((f) => posixRelative(root, join(root, f)));
const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.endsWith("/online-opening.fixture.ts"); // the fixture is a test helper that stands a scenario up through raw SQL (wave 3c step 4)

/// Each raw call that names the versions table, or cannot be read, as "file · method · why" (read through rawCalls).
function rawReadsOfVersions(sources: readonly { file: string; src: string }[]): string[] {
  const out: string[] = [];
  for (const { file, src } of sources) {
    const m = lex(src);
    for (const c of rawCalls(m)) {
      const name = `$${c.method}${c.suffix}`;
      const sql = c.unsafe ? null : rawCallText(src, m, c);
      if (sql == null) out.push(`${file} · ${name} · cannot be read`);
      else if (/CompanyEstimateVersion/.test(sql)) out.push(`${file} · ${name} · names the versions table`);
    }
  }
  return out;
}
const source = (f: string) => readFileSync(join(root, f), "utf8");
const matching = (re: RegExp, filter: (f: string) => boolean = () => true) => files.filter((f) => filter(f) && re.test(source(f)));

describe("one accessor reads the sealed columns", () => {
  it("only estimate-store.ts un-omits value or reason", () => {
    expect(matching(/omit\s*:\s*\{[^}]*\b(value|reason)\s*:\s*false/, (f) => !isTest(f))).toEqual([STORE]);
  });
  it("the application client omits both, everywhere, and transactions inherit it", () => {
    const db = source("src/lib/db.ts");
    expect(db).toMatch(/SEALED_OMIT = \{ companyEstimateVersion: \{ value: true, reason: true \} \}/);
    expect(db).toMatch(/omit: SEALED_OMIT,/);
    expect(source("src/lib/audit/record.ts")).toMatch(/export type Tx = Omit<typeof db, ITXClientDenyList>;/);
  });
  it("no raw SQL reads the versions table outside the store", () => {
    expect(matching(/\$(queryRaw|executeRaw)(Unsafe)?[\s\S]{0,300}CompanyEstimateVersion/, (f) => f !== STORE && !isTest(f))).toEqual([]);
  });
  // 6.13 Part B Run 0 fix round (BD-613-106's pass, stricter, flagged to 6.2): the check above looks 300 characters past the
  // method, and a long type argument (`$queryRaw<{ …300 characters… }[]>\`SELECT … FROM "CompanyEstimateVersion"\``) pushes the
  // table name out of that window. This reads every raw call through the shared reader (its type argument by depth, the SQL
  // whole); a call it cannot read (Unsafe, no opener, an unknown suffix) cannot be shown not to read the table.
  it("no raw SQL reads the versions table outside the store, each call read whole (rawCalls)", () => {
    expect(rawReadsOfVersions(files.filter((f) => f !== STORE && !isTest(f)).map((f) => ({ file: f, src: source(f) })))).toEqual([]);
  });
  it("the whole-call reading catches what the 300-character window misses (self-test)", () => {
    const longType = `{ ${Array.from({ length: 40 }, (_, i) => `field${i}: string`).join("; ")} }[]`;
    const src = `export async function sneak(tx) {\n  return tx.$queryRaw<${longType}>\`SELECT "value" FROM "CompanyEstimateVersion"\`;\n}\n`;
    expect(/\$(queryRaw|executeRaw)(Unsafe)?[\s\S]{0,300}CompanyEstimateVersion/.test(src)).toBe(false);
    expect(rawReadsOfVersions([{ file: "x.ts", src }])).toEqual(["x.ts · $queryRaw · names the versions table"]);
    expect(rawReadsOfVersions([{ file: "x.ts", src: "tx.$queryRawUnsafe(q); tx.$queryRawTyped(q); const r = tx.$queryRaw;" }])).toEqual(["x.ts · $queryRawUnsafe · cannot be read", "x.ts · $queryRawTyped · cannot be read", "x.ts · $queryRaw · cannot be read"]);
    expect(rawReadsOfVersions([{ file: "x.ts", src: 'tx.$queryRaw`SELECT id FROM "CompanyEstimate"`; // tx.$queryRaw`SELECT * FROM "CompanyEstimateVersion"`' }])).toEqual([]);
  });
  it("no file that touches the estimate selects a value or a reason", () => {
    // db.ts names them only to omit them (checked above).
    const touching = files.filter((f) => f !== STORE && f !== "src/lib/db.ts" && !isTest(f) && /companyEstimate|estimateVersion/i.test(source(f)));
    expect(touching.length).toBeGreaterThan(0);
    expect(touching.filter((f) => /\b(value|reason)\s*:\s*true\b/.test(source(f)))).toEqual([]);
  });
  it("sealed figures are made only by the store", () => {
    expect(matching(/\bsealFigures\(/, (f) => !isTest(f) && f !== "src/lib/scope/estimate.ts")).toEqual([STORE]);
  });
  it("nothing under src/app reads the figures before 6.7 discloses them", () => {
    expect(matching(/\breadSealedFigures\b/, (f) => f.startsWith("src/app/"))).toEqual([]);
  });
});

// Phase 3a (FR-EST-008), a deliberate change to this group-J test. It said "built for sign-in, not wired: viewFault and custodyList are imported by nothing
// in src/app". They are wired now, and the test says what holds instead: one module (estimate-access.ts) asks them, the screens ask that module, and
// the module decides without ever reading a figure, so wiring custody did not open the sealed estimate (OD-1, ADR 0012: nothing is revealed before disclosure,
// and a disclosed figure is shown to those in custody only).
describe("custody is wired to who may read a disclosed figure (FR-EST-008), and reveals nothing before disclosure (OD-1)", () => {
  const ACCESS = "src/lib/scope/estimate-access.ts";
  it("custodyList and viewFault are called by estimate-access.ts, and by no screen", () => {
    expect(matching(/\b(viewFault|custodyList)\(/, (f) => !isTest(f) && f !== "src/lib/scope/estimate.ts")).toEqual([ACCESS]);
    expect(matching(/\b(viewFault|custodyList)\b/, (f) => f.startsWith("src/app/"))).toEqual([]);
  });
  it("estimate-access.ts reads no figure: it imports neither the store nor the sealed columns", () => {
    const src = source(ACCESS);
    expect(src).not.toMatch(/estimate-store|readSealedFigures|sealFigures|omit\s*:/);
    expect(src).not.toMatch(/\b(value|reason)\s*:\s*true\b/);
  });
  it("it says SEALED before it reads the policy or any holder, whoever asks", () => {
    const src = source(ACCESS);
    expect(src.indexOf('"SEALED"')).toBeGreaterThan(-1);
    expect(src.indexOf('"SEALED"')).toBeLessThan(src.indexOf("loadScopePolicy("));
    expect(src.indexOf('"SEALED"')).toBeLessThan(src.indexOf("roleAssignment.findMany"));
  });
  it("the screens ask for the figure through the logged access, never through the unlogged one", () => {
    expect(matching(/\bestimateAccessFor\(/, (f) => f.startsWith("src/app/"))).toEqual([]);
    expect(matching(/\bloggedEstimateAccess\(/, (f) => !isTest(f) && f !== ACCESS)).toEqual(["src/lib/opening/read.ts"]);
  });
});

describe("no RSAJ figure in the product (X-10 d)", () => {
  it("the literal 4,200,000 appears nowhere in src/", () => {
    expect(files.filter((f) => f.startsWith("src/") && !isTest(f) && /4,?200,?000(?:\.00)?\b/.test(source(f)))).toEqual([]);
  });
});

describe("exports carry no sealed or SULIT figure (OD-1, OD-8, the SULIT guard)", () => {
  const ACTIONS = "src/app/sourcing/[id]/scope/actions.ts";
  const body = (src: string, fn: string) => {
    const at = src.indexOf(`export async function ${fn}(`);
    expect(at, fn).toBeGreaterThan(-1);
    const next = src.indexOf("\nexport ", at + 10);
    return src.slice(at, next === -1 ? undefined : next);
  };
  it("the CSV builder reads the bill's lines only, and touches nothing of the estimate", () => {
    const csv = source("src/lib/scope/csv.ts");
    expect(csv).not.toMatch(/estimate-store|readSealedFigures|companyEstimate|estimateVersion|estimatedValue/);
    expect(csv).not.toMatch(/from "\.\/estimate"/);
  });
  it("the export act selects sections and lines only: no estimate, no exercise value, no matter amount", () => {
    const fn = body(source(ACTIONS), "exportBqCsv");
    expect(fn).toMatch(/bqToCsv\(/);
    expect(fn).not.toMatch(/estimat|readSealedFigures|amount\s*:\s*true|include\s*:/i);
    // The only file builders: the export act, and the demo's invented evidence file (a bill only).
    // Any other caller, anywhere, fails here.
    expect(matching(/\bbqToCsv\(/, (f) => !isTest(f) && f !== "src/lib/scope/csv.ts").sort()).toEqual(["prisma/demo-scope.ts", ACTIONS].sort());
  });
  it("nothing in a client component builds a bill's file: exports are built on the server", () => {
    const clients = files.filter((f) => f.startsWith("src/") && !isTest(f) && /^["']use client["']/m.test(source(f)));
    expect(clients.filter((f) => /\bbqToCsv\b/.test(source(f)))).toEqual([]);
  });
});
