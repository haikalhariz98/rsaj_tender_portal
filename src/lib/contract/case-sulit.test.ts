import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RECOMMENDATION_FIELDS } from "@/lib/evaluation/recommendation-fields";
import { fieldsOfScope, SULIT_FIELDS } from "@/lib/sulit-fields";

/**
 * The case page keeps each panel's own gate (Award and Contract Requirements v2, C-2; AC-19; design note 0004 C5): the award's
 * panels read the exercise gates ('exercise' and 'evaluation'), the contract's panels read the 'contract' gate, and neither
 * gate is ever handed to the other's panels. A GRANTED answer under one scope opens nothing of the other (FR-EVL-014 against
 * the contract's priced working).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const PAGE = "src/app/projects/[id]/page.tsx";
const AWARD_VIEW = "src/app/projects/[id]/award/award-view.tsx";
/// The fields only the award's panels show. The identity-card number is registered under both scopes but contextual (asked by each panel under that panel's own gate, never by the scope's whole list), so it is checked on its own below.
const AWARD_FIELDS = ["estimatedValue", ...RECOMMENDATION_FIELDS];

describe("the SULIT fields of the award's panels are refused under the contract's gate, and the reverse (C5 done-when 2)", () => {
  it("the award's fields belong to the requisition, exercise and evaluation scopes, none to the contract's", () => {
    const contract = new Set(fieldsOfScope("contract"));
    for (const f of AWARD_FIELDS) {
      expect(contract.has(f), `${f} is asked under the contract's gate`).toBe(false);
      const row = SULIT_FIELDS.find((x) => x.field === f);
      expect(row, f).toBeDefined();
      // The estimate is registered under the requisition and also read in the exercise; the recommendation under evaluation. None is the contract's.
      expect(["requisition", "exercise", "evaluation"], f).toContain(row!.scope);
      expect(row!.alsoIn?.includes("contract") ?? false, f).toBe(false);
    }
  });

  it("the identity-card number is contextual: no scope's whole list asks it, so a gate granted for one panel opens it for no other", () => {
    const row = SULIT_FIELDS.find((x) => x.field === "icNumber")!;
    expect(row.contextual).toBe(true);
    for (const scope of ["exercise", "contract"] as const) expect(fieldsOfScope(scope)).not.toContain("icNumber");
  });

  it("the contract's fields are never asked under the exercise gates", () => {
    const award = new Set(AWARD_FIELDS);
    for (const f of fieldsOfScope("contract")) expect(award.has(f), f).toBe(false);
  });

  it("the award composition asks the exercise and evaluation gates only, and never the contract's", () => {
    const src = read(AWARD_VIEW);
    expect(src).toMatch(/sulitExerciseGate\(actor, award\.exerciseId, "exercise", \["estimatedValue", "icNumber"\]\)/);
    expect(src).toMatch(/sulitExerciseGate\(actor, award\.exerciseId, "evaluation", RECOMMENDATION_FIELDS\)/);
    expect(src).not.toMatch(/\bsulitGates?\(/);
    expect(src).not.toMatch(/fieldsOfScope\(/);
    expect(src).not.toMatch(/scope: "contract"/);
  });

  it("a read that reaches no screen is not written: the exercise gates are asked only where a panel or the header shows what rests on them", () => {
    // Every reading is logged, allowed or refused (FR-MTD-007, NFR-AUD-004), so the case page's Signing, Project and History stages must not write award reads.
    const src = read(AWARD_VIEW);
    expect([...src.matchAll(/sulitExerciseGate\(/g)]).toHaveLength(2);
    // The exercise's answer: one memoised ask, reached from two places only. The step bar's, while the award is ISSUED (the one state where the Return step reads it)...
    expect(src).toMatch(/const exerciseGate = async \(\) => \(exerciseAnswer \?\?= await sulitExerciseGate\(actor, award\.exerciseId, "exercise", \["estimatedValue", "icNumber"\]\)\);/);
    expect(src).toMatch(/returnOffered: status === "ISSUED" && \(await exerciseGate\(\)\)\.state === "GRANTED",/);
    // ...and the parts that show it: the header, the Overview, the Return panel.
    expect(src).toMatch(/const exerciseAsked = chrome \|\| want\("overview", "return"\) \? await exerciseGate\(\) : null;/);
    expect([...src.matchAll(/exerciseGate\(\)/g)]).toHaveLength(2);
    // Who is recommended: the header and the Overview only, never the step bar.
    expect(src).toMatch(/const recommendation = chrome \|\| want\("overview"\) \? await sulitExerciseGate\(actor, award\.exerciseId, "evaluation", RECOMMENDATION_FIELDS\) : null;/);
    expect(src.indexOf('"evaluation", RECOMMENDATION_FIELDS')).toBeGreaterThan(src.indexOf("async function finish("));
    // And the case page asks the award composition for its tab-specific parts only when the award is what is shown.
    expect(read(PAGE)).toMatch(/const fin = av && awardShown \?/);
  });

  it("the case page asks the contract's gate only, and hands it to the contract's panels only", () => {
    const src = read(PAGE);
    expect(src).not.toMatch(/sulitExerciseGate\(/);
    expect(src).toMatch(/sulitGate\(actor, \{ scope: "contract", entity: "Contract", id: c\.id, label: c\.number \}, fieldsOfScope\("contract"\)\)/);
    // Every place the page passes the gate on: the contract's Overview, Formation and History, nothing else.
    const passed = [...src.matchAll(/<(\w+)\b[^>]*\bsulit=\{/g)].map((m) => m[1]).sort();
    expect(passed).toEqual(["FormationPanel", "HistoryPanel", "OverviewPanel"]);
    // The award panels reach the page only through the award composition, which holds the award's gates.
    expect(src).not.toMatch(/<(OverviewPanel|ReturnPanel|ApprovalPanel|ConditionsPanel)[^>]*\brecommendation=/);
  });

  it("the award's Return and Overview panels get the award's gate, and no contract panel is built in the award composition", () => {
    const src = read(AWARD_VIEW);
    expect(src).toMatch(/<ReturnPanel sulit=\{sulit\} l=\{l\}/);
    expect(src).toMatch(/<OverviewPanel sulit=\{sulit\} l=\{l\} ev=\{ev\}/);
    expect(src).not.toMatch(/FormationPanel|BaselinePanel|SupervisionView|contractHistory/);
  });
});

describe("a case's History holds the rows its reader may have (C5 done-when 4)", () => {
  it("the award's history is read only where the award is a source of the case's History, and refused to a reader who sees the contract stages only", () => {
    const src = read(PAGE);
    // The award's tab-specific readers (the history among them) run through `finish`, asked only when the award is shown.
    expect(src).toMatch(/const awardShown = !view\.awardRefused && !view\.noContractYet && \(view\.history \? sources\.includes\("award"\)/);
    expect(src).toMatch(/const fin = av && awardShown \?/);
    // Without a whole-case reader there is no award composition to ask at all.
    expect(src).toMatch(/const av = visibility === "WHOLE" \? await buildAwardView\(\{ actor, l \}\) : null;/);
    expect(src).not.toMatch(/awardHistory\(/);
    expect(src).toMatch(/const history = lc && view\.history && sources\.includes\("contract"\) \? await contractHistory\(lc, \{ withSecurities: visibility === "WHOLE" \}\) : null;/);
  });
});
