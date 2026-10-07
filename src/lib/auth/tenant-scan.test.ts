import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Organisation isolation (ADR 0034 D10, sign-in programme Phase 1c): the actor's organisation scopes every query.
 *
 * `ORGANISATION_CODE` names the deployment's one organisation. Before sign-in it was how every screen and act found "the"
 * organisation; now the signed-in actor's (`actor.organisationId`, `actor.organisationCode`) is. The constant is read only
 * where nobody is signed in to name one: the public pages and the pre-sign-in screens through `src/lib/portal/deployment.ts`,
 * the seeds in `prisma/` and the scripts. Anywhere else under `src/` it is a failure here: a second customer's actor would
 * otherwise read the first customer's rows.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

/// Where the constant may be read, and why. A file listed that no longer reads it fails too, so the list cannot go stale.
const MAY_READ: Readonly<Record<string, string>> = {
  "src/lib/org.ts": "it is defined here, from the environment",
  "src/lib/portal/deployment.ts": "the deployment's one organisation, for what runs before anyone signs in: the public pages, the sign-in screens and the frame around them, and a loader's acts",
  "src/lib/test-db/setup.ts": "sets the variable to the database tests' own organisation before anything reads it; it reads nothing itself",
};
/// The portal's own modules serve anonymous public pages (ADR 0034 D10 names `src/lib/portal/**`); none reads the constant today except through deployment.ts.
const PORTAL = "src/lib/portal/";

/// The files under src/ whose code (not their comments or strings) names `ORGANISATION_CODE`.
export function readersOf(files: readonly { file: string; src: string }[]): string[] {
  return files.filter((f) => /\bORGANISATION_CODE\b/.test(lex(f.src))).map((f) => f.file);
}

describe("ORGANISATION_CODE is read only where nobody is signed in (ADR 0034 D10)", () => {
  const files = walk(SRC).map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
  const readers = readersOf(files);

  it("no file under src/ reads it outside the portal and the named readers", () => {
    expect(readers.filter((f) => !(f in MAY_READ) && !f.startsWith(PORTAL))).toEqual([]);
  });

  it("every named reader still reads it (the list cannot go stale)", () => {
    for (const f of Object.keys(MAY_READ)) expect(readers, f).toContain(f);
  });

  it("the scan sees a read, and not a mention in a comment or a string (self-test)", () => {
    expect(readersOf([{ file: "a.ts", src: 'import { ORGANISATION_CODE } from "@/lib/org";\nconst x = ORGANISATION_CODE;' }])).toEqual(["a.ts"]);
    expect(readersOf([{ file: "b.ts", src: '// ORGANISATION_CODE is not read here\nconst y = "ORGANISATION_CODE";' }])).toEqual([]);
  });
});
