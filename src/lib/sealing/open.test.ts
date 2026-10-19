import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * `open.ts` is the only way out of a seal for code outside `src/lib/sealing/` (ADR 0036 D12, build plan step 4; step 19 widens this into the product-wide scan).
 * - `hpkeOpen` and `gcmOpen` are defined in `open.ts` and nowhere else;
 * - the module's own openers (`hpkeOpenWithin`, `gcmOpenWithin`) are named only inside `src/lib/sealing/`;
 * - nothing outside the module imports its internal files that hold them (`hpke.ts`, `aead.ts`).
 */

const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "generated" || name === "node_modules" ? [] : files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [toPosix(p)] : [];
  });
}
const sources = [...files(join(root, "src")), ...files(join(root, "prisma"))].map((p) => ({ path: posixRelative(root, p), text: readFileSync(p, "utf8") }));
const SEALING = "src/lib/sealing/";

describe("every decryption outside the sealing module goes through open.ts", () => {
  it("hpkeOpen and gcmOpen are defined only in open.ts", () => {
    const defining = sources.filter((s) => /\bfunction\s+(hpkeOpen|gcmOpen)\s*\(|\b(const|let)\s+(hpkeOpen|gcmOpen)\s*=/.test(s.text)).map((s) => s.path);
    expect(defining).toEqual([`${SEALING}open.ts`]);
  });

  it("the module's own openers are named only inside it", () => {
    const outside = sources.filter((s) => !s.path.startsWith(SEALING) && /\b(hpkeOpenWithin|gcmOpenWithin|openBase|contextOpen|aeadOpen)\b/.test(s.text)).map((s) => s.path);
    expect(outside).toEqual([]);
  });

  it("nothing outside the module imports hpke.ts or aead.ts", () => {
    const outside = sources.filter((s) => !s.path.startsWith(SEALING) && /from\s+["'](@\/lib\/sealing|(\.\.\/)+[\w/]*sealing)\/(hpke|aead)["']/.test(s.text)).map((s) => s.path);
    expect(outside).toEqual([]);
  });
});
