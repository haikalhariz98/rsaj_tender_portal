import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Nobody is signed in, so a reason is the only account of why a record was taken away. The
 * drawer asks for it, but the server must not trust the drawer (code review C3): each act
 * that removes a requirement, an assurance confirmation or an endorsement reads its reason
 * as required and answers with a field error. A source scan (vitest has no database).
 */

const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/conditions-actions.ts"), "utf8");

const bodyOf = (fn: string) => {
  const i = src.indexOf(`export async function ${fn}(`);
  expect(i, `${fn} exists`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function ", i + 10);
  return src.slice(i, next === -1 ? undefined : next);
};

describe("removals ask for a reason on the server", () => {
  for (const fn of ["removeRequirement", "removeAssurance", "removeClauseOverride"]) {
    it(`${fn} requires the reason and returns the field error`, () => {
      const body = bodyOf(fn);
      expect(body).toMatch(/r\.text\("reason",\s*"[^"]+",\s*\{[^}]*required:\s*true/);
      expect(body).toMatch(/if \(r\.failed\) return \{ ok: false, errors: r\.errors \}/);
      // The reason is checked before anything is locked or written.
      expect(body.indexOf("r.failed")).toBeLessThan(body.indexOf("locked("));
    });
  }
});
