import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { caseHref } from "./links";

const src = (p: string) => readFileSync(p, "utf8");

// AC-19 (design note 0004, C7): "Start the award" opens the form under Contracts, and saving lands on the new case's Award stage.
describe("starting an award (AC-19)", () => {
  it("the exercise's Start button goes to /projects/new with the exercise", () => {
    expect(src("src/app/sourcing/[id]/page.tsx")).toMatch(/\/projects\/new\?exercise=/);
  });
  it("saving redirects to the case's Award stage, built by caseHref", () => {
    expect(src("src/app/awards/actions.ts")).toContain('redirect(caseHref({ awardId: id!, contractId: null }, { stage: "award" }))');
    expect(caseHref({ awardId: "a1", contractId: null }, { stage: "award" })).toBe("/projects/a1?stage=award");
  });
  it("the form page lives under projects, and the old address only forwards", () => {
    expect(src("src/app/projects/new/page.tsx")).toContain("AwardForm");
    expect(src("src/app/awards/new/page.tsx")).toContain("keepQuery");
    expect(src("src/app/awards/new/page.tsx")).not.toContain("AwardForm");
  });
});
