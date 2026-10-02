import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EVALUATION_FINDING_CODES, evaluationFindingText } from "./labels";

/**
 * Codes never reach a screen (AGENTS.md rule 5): every code a rule in this directory can return has
 * words, read from the fault types' own declarations, and no word is a code, a ruling's or a
 * requirement's number, or a figure.
 */

const dir = join(process.cwd(), "src/lib/evaluation");
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "labels.ts" && f !== "ta109-fixture.ts").map((f) => readFileSync(join(dir, f), "utf8"));
const declared = new Set<string>();
for (const src of sources) {
  for (const m of src.matchAll(/export type \w+Fault =([\s\S]*?);/g)) for (const c of m[1].matchAll(/"([A-Z_]+)"/g)) declared.add(c[1]);
  for (const m of src.matchAll(/code: "([A-Z_]+)"/g)) declared.add(m[1]);
}

describe("every evaluation code has words", () => {
  it("found a sensible number of codes in the sources", () => expect(declared.size).toBeGreaterThan(120));
  it.each([...declared])("%s", (code) => {
    expect(EVALUATION_FINDING_CODES).toContain(code);
    const t = evaluationFindingText({ code, level: "block", data: { person: "Aminah", listingNo: 3, count: 2, stage: "Technical", criterion: "Staff", aspect: "Completeness", side: "IMPLEMENTING_DEPARTMENT", model: "Model", basis: "Basis", min: 3, max: 4, eligible: 2, rank: 2, supplementary: 1, fields: "Report date", party: "Bina", day: "2026-11-01", set: "Bands", band: "Low", other: "High", order: 2, factor: "Store", kind: "CAPABILITY", waitsFor: "Technical" } });
    expect(t).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b/);
    expect(t).not.toMatch(/\b(?:FR|NFR)-[A-Z]+-\d+|\b[EX]-\d+\b|\bOD-\d+\b/);
    expect(t.length).toBeGreaterThan(10);
  });
  it("an unknown code never reads as itself", () => expect(evaluationFindingText({ code: "SOMETHING_ELSE", level: "block" })).not.toMatch(/SOMETHING/));
  it("a frozen rule never says 'set it': it names this exercise's exit", () => {
    for (const code of ["MODEL_NOT_PINNED", "PASS_RULE_NOT_SET", "BOUNDARY_NOT_RECORDED", "BASE_NOT_SET", "NEVER_EVALUATED", "SHORTLIST_UNSET", "RANGE_NOT_SET", "OFFICE_NOT_SET"]) {
      const t = evaluationFindingText({ code, level: "block" });
      expect(t).toMatch(/cancel it/);
      expect(t).not.toMatch(/\bSet it\b|\bset it under\b/);
    }
  });
});
