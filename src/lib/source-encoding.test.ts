import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Every source file under src/ and prisma/ is valid UTF-8 (3b-ii review M1: a Latin-1 byte once slipped into a separator and printed as a broken character). Bytes are read, so CRLF is irrelevant. */

const ROOT = process.cwd();
const TEXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|css|json|md|sql|prisma)$/;
const SKIP = new Set(["node_modules", ".next", "generated"]);

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* files(path.join(dir, e.name));
    } else if (TEXT.test(e.name)) yield path.join(dir, e.name);
  }
}

describe("source encoding", () => {
  it("has no file under src/ or prisma/ that is not valid UTF-8", () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const bad: string[] = [];
    for (const root of ["src", "prisma"]) {
      for (const f of files(path.join(ROOT, root))) {
        try {
          decoder.decode(readFileSync(f));
        } catch {
          bad.push(path.relative(ROOT, f));
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
