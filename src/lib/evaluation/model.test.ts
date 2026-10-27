import { describe, expect, it } from "vitest";

import { bandSetFaults, placeInBands } from "./bands";
import { parseFixed } from "./fixed";
import { bandsOf, modelFaults, modelFromSnapshot, modelSnapshot, scoredCriteria, type ModelContent } from "./model";
import { ASPECTS, band, criterion, FIVE_PHASE, stage, TA109 } from "./ta109-fixture";

/**
 * Issuing a model (plan §3 `model.ts`, FR-EVL-006, 008, 009; OD-5 A). The fixtures (TA 109's tender
 * model and the five-phase quotation model) issue clean, save the quotation's written gap, which warns.
 * Each rule below fails its own test when removed.
 */

const codes = (m: ModelContent, aspects = ASPECTS) => modelFaults(m, aspects).filter((f) => f.level === "block").map((f) => f.code);
const warns = (m: ModelContent, aspects = ASPECTS) => modelFaults(m, aspects).filter((f) => f.level === "warn").map((f) => f.code);
const withStage = (m: ModelContent, code: string, over: Partial<ModelContent["stages"][number]>): ModelContent => ({ ...m, stages: m.stages.map((s) => (s.code === code ? { ...s, ...over } : s)) });

describe("the fixtures issue", () => {
  it("TA 109 issues clean with the four aspects configured", () => {
    expect(modelFaults(TA109, ASPECTS)).toEqual([]);
  });
  it("the five-phase model issues with no aspects required, its Fasa 3 gap a warning only (OD-5 A)", () => {
    expect(codes(FIVE_PHASE, [])).toEqual([]);
    expect(warns(FIVE_PHASE, [])).toEqual(["BANDS_GAP"]);
  });
});

describe("what refuses the issue", () => {
  it("criteria not summing to the stage's total: MARKS_NOT_TOTAL", () => {
    expect(codes(withStage(TA109, "TECHNICAL", { maxMarks: "90" }))).toEqual(["MARKS_NOT_TOTAL"]);
  });
  it("a group's criteria not summing to the group: MARKS_NOT_TOTAL", () => {
    const tech = TA109.stages.find((s) => s.code === "TECHNICAL")!;
    const criteria = tech.criteria.map((c) => (c.code === "EXP_VALUE" ? { ...c, maxMarks: "19" } : c));
    expect(codes(withStage(TA109, "TECHNICAL", { criteria }))).toEqual(["MARKS_NOT_TOTAL"]);
  });
  it("composite weights not summing to 100: WEIGHTS_NOT_100", () => {
    expect(codes(withStage(TA109, "FINANCIAL", { compositeWeight: "30" }))).toEqual(["WEIGHTS_NOT_100"]);
  });
  it("a pass mark outside 0–100, or with no rule for the figure exactly on it", () => {
    expect(codes(withStage(TA109, "TECHNICAL", { passMark: "101" }))).toEqual(["PASS_MARK_RANGE"]);
    expect(codes(withStage(TA109, "TECHNICAL", { passInclusive: null }))).toEqual(["PASS_RULE_NOT_SET"]);
  });
  it("whether a stage must be passed is a decision, never assumed", () => {
    expect(codes(withStage(TA109, "COMPLIANCE", { mustPass: null }))).toEqual(["MUST_PASS_NOT_SET"]);
  });
  it("a two-stage model opens with the committee's decision (FR-EVL-005)", () => {
    expect(codes({ ...TA109, route: "TWO_STAGE" }, [])).toContain("TWO_STAGE_FIRST_STAGE");
    const two: ModelContent = { ...TA109, route: "TWO_STAGE", stages: [stage({ order: 0, code: "STAGE1", kind: "COMMITTEE_DECISION", side: "COMMITTEE", committeeCode: "TB" }), ...TA109.stages] };
    expect(codes(two, [])).toEqual([]);
    expect(codes({ ...two, stages: two.stages.map((s) => (s.code === "STAGE1" ? { ...s, committeeCode: null } : s)) }, [])).toEqual(["COMMITTEE_NOT_SET"]);
    expect(codes({ ...TA109, stages: [stage({ order: 0, code: "STAGE1", kind: "COMMITTEE_DECISION", side: "COMMITTEE", committeeCode: "TB" }), ...TA109.stages] })).toEqual(["COMMITTEE_STAGE_ON_TRADITIONAL"]);
  });
  it("a traditional model missing an aspect kind the route requires (FR-EVL-003)", () => {
    expect(codes(TA109, ASPECTS.filter((a) => a.kind !== "COMPLETION_PERIOD"))).toEqual(["ASPECT_KIND_MISSING"]);
    expect(codes({ ...TA109, stages: TA109.stages.filter((s) => s.kind !== "ASPECTS") })).toEqual(["ASPECTS_STAGE_MISSING"]);
  });
  it("a band set whose bands overlap: BANDS_OVERLAP", () => {
    const sets = FIVE_PHASE.bandSets.map((s) => (s.code === "PRICE" ? { ...s, bands: [...s.bands, band({ labelEn: "Dup", outcome: "NONE", sortOrder: 9, lower: "0", upper: "5" })] } : s));
    expect(codes({ ...FIVE_PHASE, bandSets: sets }, [])).toEqual(["BANDS_OVERLAP"]);
  });
  it("a banded criterion needs its input and a band set of the model", () => {
    const tech = TA109.stages.find((s) => s.code === "TECHNICAL")!;
    expect(codes(withStage(TA109, "TECHNICAL", { criteria: [...tech.criteria, criterion({ code: "X", order: 9, scale: "BANDED", computedInput: "CPR_PERCENT", bandSetCode: "NOPE" })] }))).toEqual(["BAND_SET_UNKNOWN"]);
    expect(codes(withStage(TA109, "TECHNICAL", { criteria: [...tech.criteria, criterion({ code: "X", order: 9, scale: "BANDED", bandSetCode: "CAPITAL_TENDER" })] }))).toEqual(["BANDED_INPUT_NOT_SET"]);
  });
  it("a minimum-capital test needs its base and a factor; a floor edge belongs only to one", () => {
    expect(codes(withStage(FIVE_PHASE, "FASA3", { capitalBase: null }), [])).toEqual(["CAPITAL_BASE_NOT_SET"]);
    expect(codes(withStage(FIVE_PHASE, "FASA3", { factors: [] }), [])).toEqual(["FACTORS_NOT_SET"]);
    const sets = FIVE_PHASE.bandSets.map((s) => (s.code === "CPR" ? { ...s, bands: [band({ labelEn: "Floor", outcome: "PASS", sortOrder: 1, lowerIsFloor: true })] } : s));
    expect(codes({ ...FIVE_PHASE, bandSets: sets }, [])).toEqual(["FLOOR_EDGE_MISUSED"]);
  });
  it("a shortlist needs its rule and its range", () => {
    expect(codes(withStage(FIVE_PHASE, "FASA2", { shortlistMax: null }), [])).toEqual(["SHORTLIST_RANGE_NOT_SET"]);
    expect(codes(withStage(FIVE_PHASE, "FASA2", { shortlistRule: null }), [])).toEqual(["SHORTLIST_RULE_NOT_SET"]);
  });
  it("one recommendation, last", () => {
    expect(codes({ ...FIVE_PHASE, stages: FIVE_PHASE.stages.filter((s) => s.kind !== "RECOMMENDATION") }, [])).toEqual(["RECOMMENDATION_MISSING"]);
  });
  it("no stages at all", () => expect(codes({ ...TA109, stages: [] })).toEqual(["NO_STAGES"]));
});

describe("the issued snapshot", () => {
  it("freezes the content with the aspects in force, read back the same", () => {
    const snap = modelSnapshot("m1", TA109, ASPECTS, new Date("2026-10-01T00:00:00Z"));
    expect(snap.aspects.map((a) => a.kind)).toEqual(["COMPLETENESS", "PRICE_VS_ESTIMATE", "COMPLETION_PERIOD", "CAPABILITY"]);
    expect(modelFromSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(modelFromSnapshot({ v: 2 })).toBeNull();
    expect(modelFromSnapshot(null)).toBeNull();
  });
  it("scores are entered on the leaves, never on a group", () => {
    expect(scoredCriteria(TA109.stages.find((s) => s.code === "TECHNICAL")!).map((c) => c.code)).toEqual(["EXP_SIMILAR", "EXP_VALUE", "STAFF", "PROGRAMME"]);
  });
});

describe("band sets (FR-EVL-010, 011, 012)", () => {
  const fasa3 = bandsOf(FIVE_PHASE.bandSets.find((s) => s.code === "FASA3")!);
  const price = bandsOf(FIVE_PHASE.bandSets.find((s) => s.code === "PRICE")!);
  const cpr = bandsOf(FIVE_PHASE.bandSets.find((s) => s.code === "CPR")!);
  const label = (r: ReturnType<typeof placeInBands>) => (r.placed ? r.band.labelEn : r.reason);
  it("12 % falls in the written gap: NOT_BANDED, never the nearest band", () => {
    expect(label(placeInBands(parseFixed("12"), fasa3, parseFixed("3")))).toBe("NOT_BANDED");
    expect(label(placeInBands(parseFixed("10"), fasa3, parseFixed("3")))).toBe("Baik");
    expect(label(placeInBands(parseFixed("15.0001"), fasa3, parseFixed("3")))).toBe("Kukuh");
  });
  it("the floor is the factor chosen: 2.9 % at 3 % is Gagal; 3 % exactly is Memuaskan; no factor, not judged", () => {
    expect(label(placeInBands(parseFixed("2.9"), fasa3, parseFixed("3")))).toBe("Gagal");
    expect(label(placeInBands(parseFixed("3"), fasa3, parseFixed("3")))).toBe("Memuaskan");
    expect(label(placeInBands(parseFixed("2.9"), fasa3, null))).toBe("FLOOR_NOT_SET");
  });
  it("inclusive edges: −15.0000 % is Kompetitif, below it Rendah; above +15 % Tinggi", () => {
    expect(label(placeInBands(parseFixed("-15"), price))).toBe("Kompetitif");
    expect(label(placeInBands(parseFixed("-15.0001"), price))).toBe("Rendah");
    expect(label(placeInBands(parseFixed("15"), price))).toBe("Kompetitif");
    expect(label(placeInBands(parseFixed("15.0001"), price))).toBe("Tinggi");
  });
  it("half-open CPR bands: 79.5 Baik, 80 Terbaik, 39.99 Gagal", () => {
    expect(label(placeInBands(parseFixed("79.5"), cpr))).toBe("Baik");
    expect(label(placeInBands(parseFixed("80"), cpr))).toBe("Terbaik");
    expect(label(placeInBands(parseFixed("39.99"), cpr))).toBe("Gagal");
  });
  // Phase 0.3 item 14: a set that rounds before banding is judged on its rounded grid. RSAJ's CPR reads "up to 79" and "80 and above": whole-number
  // rounding banks every value (79.4 is 79, 79.5 is 80), so it warns of no gap; unrounded, or to one place, 79.1 to 79.9 is a gap.
  it("a gap closed by the set's rounding is no gap; one the rounding leaves open still warns", () => {
    const set = (lowerInclusive: boolean, upperInclusive: boolean) => bandsOf({ code: "C", nameEn: "CPR", provenance: "STATED", governingSource: "", bands: [band({ labelEn: "Baik", outcome: "PASS", sortOrder: 1, lower: "40", upper: "79", upperInclusive }), band({ labelEn: "Terbaik", outcome: "PASS", sortOrder: 2, lower: "80", lowerInclusive })] });
    const gaps = (roundPlaces: number | null, lo = true, hi = true) => bandSetFaults({ code: "C", nameEn: "CPR", bands: set(lo, hi), roundPlaces }).map((f) => f.code);
    expect(gaps(null)).toEqual(["BANDS_GAP"]);
    expect(gaps(0)).toEqual([]);
    expect(gaps(1)).toEqual(["BANDS_GAP"]);
    // An edge either side that does not hold its point leaves that whole number unbanded.
    expect(gaps(0, false, true)).toEqual(["BANDS_GAP"]);
    expect(gaps(0, true, false)).toEqual(["BANDS_GAP"]);
    // Up to 79.5, then 80, with one place: 79.6 to 79.9 are held by neither, so it warns; up to 79, then 79.1, with one place, touches.
    const tight = (upper: string, lower: string, roundPlaces: number) => bandSetFaults({ code: "C", nameEn: "CPR", bands: bandsOf({ code: "C", nameEn: "CPR", provenance: "STATED", governingSource: "", bands: [band({ labelEn: "A", outcome: "PASS", sortOrder: 1, upper, upperInclusive: true }), band({ labelEn: "B", outcome: "PASS", sortOrder: 2, lower, lowerInclusive: true })] }), roundPlaces }).map((f) => f.code);
    expect(tight("79", "79.1", 1)).toEqual([]);
    expect(tight("79.5", "80", 1)).toEqual(["BANDS_GAP"]);
    expect(tight("-1", "0", 0)).toEqual([]);
  });
  it("an empty set, or reversed edges, refuse", () => {
    expect(bandSetFaults({ code: "X", nameEn: "X", bands: [] }).map((f) => f.code)).toEqual(["BANDS_EMPTY"]);
    expect(bandSetFaults({ code: "X", nameEn: "X", bands: bandsOf({ code: "X", nameEn: "X", provenance: "ASSUMED", governingSource: "", bands: [band({ labelEn: "R", outcome: "NONE", sortOrder: 1, lower: "5", upper: "1" })] }) }).map((f) => f.code)).toEqual(["BAND_EDGES_REVERSED"]);
  });
});
