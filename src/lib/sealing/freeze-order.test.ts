import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `publishWindow` freezes the mode, the rules and the key's fingerprint BEFORE it moves the exercise: from ADVERTISED or INVITED on, trigger 11 (PA025) refuses a change of
 * them, so the other order would refuse every online publication. The freeze itself runs under a DB test (`scope/key.db.test.ts`); this pins the order in the one function that calls it.
 */
describe("publishWindow", () => {
  const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/window/actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function publishWindow"), src.indexOf("export async function chooseEvaluationModel"));

  it("calls the freeze once, before either move of the exercise, and only for an online exercise", () => {
    const freeze = body.indexOf("freezeOnlineSealing(");
    expect(freeze).toBeGreaterThan(-1);
    expect(body.indexOf("freezeOnlineSealing(", freeze + 1)).toBe(-1);
    expect(freeze).toBeLessThan(body.indexOf('moveExercise(tx, l.ex, "ADVERTISED"'));
    expect(freeze).toBeLessThan(body.indexOf('moveExercise(tx, l.ex, "INVITED"'));
    expect(body.slice(Math.max(0, freeze - 400), freeze)).toContain('submissionChannel === "ONLINE"');
  });
});
