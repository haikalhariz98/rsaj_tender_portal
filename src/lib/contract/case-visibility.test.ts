import { describe, expect, it } from "vitest";

import { whereMatches } from "@/lib/test-support/where-match";

import { caseVisibility, caseVisibilityWhere, type CaseVisibility, type CaseVisibilityInput } from "./case-visibility";

const B = [false, true] as const;

// Every combination, its answer written out by hand from AC-18 (restricted, named, system, issued → answer).
const TABLE: readonly [boolean, boolean, boolean, boolean, CaseVisibility][] = [
  // not restricted: everyone sees the whole case, before and after issue
  [false, false, false, false, "WHOLE"],
  [false, false, false, true, "WHOLE"],
  [false, false, true, false, "WHOLE"],
  [false, false, true, true, "WHOLE"],
  [false, true, false, false, "WHOLE"],
  [false, true, false, true, "WHOLE"],
  [false, true, true, false, "WHOLE"],
  [false, true, true, true, "WHOLE"],
  // restricted, a reader not named: hidden before issue, the contract stages only after
  [true, false, false, false, "HIDDEN"],
  [true, false, false, true, "CONTRACT_STAGES_ONLY"],
  // restricted, a loader run: the operator's own process sees it all
  [true, false, true, false, "WHOLE"],
  [true, false, true, true, "WHOLE"],
  // restricted, a reader named on the exercise: the whole case
  [true, true, false, false, "WHOLE"],
  [true, true, false, true, "WHOLE"],
  [true, true, true, false, "WHOLE"],
  [true, true, true, true, "WHOLE"],
];

describe("caseVisibility (AC-18)", () => {
  it("the table holds all sixteen combinations, once each", () => {
    expect(new Set(TABLE.map((r) => r.slice(0, 4).join())).size).toBe(16);
  });
  for (const [restricted, actorNamed, system, issued, want] of TABLE) {
    it(`restricted ${restricted}, named ${actorNamed}, system ${system}, issued ${issued}: ${want}`, () => {
      expect(caseVisibility({ restricted, actorNamed, system, issued })).toBe(want);
    });
  }
  it("a restricted case is hidden from an unnamed reader before issue, and keeps only its contract stages after", () => {
    expect(caseVisibility({ restricted: true, actorNamed: false, system: false, issued: false })).toBe("HIDDEN");
    expect(caseVisibility({ restricted: true, actorNamed: false, system: false, issued: true })).toBe("CONTRACT_STAGES_ONLY");
  });
});

describe("caseVisibilityWhere agrees with caseVisibility", () => {
  it("adds nothing when the reader may see every exercise", () => {
    expect(caseVisibilityWhere([])).toEqual({});
  });

  it("leaves out exactly the HIDDEN cases, on every combination", () => {
    // One exercise per combination of restricted × named × system; hidden is what hiddenExerciseIds answers: restricted and not
    // seen (a loader run sees all, so its list is empty).
    for (const system of B) {
      const exercises = B.flatMap((restricted) => B.map((actorNamed) => ({ id: `ex-${restricted}-${actorNamed}`, restricted, actorNamed })));
      const hidden = system ? [] : exercises.filter((e) => e.restricted && !e.actorNamed).map((e) => e.id);
      const where = caseVisibilityWhere(hidden) as Record<string, unknown>;
      for (const e of exercises)
        for (const issued of B) {
          const i: CaseVisibilityInput = { restricted: e.restricted, actorNamed: e.actorNamed, system, issued };
          const row = { exerciseId: e.id, contract: issued ? { status: "NUMBER_ALLOCATED" } : null };
          expect({ i, listed: whereMatches(row, where) }).toEqual({ i, listed: caseVisibility(i) !== "HIDDEN" });
        }
    }
  });
});
