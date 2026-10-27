import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * FR-CON-002 and ADR 0007 (Award and Contract Requirements v2, C-3 and AC-20; wave C step C11): `issueAward` is the only code that creates a Contract row. The
 * contract exists from the instant the letter is issued, numbered then and never earlier, so a second creator would be a contract with no letter or a number with
 * no issue. The case page, the case list and every moved act read and change a contract; none makes one.
 *
 * The scan reads each source file with its comments removed and looks for a Prisma write that makes a Contract (`.contract.create`, `createMany`, `upsert`,
 * a nested `contract: { create … }` or `connectOrCreate`) and for a raw INSERT INTO "Contract". The one place it may appear in the product is
 * `src/app/awards/actions.ts`. The demonstration loader writes its stories' rows straight into the tables (it is the loader, run on a fresh database only), so the two
 * demo files that do are named here; a third would fail this test and have to be argued for.
 */

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "generated" || name === "migrations") continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(toPosix(p));
  }
  return out;
}

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const WRITES = [
  /\.contract\.(?:create|createMany|createManyAndReturn|upsert)\s*\(/,
  /\bcontract\s*:\s*\{\s*(?:create|createMany|connectOrCreate)\b/,
  /INSERT\s+INTO\s+"Contract"/i,
];

/// The product's one creator, and the loader's two (demonstration rows only).
const ALLOWED = ["src/app/awards/actions.ts", "prisma/demo-award.ts", "prisma/demo-lifecycle.ts"];

describe("issueAward is the only creator of a Contract row (FR-CON-002, ADR 0007)", () => {
  const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts")), ...walk(join(ROOT, "prisma"))];

  it("finds no Contract write outside the issue act and the demonstration loader (tests build their own rows and are not the product)", () => {
    const hits: string[] = [];
    for (const f of files) {
      const rel = posixRelative(ROOT, f);
      // The database tests' contract fixture is test code under another name (only *.db.test.ts files import it: lock-order.test.ts).
      if (ALLOWED.includes(rel) || /\.test\.tsx?$/.test(rel) || rel === "src/lib/test-db/contract.fixture.ts") continue;
      const text = stripComments(readFileSync(f, "utf8"));
      for (const w of WRITES) if (w.test(text)) hits.push(`${rel}: ${w}`);
    }
    expect(hits).toEqual([]);
  });

  it("sees the issue act's own write, so the scan cannot pass by looking at nothing", () => {
    const text = stripComments(readFileSync(join(ROOT, "src/app/awards/actions.ts"), "utf8"));
    expect(WRITES.some((w) => w.test(text))).toBe(true);
    // And it is written once, inside issueAward.
    const body = text.slice(text.indexOf("export async function issueAward"), text.indexOf("export async function recordDespatch"));
    expect((body.match(/\.contract\.create\s*\(/g) ?? []).length).toBe(1);
    expect((text.match(/\.contract\.create\s*\(/g) ?? []).length).toBe(1);
  });

  it("holds for the loader's allowed files only as named: each still exists", () => {
    for (const rel of ALLOWED) expect(() => statSync(join(ROOT, rel)), rel).not.toThrow();
  });
});
