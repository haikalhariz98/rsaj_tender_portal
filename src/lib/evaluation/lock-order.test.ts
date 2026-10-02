import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.8 fix M-2 (correcting BD-68-3): recording an appointment matter's outcome may open the next
 * evaluation version, which writes the exercise row. It takes the exercise's locks in the order every
 * exercise act takes them — requisition → exercise → window → openings — before the sitting's, then
 * the evaluations; tabling a first-stage matter takes the same order. Source scan of the lock calls.
 * Also fix R-9: the act's clock is read once, at its entry.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const committee = read("src", "app", "committees", "actions.ts");
const between = (src: string, from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
const inOrder = (src: string, calls: string[]) => {
  const at = calls.map((c) => src.indexOf(c));
  for (const [i, c] of calls.entries()) expect(at[i], `${c} is called`).toBeGreaterThanOrEqual(0);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("the outcome of an appointment matter locks the exercise before the sitting (M-2)", () => {
  const helper = between(committee, "async function inSittingAfterExercise(", "\n}\n");
  it("requisition → exercise (one helper) → window → openings → sitting", () => {
    inOrder(helper, ["withLockedRequisitionForSourcing(requisitionId, exerciseId", "lockWindowRow(tx, exerciseId)", "lockOpeningRows(tx, exerciseId)", "lockSittingIn(tx, meetingId, roster)", "fn(tx, s)"]);
  });
  it("withLockedRequisitionForSourcing locks the requisition, then the exercise", () => {
    const repo = read("src", "lib", "method", "repo.ts");
    inOrder(between(repo, "export async function withLockedRequisitionForSourcing", "\n}\n"), ['FROM "Requisition"', 'FROM "SourcingExercise"']);
  });
  it("an appointment matter on an exercise takes that path; any other matter the sitting's alone", () => {
    const rec = between(committee, "export async function recordOutcome(", "\n}\n");
    expect(rec).toMatch(/const exerciseId = await appointmentExerciseOf\(decisionId\);/);
    expect(rec).toMatch(/return exerciseId \? inSittingAfterExercise\(meetingId, exerciseId, run\) : inSitting\(meetingId, run\);/);
    // The exercise locked is the matter's own, judged before anything is written.
    expect(rec.indexOf("decision.exerciseId !== exerciseId")).toBeLessThan(rec.indexOf("tx.committeeDecision.updateMany("));
  });
  it("the evaluations are locked last, in the loop-back, which locks nothing of the exercise's itself", () => {
    const loop = between(committee, "async function loopBack(", "\n}\n");
    expect(loop.indexOf("lockEvaluationRows(tx, exerciseId)")).toBeLessThan(loop.indexOf("openNewVersion("));
    expect(loop).not.toMatch(/withLockedRequisitionForSourcing|lockWindowRow|lockOpeningRows|lockSittingIn/);
  });
  it("tabling a first-stage matter takes the same order", () => {
    const table = read("src", "app", "sourcing", "[id]", "evaluation", "stage-one-actions.ts");
    inOrder(table, ["inWindow(exerciseIdOf(data)", "lockOpeningRows(tx, l.ex.id)", "lockSittingIn(tx, meetingId, roster)", "lockEvaluationRows(tx, l.ex.id)"]);
  });
  it("lock.ts states the corrected order", () => {
    const lock = read("src", "lib", "evaluation", "lock.ts");
    expect(lock).toMatch(/requisition → exercise → window → openings →\n \* sitting → evaluations/);
  });
});

describe("one clock read per act (R-9)", () => {
  it("recordOutcome reads the clock at its entry and the loop-back stamps with it", () => {
    const rec = between(committee, "export async function recordOutcome(", "\n}\n");
    expect(rec.indexOf("const now = toSecond(new Date());")).toBeLessThan(rec.indexOf("await meetingOf(decisionId)"));
    const loop = between(committee, "async function loopBack(", "\n}\n");
    expect(loop).not.toMatch(/new Date\(/);
    expect(loop).toMatch(/timeZone: s\.timeZone, now \}/);
  });
  it("recordNegotiationDecision reads the clock once, at its entry", () => {
    const meeting = read("src", "app", "sourcing", "[id]", "evaluation", "meeting-actions.ts");
    const act = between(meeting, "export async function recordNegotiationDecision(", "\n}\n");
    expect(act.indexOf("const now = stampNow();")).toBeLessThan(act.indexOf("inEvaluation("));
    expect(act).not.toMatch(/new Date\(/);
  });
});
