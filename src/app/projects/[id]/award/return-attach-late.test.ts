import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Phase 0.3 item 10 (FR-AWD-006): the Return tab reads the attach act's own fact (`indentLateOf`, the `indentLate` owner fact) and closes the acceptance page's
// upload with the expiry line, so it never offers what the act refuses. The panel's side is views.test.ts ("a slot the owner closes").
const src = readFileSync("src/app/projects/[id]/award/return-panel.tsx", "utf8");

describe("the Return tab on an expired indent", () => {
  it("closes the acceptance page's slot by the act's own reading, with the expiry line", () => {
    expect(src).toMatch(/const late = await indentLateOf\(db, l\);/);
    expect(src).toMatch(/closed=\{late \? Object\.fromEntries\(RETURN_PURPOSES\.WORK_INDENT\.map\(\(p\) => \[p, indentLateWords\(late\.expiredOn, late\.receivedOn, true\)\]\)\) : undefined\}/);
  });
});
