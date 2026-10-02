import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The 6.8 hooks in accepted modules, by source scan (each act is exercised against a database by the
 * build's verify run; these hold the shape so a later edit cannot quietly drop one):
 * - E-7: finalising a supplementary opening once a version exists opens the next version, in the same
 *   transaction, with the evaluations locked after the opened bids (the lock order of `lock.ts`).
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
