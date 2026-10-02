import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The 6.8 hooks in accepted modules, by source scan (each act is exercised against a database by the
 * build's verify run; these hold the shape so a later edit cannot quietly drop one):
 * - E-7: finalising a supplementary opening once a version exists opens the next version, in the same
 *   transaction, with the evaluations locked after the opened bids (the lock order of `lock.ts`);
 * - E-8: an appointment is tabled only on the evaluation's bundle, and a NOT_CARRIED LOOP outcome with an
 *   evaluation key opens the next version (sitting → evaluations); a configured return names a stage key.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const body = (text: string, name: string) => {
  const at = text.indexOf(`export async function ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const next = text.indexOf("\nexport ", at + 10);
  return text.slice(at, next === -1 ? undefined : next);
};

describe("E-7: a supplementary opening finalised reopens the evaluation (6.7 finaliseOpening)", () => {
  const opening = read("src", "app", "sourcing", "[id]", "opening", "actions.ts");
  const fin = body(opening, "finaliseOpening");
  it("only a supplementary opening opens a version, after the opening's own finalising writes", () => {
    const hook = fin.indexOf('if (o.kind === "SUPPLEMENTARY") {\n      await lockEvaluationRows');
    expect(hook).toBeGreaterThan(fin.indexOf("await tx.opening.update("));
    expect(fin.slice(hook)).toMatch(/openNewVersion\(tx, [\s\S]*\{ trigger: "SUPPLEMENTARY_OPENING", openingId: o\.id, personId: person!\.id \}\)/);
  });
  it("the evaluations are locked after the opened bids: inOpening takes those first", () => {
    const inOpening = opening.slice(opening.indexOf("async function inOpening("), opening.indexOf("const openingOf"));
    expect(inOpening.indexOf("lockOpenedBidRows")).toBeGreaterThan(inOpening.indexOf("lockOpeningRows"));
    expect(fin.indexOf("lockEvaluationRows")).toBeLessThan(fin.indexOf("openNewVersion("));
  });
  it("the ceiling the late bids are judged against is the exercise's recorded one (never a typed figure)", () => {
    expect(fin).toMatch(/ceiling: ceilingOf\(l\.ex\)/);
  });
});

describe("E-8: the committee's bundle and the loop-back (6.10 tableMatter, recordOutcome)", () => {
  const committee = read("src", "app", "committees", "actions.ts");
  it("an appointment matter on an exercise is refused without the evaluation's bundle, before anything is written", () => {
    const table = body(committee, "tableMatter");
    // 6.8 re-review 1 (flagged test change): one read of the gate, its bundle checked before tabling, its version recorded from the same read.
    const read = table.indexOf("const gate = await loadEvaluationGate(exerciseId, tx);");
    const check = table.indexOf("bundleFaults(gate.bundle)");
    expect(read).toBeGreaterThan(table.indexOf("if (exerciseId && domain === APPOINTMENT_DOMAIN)"));
    expect(check).toBeGreaterThan(read);
    expect(check).toBeLessThan(table.indexOf("tx.committeeDecision.create("));
    expect(table.match(/loadEvaluationGate\(/g)?.length).toBe(1);
    expect(table.indexOf("evaluationVersion = gate.version")).toBeGreaterThan(check);
  });
  it("only a NOT_CARRIED appointment on an exercise reaches the loop-back, after the outcome is written", () => {
    const rec = body(committee, "recordOutcome");
    const hook = rec.indexOf('outcome === "NOT_CARRIED" && decision.domain === APPOINTMENT_DOMAIN && decision.exerciseId ? await loopBack(');
    expect(hook).toBeGreaterThan(rec.indexOf("tx.committeeDecision.updateMany("));
  });
  it("the loop-back locks the evaluations last and nothing of the exercise's itself (the act takes the exercise first; lock-order.test.ts)", () => {
    const loop = committee.slice(committee.indexOf("async function loopBack("), committee.indexOf("/**\n * Withdraw a tabled matter"));
    expect(loop.indexOf("lockEvaluationRows(tx, exerciseId)")).toBeLessThan(loop.indexOf("loadEvaluationGate("));
    expect(loop).not.toMatch(/withLockedRequisitionForSourcing|lockWindowRow|FOR UPDATE/);
    expect(loop).toMatch(/\{ trigger: "LOOP", decisionId, key, personId: null \}/);
    expect(loop).toMatch(/if \(!ev\.bundle\.applies \|\| ev\.version == null\) return null;/);
  });
  it("a configured return names one of the evaluation's stages, or keeps a stage typed before as it was", () => {
    const config = read("src", "app", "configuration", "committees", "actions.ts");
    expect(config).toMatch(/if \(returnsToStage && !isLoopKey\(returnsToStage\) && returnsToStage !== current\?\.returnsToStage\) r\.reject\("returnsToStage"/);
  });
});

describe("E-9: the award follows the evaluation (6.11)", () => {
  const repo = read("src", "lib", "award", "repo.ts");
  const awards = read("src", "app", "awards", "actions.ts");
  it("the one producer of the award's facts always states the evaluation's gate (null only where none applies)", () => {
    expect(repo).toMatch(/evaluation: evaluationNow\.gate\.applies \? \{ facts: evaluationNow\.gate, awardeePartyId: award\.awardeePartyId, award: \{/);
    const evaluate = read("src", "lib", "award", "evaluate.ts");
    expect(evaluate.match(/evaluation: f\.exercise\.evaluation \?\? null/g)?.length).toBe(2);
  });
  it("opening an award asks the whole gate, with the figures and reasons posted, before anything is written", () => {
    const create = body(awards, "createAward");
    const check = create.indexOf("recommendationRefusal(evaluation, awardeePartyId,");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(create.indexOf("issueReference("));
  });
  it("a draft's edit asks what its fields fix (the bidder, each difference's reason), before the write", () => {
    const update = body(awards, "updateAwardDetails");
    const check = update.indexOf("recommendationRefusal(evaluation,");
    expect(update.slice(check, update.indexOf("\n", check))).toMatch(/, true\);$/);
    expect(check).toBeLessThan(update.indexOf("tx.award.updateMany("));
  });
  it("citing the appointment's decision asks the evaluation's bundle, before the step is written", () => {
    const cite = body(awards, "citeAppointmentDecision");
    // 6.8 re-review 1 (flagged test change): one read of the gate, its bundle checked before the step is written.
    const read = cite.indexOf("const gate = await loadEvaluationGate(l.ex.id, tx);");
    const check = cite.indexOf("bundleFaults(gate.bundle)");
    expect(read).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(read);
    expect(check).toBeLessThan(cite.indexOf("tx.approvalStep.updateMany("));
    expect(cite.match(/loadEvaluationGate\(/g)?.length).toBe(1);
  });
});

describe("E-10: the cancellation closes the evaluation in force (6.5 applyCancellation)", () => {
  const change = read("src", "app", "sourcing", "[id]", "window", "change-actions.ts");
  const apply = change.slice(change.indexOf("async function applyCancellation("), change.indexOf("export async function recordWindowChangeDecision("));
  it("after the exercise moves to Cancelled, the evaluations are locked after the openings and the one in force is closed", () => {
    expect(apply.indexOf("lockOpeningRows(tx, l.ex.id)")).toBeLessThan(apply.indexOf("lockEvaluationRows(tx, l.ex.id)"));
    expect(apply.indexOf('moveExercise(tx, l.ex, "CANCELLED"')).toBeLessThan(apply.indexOf("closeOnCancellation(tx,"));
  });
  it("closing keeps the records: one state change, stamped, audited with the cancellation's reason", () => {
    const versions = read("src", "lib", "evaluation", "versions.ts");
    const close = versions.slice(versions.indexOf("export async function closeOnCancellation("));
    expect(close).toMatch(/data: \{ state: "CANCELLED", cancelledAt: x\.now \}/);
    expect(close).not.toMatch(/\.delete(Many)?\(/);
    expect(close).toMatch(/reason: x\.reason/);
  });
});

describe("Configuration › Templates accepts the evaluation's merge fields (6.8 report, Kertas Cadangan)", () => {
  it("a body naming an evaluation field is saved; each instrument re-checks its own whitelist when frozen", () => {
    const t = read("src", "app", "configuration", "templates", "actions.ts");
    expect(t).toMatch(/WINDOW_FIELD_KEYS\.has\(f\), clauseCodes\) : \[\]\)\.filter\(\(u\) => !EVALUATION_FIELD_KEYS\.has\(u\)\)/);
  });
});
