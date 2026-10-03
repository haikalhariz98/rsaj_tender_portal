import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Review 3 and the BD-613-5 ruling (ADR 0024 Amendment 1): the boundary switch decides the side of every amount
 * and percentage band edge on its matrix, so its help says so (never "nothing else"), and the matrix screen's
 * percentage-edge line carries the boundary ruling's provenance tag.
 */
const ROOT = path.join(__dirname, "../../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

describe("the boundary switch's words", () => {
  it("the editor's help names every amount and percentage edge, and not 'nothing else'", () => {
    const e = read("src/app/configuration/approval-matrix/editors.tsx");
    expect(e).toMatch(/which side of every amount and percentage band edge counts on this matrix/);
    expect(e).not.toMatch(/nothing else/);
  });
  it("the percentage-edge line carries the boundary provenance tag", () => {
    const p = read("src/app/configuration/approval-matrix/page.tsx");
    const at = p.indexOf('label: "A percentage exactly on a band edge"');
    expect(at).toBeGreaterThan(-1);
    const item = p.slice(at, p.indexOf('label: "Boundary ruling"'));
    expect(item).toMatch(/<ProvenanceBadge value=\{boundaryMeta\.boundaryProvenance\} \/>/);
  });
});
