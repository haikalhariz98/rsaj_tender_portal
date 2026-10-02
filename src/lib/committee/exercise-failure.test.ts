import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ExerciseMoveRefused } from "@/lib/method/move";

import { EXERCISE_CHANGED, exerciseActFailure, TIMED_OUT } from "./exercise-failure";

/// 6.8 re-review 6: the outcome act that writes an exercise refuses honestly where the exercise act would.
describe("a sitting act that writes an exercise (re-review 6)", () => {
  it("the exercise changed under it: reload and try again", () => {
    expect(exerciseActFailure(new ExerciseMoveRefused([{ code: "CHANGED", level: "block" } as never]))).toEqual({ ok: false, message: EXERCISE_CHANGED });
  });
  it("the exercise cannot move: said, nothing saved", () => {
    expect(exerciseActFailure(new ExerciseMoveRefused([{ code: "SOMETHING", level: "block" } as never]))?.message).toMatch(/^Nothing was saved: the exercise cannot move:/);
  });
  it("the transaction ran out of time: said", () => {
    expect(exerciseActFailure(Object.assign(new Error("timeout"), { code: "P2028" }))).toEqual({ ok: false, message: TIMED_OUT });
  });
  it("anything else is not swallowed", () => {
    expect(exerciseActFailure(new Error("boom"))).toBeNull();
  });
  it("inSittingAfterExercise catches through it and rethrows the rest (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/committees/actions.ts"), "utf8");
    const helper = src.slice(src.indexOf("async function inSittingAfterExercise("), src.indexOf("\n}\n", src.indexOf("async function inSittingAfterExercise(")));
    expect(helper).toMatch(/catch \(e\) \{[\s\S]*const said = exerciseActFailure\(e\);[\s\S]*if \(said\) return said;[\s\S]*throw e;/);
  });
});
