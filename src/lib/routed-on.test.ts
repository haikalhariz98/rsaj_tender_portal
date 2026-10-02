import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ROUTED_ON_VALUE_ALONE, routedOnLabel } from "./labels";

/**
 * Phase 2 close-out residual 6b (lead's ruling; flagged against accepted 6.4 and 6.5): the Approval
 * for Tendering card said "Routed on: The requisition's value alone", though that route is resolved on
 * the exercise's estimated value. An exercise's routes now say so; the requisition's keep their words.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("what a route was chosen on, by what it is for", () => {
  it("an exercise's route with no condition: the exercise's estimated value alone", () => {
    expect(routedOnLabel(null, "exercise")).toBe("The exercise's estimated value alone");
    expect(routedOnLabel("", "exercise")).toBe(ROUTED_ON_VALUE_ALONE.exercise);
    expect(routedOnLabel("over_budget", "exercise")).toBe("When over budget");
  });

  it("a requisition's route keeps the requisition's value alone", () => {
    expect(routedOnLabel(null)).toBe("The requisition's value alone");
    expect(routedOnLabel(null, "requisition")).toBe(ROUTED_ON_VALUE_ALONE.requisition);
  });

  it("the label names the figure the resolver reads: the exercise's estimatedValue for both exercise routes (source scan)", () => {
    for (const f of ["src/app/sourcing/[id]/documents/actions.ts", "src/app/sourcing/[id]/window/change-actions.ts"]) {
      const src = read(f);
      expect(src, f).toMatch(/const value = parseSen\(l\.ex\.estimatedValue\.toString\(\)\);/);
      expect(src, f).toMatch(/value: l\.ex\.estimatedValue,/);
    }
    expect(read("src/app/sourcing/[id]/documents/workspace.tsx")).toMatch(/\{ label: "Routed on", value: routedOnLabel\(inst\.cond, "exercise"\) \}/);
    const win = read("src/app/sourcing/[id]/window/window-section.tsx");
    expect(win).not.toMatch(/routedOnLabel\((inst|e)\.cond\)/);
    expect(read("src/app/requisitions/[id]/page.tsx")).toMatch(/\{ label: "Routed on", value: routedOnLabel\(inst\.cond\) \}/);
  });
});
