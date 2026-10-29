import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The work layer is pure (plan §5 step 2; AGENTS.md rule 3): nothing in src/lib/work/*.ts but `store.ts` and `load.ts` reaches the database, Next or the
 * generated client, directly or through what it imports at run time (a type-only import is erased, so it does not count).
 */

const ROOT = path.resolve(__dirname, "../../..");
const HERE = __dirname;
const ALLOWED = new Set(["store.ts", "load.ts"]);
const FORBIDDEN_FILES = [path.join(ROOT, "src/lib/db.ts")];
const FORBIDDEN_PACKAGES = /^(next(\/|$)|@prisma\/|server-only$|react$)/;

/// Every specifier a file imports at run time: `import x from`, `import { a, type B } from`, `export … from`, a bare `import "x"`; never `import type`.
function runtimeImports(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;
  for (const m of source.matchAll(re)) {
    if (m[5]) out.push(m[5]);
    else if (!m[2]) out.push(m[4]);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(c) && !c.endsWith(path.sep) && /\.(ts|tsx|json)$/.test(c)) return c;
  return null;
}

/// The run-time import closure of a file: the files it reaches, and the packages named on the way.
function closure(entry: string): { files: Set<string>; packages: Set<string>; unresolved: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const unresolved: string[] = [];
  const walk = (f: string) => {
    if (files.has(f)) return;
    files.add(f);
    if (!/\.tsx?$/.test(f)) return;
    for (const spec of runtimeImports(readFileSync(f, "utf8"))) {
      const r = resolve(f, spec);
      if (r) walk(r);
      else if (!spec.startsWith(".") && !spec.startsWith("@/")) packages.add(spec);
      else unresolved.push(`${path.relative(ROOT, f)}: ${spec}`);
    }
  };
  walk(entry);
  return { files, packages, unresolved };
}

const modules = readdirSync(HERE).filter((n) => /\.ts$/.test(n) && !/\.test\.ts$/.test(n) && !ALLOWED.has(n));

describe("src/lib/work is pure", () => {
  it("there are modules to scan", () => {
    expect(modules).toEqual(expect.arrayContaining(["types.ts", "move.ts", "views.ts", "notices.ts"]));
  });

  it.each(modules)("%s reaches no database, Next or generated client, directly or not", (name) => {
    const { files, packages, unresolved } = closure(path.join(HERE, name));
    // An import the scan cannot follow is a hole in it, not a pass.
    expect(unresolved).toEqual([]);
    expect([...files].filter((f) => FORBIDDEN_FILES.includes(f) || f.includes(`${path.sep}generated${path.sep}`))).toEqual([]);
    expect([...packages].filter((p) => FORBIDDEN_PACKAGES.test(p))).toEqual([]);
  });

  it("the scan sees through an import: a file importing the store would be caught", () => {
    expect(runtimeImports('import { db } from "@/lib/db";\nimport type { Tx } from "@/lib/db";\nimport { a, type B } from "./x";\nexport { y } from "./y";')).toEqual(["@/lib/db", "./x", "./y"]);
    expect(closure(path.join(ROOT, "src/lib/org-time.ts")).files.has(FORBIDDEN_FILES[0])).toBe(true);
  });
});
