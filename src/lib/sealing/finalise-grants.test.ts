import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ruling 20t (step 15): FINALISE grants are read only by the online finalise. The download route serves OPENING_CHECK grants alone, and is the only other door that opens a grant, with the use written
 * as a literal. A grant opened with the use read from its row serves both uses, so it may happen in one file only. A scan, because a second reader is how a FINALISE grant would reach a download.
 */

const root = process.cwd();
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
const sources = files(join(root, "src")).filter((p) => !p.includes(`${sep}generated${sep}`)).map((p) => ({ path: relative(root, p).split(sep).join("/"), text: readFileSync(p, "utf8") }));

describe("FINALISE grants are read only by finaliseOnline (20t)", () => {
  it("only the download route and the finalise's own store open a grant", () => {
    const openers = sources.filter((s) => /\bopenGrant\(/.test(s.text) && s.path !== "src/lib/sealing/unseal-seal.ts").map((s) => s.path).sort();
    expect(openers).toEqual(["src/app/api/opening/sealed-file/route.ts", "src/lib/opening/online-finalise-store.ts"]);
  });

  it("the download route writes the use as the literal OPENING_CHECK, and never reads it from the row", () => {
    const route = sources.find((s) => s.path === "src/app/api/opening/sealed-file/route.ts")!.text;
    expect(route).toMatch(/use: "OPENING_CHECK" \}\)/);
    expect(route).not.toMatch(/use: (?:grant|g|facts\.grant)\.use\b/);
  });

  it("only the finalise's store opens a grant under a use read from its row (the unseal's store passes the use its plan chose, when it makes one), and only it and the download's store read grants", () => {
    const readsRowUse = sources.filter((s) => /officerGrantAad\([^)]*use: (?:g|grant)\.use\b/.test(s.text)).map((s) => s.path).sort();
    expect(readsRowUse).toEqual(["src/lib/opening/online-finalise-store.ts", "src/lib/opening/unseal-store.ts"]);
    const readers = sources.filter((s) => /\bofficerDekGrant\.(?:find\w*|count|aggregate)\(/.test(s.text)).map((s) => s.path).sort();
    expect(readers).toEqual(["src/lib/opening/online-finalise-store.ts", "src/lib/opening/sealed-file-store.ts"]);
  });
});
