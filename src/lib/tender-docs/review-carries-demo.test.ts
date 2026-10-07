import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/// Code review carries 9 and 10: the demo wipe's dependents, and the plan's rows as built. A source scan (vitest has no database).

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/// Carry 9 ruled what the demo wipe had to refuse: removing the demo permit list while a real exercise or a kept policy still named it.
/// Phase 1d (ADR 0034 D11) retired the wipe, so nothing removes the list at all and the dependents it listed can no longer be left
/// pointing at nothing. The carry's two checks are replaced by the stronger fact (changed deliberately, decisions log 2026-10-06 Phase 1d).
describe("carry 9: the demo permit list can no longer be removed from under what names it", () => {
  it("there is no tender-documents wipe, and the demo's wipe refuses before it touches the database", () => {
    const src = read("prisma/demo-tender-docs.ts");
    expect(src).not.toMatch(/function wipeTenderDocs|function tenderDocsDependents|\.deleteMany\(/);
    const demo = read("prisma/demo.ts");
    expect(demo).toMatch(/if \(mode === "wipe"\) \{\s*console\.error\(DEMO_WIPE_RETIRED\);\s*process\.exit\(1\);/);
  });
});

describe("carry 10: the plan states the restriction and eligibility columns as built", () => {
  const plan = read("docs/notes/plans/6.4-tender-documents.md");
  it("rows FR-DOC-009 and the pack's columns say restrictedTender and configured bodies, and no longer name the retired columns", () => {
    expect(plan).toMatch(/\| FR-DOC-009 \|[^\n]*As built \(BD-64-33\): `restrictedTender Boolean\?`/);
    expect(plan).toMatch(/inc 2, as built \(BD-64-32 to 34\)/);
    expect(plan.split("\n").slice(0, 66).join("\n")).not.toMatch(/restrictedToBumiputera|cidbGrade/);
  });
});
