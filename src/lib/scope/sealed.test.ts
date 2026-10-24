import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { closing, lex, rawCallText, rawCalls } from "@/lib/scan/source";
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
// Ruling 20ch (N6 step 3): the explicit-select scan. Test, fixture and generated files are out of scope; the scan reads lexed text, so a string or comment never counts.
const isScanned = (f: string) => f.startsWith("src/") && !isTest(f) && !/\.fixture\.tsx?$/.test(f) && !f.startsWith("src/generated/");
const ROW_OPS = ["findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "create", "update", "upsert", "delete", "createManyAndReturn", "updateManyAndReturn"];

/// The identifiers that are keys of the object opened at `open`, at its own depth only.
function topKeys(m: string, open: number): string[] {
  const end = closing(m, open);
  const keys: string[] = [];
  let depth = 0;
  for (let i = open; i <= end; i++) {
    const c = m[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (depth === 1 && /[A-Za-z_$]/.test(c) && !/[\w$]/.test(m[i - 1] ?? " ")) {
      const id = /^[\w$]+/.exec(m.slice(i))![0];
      if (/^\s*:/.test(m.slice(i + id.length, i + id.length + 4))) keys.push(id);
      i += id.length - 1;
    }
  }
  return keys;
}

/// Each row-returning call on the versions delegate that has no top-level select, as "file · op · why".
function unselectedVersionCalls(sources: readonly { file: string; src: string }[]): string[] {
  const out: string[] = [];
  for (const { file, src } of sources) {
    const m = lex(src);
    for (const c of m.matchAll(/\bcompanyEstimateVersion\s*\.\s*(\w+)\s*\(/g)) {
      if (!ROW_OPS.includes(c[1])) continue;
      const open = m.indexOf("(", c.index!);
      const arg = /^\s*/.exec(m.slice(open + 1))![0].length + open + 1;
      if (m[arg] !== "{") out.push(`${file} · ${c[1]} · argument cannot be read`);
      else if (!topKeys(m, arg).includes("select")) out.push(`${file} · ${c[1]} · no top-level select`);
    }
  }
  return out;
}

/// The relation fields that reach CompanyEstimateVersion, read from the schema by type: "Model.field".
function versionRelationFields(schema: string): string[] {
  const out: string[] = [];
  let model = "";
  for (const line of schema.split("\n")) {
    const mm = /^model\s+(\w+)\s*\{/.exec(line);
    if (mm) model = mm[1];
    else if (/^\}/.test(line)) model = "";
    const f = /^\s+(\w+)\s+CompanyEstimateVersion(\[\])?\??(\s|$)/.exec(line);
    if (f && model && model !== "CompanyEstimateVersion") out.push(`${model}.${f[1]}`);
  }
  return out;
}

/// In a file that names the estimate, each use of such a relation field inside a select or include that is `true` or has no top-level select, as "file · field · why". `_count` is exempt.
function unselectedVersionRelations(sources: readonly { file: string; src: string }[], fields: readonly string[]): string[] {
  const out: string[] = [];
  const names = [...new Set(fields.map((f) => f.split(".")[1]))];
  for (const { file, src } of sources) {
    if (!/companyEstimate|estimateVersion/i.test(src)) continue;
    const m = lex(src);
    for (const name of names) {
      for (const c of m.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*:\\s*`, "g"))) {
        let depth = 0;
        let open = -1;
        for (let i = c.index! - 1; i >= 0; i--) {
          if (m[i] === "}" || m[i] === ")" || m[i] === "]") depth++;
          else if (m[i] === "{" || m[i] === "(" || m[i] === "[") {
            if (depth === 0) {
              open = i;
              break;
            }
            depth--;
          }
        }
        const before = open < 0 ? "" : m.slice(Math.max(0, open - 40), open);
        if (!/\b(select|include)\s*:\s*$/.test(before)) continue; // not a Prisma selection
        if (/_count\s*:\s*\{\s*select\s*:\s*$/.test(m.slice(Math.max(0, open - 60), open)) || /_count\s*:\s*$/.test(before)) continue;
        const at = c.index! + c[0].length;
        if (m.startsWith("true", at)) out.push(`${file} · ${name} · true`);
        else if (m[at] === "{" && !topKeys(m, at).includes("select")) out.push(`${file} · ${name} · no top-level select`);
      }
    }
  }
  return out;
}

const source = (f: string) => readFileSync(join(root, f), "utf8");
const matching = (re: RegExp, filter: (f: string) => boolean = () => true) => files.filter((f) => filter(f) && re.test(source(f)));

describe("one accessor reads the sealed columns", () => {
  // Ruling 20ch (N6 step 3): the figure is read through the database's logged reader and the reason by an explicit select, so the store no longer un-omits
  // anything and no file may. This was `.toEqual([STORE])` while the store set both columns back.
  it("no file un-omits value or reason", () => {
    expect(matching(/omit\s*:\s*\{[^}]*\b(value|reason)\s*:\s*false/, (f) => !isTest(f))).toEqual([]);
  });
  it("the application client omits both, everywhere, and transactions inherit it", () => {
    const db = source("src/lib/db.ts");
    expect(db).toMatch(/SEALED_OMIT = \{ companyEstimateVersion: \{ value: true, reason: true \} \}/);
    expect(db).toMatch(/omit: SEALED_OMIT,/);
    // The application client's type takes the sealed delegate from the omitting client, and a Tx is that type less the connection methods (record.ts re-exports it).
    expect(db).toMatch(/type AppClient = Omit<PrismaClient, "companyEstimateVersion"> & Pick<typeof client, "companyEstimateVersion">;/);
    expect(db).toMatch(/export type Tx = Omit<AppClient, ITXClientDenyList>;/);
    expect(source("src/lib/audit/record.ts")).toMatch(/export type \{ Tx \} from "@\/lib\/db";/);
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
  const scanned = () => files.filter(isScanned).map((f) => ({ file: f, src: source(f) }));
  it("every call on the versions delegate that returns a row has a top-level select (ruling 20ch)", () => {
    expect(scanned().filter((x) => /companyEstimateVersion/.test(x.src)).length).toBeGreaterThan(1);
    expect(unselectedVersionCalls(scanned())).toEqual([]);
  });
  it("the scan for a missing select catches the bad forms (self-test)", () => {
    expect(unselectedVersionCalls([{ file: "x.ts", src: "await tx.companyEstimateVersion.findMany({ where: { estimateId } });" }])).toEqual(["x.ts · findMany · no top-level select"]);
    expect(unselectedVersionCalls([{ file: "x.ts", src: "await tx.companyEstimateVersion.create({ data: { select: 1 } });" }])).toEqual(["x.ts · create · no top-level select"]);
    expect(unselectedVersionCalls([{ file: "x.ts", src: "await tx.companyEstimateVersion.findFirst(args);" }])).toEqual(["x.ts · findFirst · argument cannot be read"]);
    expect(unselectedVersionCalls([{ file: "x.ts", src: "await tx.companyEstimateVersion.findMany({ where: {}, select: { id: true } });\nawait tx.companyEstimateVersion.count({ where: {} });" }])).toEqual([]);
  });
  it("every relation reaching the versions table is selected, never true or include (ruling 20ch)", () => {
    const fields = versionRelationFields(source("prisma/schema.prisma"));
    expect(fields).toEqual(expect.arrayContaining(["Organisation.companyEstimateVersions", "Person.estimateVersionsPrepared", "BqVersion.estimateVersions", "CompanyEstimate.versions", "SealedEstimateLodgement.estimateVersion"]));
    expect(unselectedVersionRelations(scanned(), fields)).toEqual([]);
  });
  it("the scan for a relation read catches the bad forms (self-test)", () => {
    const fields = ["CompanyEstimate.versions", "SealedEstimateLodgement.estimateVersion"];
    const bad = (src: string) => unselectedVersionRelations([{ file: "x.ts", src: `// companyEstimate\n${src}` }], fields);
    expect(bad("db.companyEstimate.findMany({ include: { versions: true } });")).toEqual(["x.ts · versions · true"]);
    expect(bad("db.companyEstimate.findMany({ select: { versions: true } });")).toEqual(["x.ts · versions · true"]);
    expect(bad("db.companyEstimate.findMany({ include: { versions: { orderBy: { versionNo: 'asc' }, include: { preparer: true } } } });")).toEqual(["x.ts · versions · no top-level select"]);
    expect(bad("db.sealedEstimateLodgement.findFirst({ include: { estimateVersion: true } });")).toEqual(["x.ts · estimateVersion · true"]);
    expect(bad("db.companyEstimate.findMany({ include: { versions: { orderBy: { versionNo: 'asc' }, select: { versionNo: true } } } });")).toEqual([]);
    expect(bad("db.companyEstimate.findMany({ select: { _count: { select: { versions: true } } } });")).toEqual([]);
    expect(bad("return { versions: true };")).toEqual([]);
  });
  it("the logged reader is named by the store alone, and nothing un-omits the value (ruling 20ch)", () => {
    // db-role.ts names it once, as the constant the EXECUTE grant is built from (N6 step 2); it never calls it.
    expect(matching(/read_company_estimate_figure/, (f) => isScanned(f) && f !== "src/lib/auth/db-role.ts")).toEqual([STORE]);
    expect(source("src/lib/auth/db-role.ts").match(/read_company_estimate_figure/g)).toHaveLength(1);
    expect(matching(/omit\s*:\s*\{\s*value\s*:\s*false/, (f) => isScanned(f))).toEqual([]);
    expect(/read_company_estimate_figure/.test("tx.$queryRaw`SELECT public.read_company_estimate_figure(1)`")).toBe(true);
    expect(/omit\s*:\s*\{\s*value\s*:\s*false/.test("find({ omit: { value: false, reason: true } })")).toBe(true);
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
