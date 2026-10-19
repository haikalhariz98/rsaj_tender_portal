import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stageOneTablingFaults } from "./stage-one";

/// 6.8 re-review 5: the "Table again" drawer promises nothing the rule does not enforce: a deferred matter is tabled at any open sitting of the committee.
describe("re-tabling a deferred first stage (re-review 5)", () => {
  it("the rule allows the same sitting again", () => {
    expect(stageOneTablingFaults({ twoStage: true, committeeCode: "TB", sitting: { committeeCode: "TB", frozen: false }, excluded: false, matters: ["DEFERRED"] })).toEqual([]);
  });
  it("so the drawer does not say \"later\"", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/editors.tsx"), "utf8");
    const drawer = src.slice(src.indexOf("export function TableStageOneDrawer"), src.indexOf("export function AssessDrawer"));
    expect(drawer).not.toMatch(/later/);
    expect(drawer).toMatch(/Table it at a sitting/) // 0005, founder 2026-10-19: wording shortened; the drawer still promises only what the rule allows;
  });
});
