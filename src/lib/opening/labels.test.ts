import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OPENING_FINDING_CODES, openingFindingText } from "./labels";

/**
 * Codes never reach a screen (AGENTS.md rule 5): every code a rule in this directory can return has
 * words, read from the fault types' own declarations, and no word is a code or names a price.
 */

const dir = join(process.cwd(), "src/lib/opening");
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "labels.ts").map((f) => readFileSync(join(dir, f), "utf8"));
const declared = new Set<string>();
for (const src of sources) {
  for (const m of src.matchAll(/export type \w+Fault =([\s\S]*?);/g)) for (const c of m[1].matchAll(/"([A-Z_]+)"/g)) declared.add(c[1]);
  for (const m of src.matchAll(/code: "([A-Z_]+)"/g)) declared.add(m[1]);
}

describe("every opening code has words", () => {
  it("found a sensible number of codes in the sources", () => expect(declared.size).toBeGreaterThan(80));
  it.each([...declared])("%s", (code) => {
    expect(OPENING_FINDING_CODES).toContain(code);
    const t = openingFindingText({ code, level: "block", data: { person: "Aminah", listingNo: 3, count: 2, parts: "Specification", gap: "12 min 10 s", seconds: 730, required: 2, picked: 3, supplementary: 1, missing: "Form of tender", lastVersionDay: "2026-11-13", lastPermittedDay: "2026-11-12" } });
    expect(t).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
    expect(t.length).toBeGreaterThan(10);
  });
  it("an unknown code never reads as itself", () => expect(openingFindingText({ code: "SOMETHING_ELSE", level: "block" })).not.toMatch(/SOMETHING/));
});
