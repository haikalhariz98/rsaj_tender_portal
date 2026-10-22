import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The browser runs the same rules as the server (ADR 0041 D1, plan section 2.3): the public wizard imports these modules. Walk their imports, following every one that is not a type,
 * and fail on any `node:` module or the database. `next build` is the final proof (plan step 3's rehearsal); this catches the import the day it is written.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const REGISTRATION = ["faults", "declaration", "documents", "codes", "creditor", "summary"].map((f) => `src/lib/portal/registration/${f}.ts`);
/// The server's own stores (`*-store.ts`: the submit route's transaction and the spent tokens) read the database by design and are never the browser's. They are left out as entry
/// points only: a browser module that imported one would still be walked into it, and fail.
const SERVER_STORES = /-store\.ts$/;
const REGISTER = readdirSync(path.join(SRC, "lib/portal/register"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fixture.ts" && !SERVER_STORES.test(f))
  .map((f) => `src/lib/portal/register/${f}`);
/// The browser's own modules (plan step 3): the public wizard, the shared step components it and the signed-in wizard draw, and the token's shape. The scan reaches only what it is pointed at.
const COMPONENTS = readdirSync(path.join(SRC, "components/registration"))
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
  .map((f) => `src/components/registration/${f}`);
const BROWSER = ["src/app/supplier/register/registration-wizard.tsx", "src/lib/auth/form-token-shape.ts", "src/lib/portal/registration/view.ts", ...COMPONENTS];
const ENTRIES = [...REGISTRATION, ...REGISTER, ...BROWSER];

/// The imports of a module that survive compilation: `import type` and `export type` are erased.
function runtimeImports(text: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?[^"';]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[2]) continue;
    out.push(m[3] ?? m[4]!);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(path.join(ROOT, from)), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(c) && !c.endsWith(path.sep) && /\.tsx?$/.test(c)) return path.relative(ROOT, c).split(path.sep).join("/");
  return null;
}

function walk(entries: readonly string[]): { visited: Set<string>; bad: string[] } {
  const visited = new Set<string>();
  const bad: string[] = [];
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const spec of runtimeImports(readFileSync(path.join(ROOT, file), "utf8"))) {
      if (spec.startsWith("node:") || spec === "@/lib/db" || spec.startsWith("@/lib/db/") || spec === "server-only" || spec.startsWith("@/generated/")) {
        bad.push(`${file} imports ${spec}`);
        continue;
      }
      const next = resolve(file, spec);
      if (next) queue.push(next);
    }
  }
  return { visited, bad };
}

describe("the modules the browser imports reach no node: module and no database (plan 2.3)", () => {
  it("lists every module of the register directory, and the registration rules", () => {
    expect(REGISTER).toEqual(expect.arrayContaining(["src/lib/portal/register/contract.ts", "src/lib/portal/register/faults.ts", "src/lib/portal/register/parse.ts", "src/lib/portal/register/held-draft.ts", "src/lib/portal/register/ceiling.ts"]));
  });

  it("lists the public wizard and every shared registration component among the entries", () => {
    expect(BROWSER).toEqual(expect.arrayContaining(["src/app/supplier/register/registration-wizard.tsx", "src/components/registration/company-fields.tsx", "src/components/registration/documents-fields.tsx", "src/components/registration/codes-fields.tsx", "src/components/registration/epayment-fields.tsx", "src/components/registration/terms-card.tsx", "src/components/registration/faults.ts"]));
    expect(walk(["src/app/supplier/register/registration-wizard.tsx"]).visited).toContain("src/lib/portal/register/wizard.ts");
  });

  it("finds no node: import and no database, following every runtime import", () => {
    const { visited, bad } = walk(ENTRIES);
    expect(visited.size).toBeGreaterThan(ENTRIES.length);
    expect(bad).toEqual([]);
  });

  it("the scan itself catches what it should: the server-only wording file hashes with node:crypto", () => {
    expect(walk(["src/lib/portal/registration/declaration-text.ts"]).bad).toEqual(["src/lib/portal/registration/declaration-text.ts imports node:crypto"]);
    expect(walk(["src/lib/portal/registration/context-store.ts"]).bad.length).toBeGreaterThan(0);
  });

  it("leaves out only the server's stores, and no browser module reaches one", () => {
    const left = readdirSync(path.join(SRC, "lib/portal/register")).filter((f) => SERVER_STORES.test(f) && !f.endsWith(".test.ts")).sort();
    expect(left).toEqual(["receive-store.ts", "token-store.ts"]);
    for (const f of left) expect(walk([`src/lib/portal/register/${f}`]).bad.length, f).toBeGreaterThan(0);
    const { visited } = walk(ENTRIES);
    for (const f of left) expect(visited.has(`src/lib/portal/register/${f}`), f).toBe(false);
  });
});
