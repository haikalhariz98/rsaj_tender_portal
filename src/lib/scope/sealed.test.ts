import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

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
    const rel = join(dir, name);
    if (rel.startsWith("src/generated") || name === "node_modules") continue;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(rel);
  }
  return out;
}

const files = [...walk("src"), ...walk("prisma")].map((f) => relative(root, join(root, f)));
const isTest = (f: string) => /\.test\.tsx?$/.test(f);
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
  it("no file that touches the estimate selects a value or a reason", () => {
    // db.ts names them only to omit them (checked above).
    const touching = files.filter((f) => f !== STORE && f !== "src/lib/db.ts" && !isTest(f) && /companyEstimate/i.test(source(f)));
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

describe("built for sign-in, not wired (OD-1)", () => {
  it("viewFault and custodyList are imported by nothing in src/app", () => {
    expect(matching(/\b(viewFault|custodyList)\b/, (f) => f.startsWith("src/app/"))).toEqual([]);
  });
});

describe("no RSAJ figure in the product (X-10 d)", () => {
  it("the literal 4,200,000 appears nowhere in src/", () => {
    expect(files.filter((f) => f.startsWith("src/") && !isTest(f) && /4,?200,?000(?:\.00)?\b/.test(source(f)))).toEqual([]);
  });
});
