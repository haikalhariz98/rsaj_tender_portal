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
const REGISTER = readdirSync(path.join(SRC, "lib/portal/register"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "fixture.ts")
  .map((f) => `src/lib/portal/register/${f}`);
const ENTRIES = [...REGISTRATION, ...REGISTER];

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

  it("finds no node: import and no database, following every runtime import", () => {
    const { visited, bad } = walk(ENTRIES);
    expect(visited.size).toBeGreaterThan(ENTRIES.length);
    expect(bad).toEqual([]);
  });

  it("the scan itself catches what it should: the server-only wording file hashes with node:crypto", () => {
    expect(walk(["src/lib/portal/registration/declaration-text.ts"]).bad).toEqual(["src/lib/portal/registration/declaration-text.ts imports node:crypto"]);
    expect(walk(["src/lib/portal/registration/context-store.ts"]).bad.length).toBeGreaterThan(0);
  });
});
