import { describe, expect, it } from "vitest";

import { modelFaults, type ModelContent } from "./model";
import { modelFindingText } from "./labels";
import { ASPECTS, criterion, FIVE_PHASE, TA109 } from "./ta109-fixture";

/**
 * 6.8 fix R-3: a model is not issued if a stage could never complete. Wherever a figure is formed from
 * marks (a scored stage, or a financial test with marks, a pass mark or a weight) the stage's total is
 * set and its criteria add up to it; a composite weighs only a scored stage's or a financial test's
 * figure; a pass mark sits only where a figure is judged against it.
 */

const codes = (m: ModelContent, aspects = ASPECTS) => modelFaults(m, aspects).filter((f) => f.level === "block").map((f) => f.code);
const withStage = (m: ModelContent, code: string, over: Partial<ModelContent["stages"][number]>): ModelContent => ({ ...m, stages: m.stages.map((s) => (s.code === code ? { ...s, ...over } : s)) });
const fasa3 = (over: Partial<ModelContent["stages"][number]>) => withStage(FIVE_PHASE, "FASA3", over);
const capital = FIVE_PHASE.stages.find((s) => s.code === "FASA3")!.criteria;

describe("a financial test that forms a figure needs its total (R-3)", () => {
  it("banded only, no marks, no pass mark, no weight: issues as before", () => {
    expect(codes(FIVE_PHASE, [])).toEqual([]);
  });
  it("marks entered with no total: MAX_MARKS_NOT_SET", () => {
    expect(codes(fasa3({ criteria: [...capital, criterion({ code: "LIQ", order: 2, scale: "ENTERED_MARKS", maxMarks: "20" })] }), [])).toEqual(["MAX_MARKS_NOT_SET"]);
  });
  it("marks entered with a total they do not add up to: MARKS_NOT_TOTAL; adding up: issues", () => {
    const criteria = [...capital, criterion({ code: "LIQ", order: 2, scale: "ENTERED_MARKS", maxMarks: "20" })];
    expect(codes(fasa3({ criteria, maxMarks: "30" }), [])).toEqual(["MARKS_NOT_TOTAL"]);
    expect(codes(fasa3({ criteria, maxMarks: "20" }), [])).toEqual([]);
  });
  it("a pass mark with no marks to form the figure: refused (it could never be met)", () => {
    expect(codes(fasa3({ passMark: "50", passInclusive: true }), [])).toEqual(["MAX_MARKS_NOT_SET"]);
    expect(codes(fasa3({ passMark: "50", passInclusive: true, maxMarks: "100" }), [])).toEqual(["MARKS_NOT_TOTAL"]);
  });
  it("a weight in the composite with no marks: refused (the part would never be submitted with a figure)", () => {
    expect(codes(fasa3({ compositeWeight: "40" }), [])).toContain("MAX_MARKS_NOT_SET");
  });
  it("a total of nothing is not a total", () => {
    expect(codes(withStage(TA109, "TECHNICAL", { maxMarks: "0" }))).toContain("MAX_MARKS_NOT_SET");
  });
});

describe("weights and pass marks only where a figure is formed (R-3)", () => {
  it("a weight on a checklist, a commercial stage or the composite itself: WEIGHT_ON_KIND", () => {
    expect(codes(withStage(TA109, "COMPLIANCE", { compositeWeight: "0" }))).toContain("WEIGHT_ON_KIND");
    expect(codes(withStage(FIVE_PHASE, "FASA4", { compositeWeight: "10" }), [])).toContain("WEIGHT_ON_KIND");
    expect(codes(withStage(TA109, "COMPOSITE", { compositeWeight: "100" }))).toContain("WEIGHT_ON_KIND");
  });
  it("a pass mark on a kind that never judges one: PASS_MARK_ON_KIND", () => {
    expect(codes(withStage(TA109, "COMPLIANCE", { passMark: "50", passInclusive: true }))).toEqual(["PASS_MARK_ON_KIND"]);
    expect(codes(withStage(TA109, "ASPECTS", { passMark: "50", passInclusive: true }))).toEqual(["PASS_MARK_ON_KIND"]);
    expect(codes(withStage(FIVE_PHASE, "FASA2", { passMark: "50", passInclusive: true }), [])).toEqual(["PASS_MARK_ON_KIND"]);
    expect(codes(withStage(FIVE_PHASE, "FASA4", { passMark: "50", passInclusive: true }), [])).toEqual(["PASS_MARK_ON_KIND"]);
  });
  it("on a scored stage, a financial test with marks, and the composite: allowed (TA 109 issues clean)", () => {
    expect(codes(TA109)).toEqual([]);
  });
  it("each says what to do, in Configuration's words", () => {
    expect(modelFindingText({ code: "WEIGHT_ON_KIND", level: "block", data: { stage: "Compliance" } })).toMatch(/^Compliance: only a scored stage or a financial test carries a weight/);
    expect(modelFindingText({ code: "PASS_MARK_ON_KIND", level: "block", data: { stage: "Compliance" } })).toMatch(/would never be judged/);
  });
});
