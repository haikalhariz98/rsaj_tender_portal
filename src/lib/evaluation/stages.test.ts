import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { bidder, facts, result, score, submission, TEAM, techScores } from "./fixture";
import { formatFixed, parseFixed } from "./fixed";
import { stageOf } from "./model";
import { bandedRead, inRunningAt, resultRows, runningAt, runningFaults, scoreFaults, stageAccess, stageResult, submitStage } from "./stages";
import { personFaults, teamFaults } from "./team";
import { band, FIVE_PHASE, stage, TA109 } from "./ta109-fixture";
import type { ModelContent } from "./model";

/**
 * Running the pinned model's stages (plan §3 `score.ts`, `access.ts`, `financial.ts`, `commercial.ts`;
 * FR-EVL-001, 002, 005, 008, 010, 011; E-4, E-5; OD-5 A). Each test fails if its rule is removed.
 */

const codes = (fs: { code: string; level?: string }[]) => fs.filter((f) => f.level !== "warn").map((f) => f.code);
const RM = parseSen;
const F = parseFixed;

describe("the team (FR-EVL-001, E-4)", () => {
  const path = (code: string) => (code === "U1A" ? ["U1A", "U1", "ROOT"] : code === "U1" ? ["U1", "ROOT"] : [code, "ROOT"]);
  const pick = (personId: string, side: "IMPLEMENTING_DEPARTMENT" | "CONTRACT_PROCUREMENT", unitCode: string | null = "U1", active = true) => ({ personId, name: personId, side, unitCode, active });
  it("both sides staffed, by different people", () => {
    expect(codes(teamFaults([pick("a", "IMPLEMENTING_DEPARTMENT"), pick("b", "CONTRACT_PROCUREMENT")], "U1", path))).toEqual([]);
    expect(codes(teamFaults([pick("a", "IMPLEMENTING_DEPARTMENT")], "U1", path))).toEqual(["SIDE_NOT_STAFFED"]);
    expect(codes(teamFaults([pick("a", "IMPLEMENTING_DEPARTMENT"), pick("a", "CONTRACT_PROCUREMENT")], "U1", path))).toEqual(["PERSON_ON_BOTH_SIDES"]);
  });
  it("the implementing side belongs to the requisition's unit or one under it; unrecorded is said, not refused", () => {
    expect(codes(teamFaults([pick("a", "IMPLEMENTING_DEPARTMENT", "U1A"), pick("b", "CONTRACT_PROCUREMENT")], "U1", path))).toEqual([]);
    expect(codes(teamFaults([pick("a", "IMPLEMENTING_DEPARTMENT", "U9"), pick("b", "CONTRACT_PROCUREMENT")], "U1", path))).toEqual(["UNIT_NOT_IMPLEMENTING"]);
    const f = teamFaults([pick("a", "IMPLEMENTING_DEPARTMENT", null), pick("b", "CONTRACT_PROCUREMENT", "U9")], "U1", path);
    expect(f.map((x) => [x.code, x.level])).toEqual([["UNIT_NOT_RECORDED", "warn"]]);
  });
  it("an inactive person, or one already on the team, is refused", () => {
    expect(codes(teamFaults([pick("c", "CONTRACT_PROCUREMENT", null, false)], "U1", path, TEAM))).toEqual(["PERSON_NOT_ACTIVE"]);
    expect(codes(teamFaults([pick("pi", "CONTRACT_PROCUREMENT", null)], "U1", path, TEAM))).toEqual(["ALREADY_ON_TEAM", "PERSON_ON_BOTH_SIDES"]);
  });
  it("a scorer must be appointed to the stage's side; nobody submits for both sides", () => {
    expect(personFaults("IMPLEMENTING_DEPARTMENT", "pi", TEAM, [])).toEqual([]);
    expect(codes(personFaults("CONTRACT_PROCUREMENT", "pi", TEAM, []))).toEqual(["NOT_ON_TEAM"]);
    expect(codes(personFaults("IMPLEMENTING_DEPARTMENT", null, TEAM, []))).toEqual(["PERSON_REQUIRED"]);
    expect(codes(personFaults("CONTRACT_PROCUREMENT", "px", [], []))).toEqual(["SIDE_NOT_STAFFED"]);
    // A technical submitter equal to the financial submitter.
    const both = [...TEAM, { personId: "pi", name: "Imran", side: "CONTRACT_PROCUREMENT" as const, unitCode: null }];
    expect(codes(personFaults("CONTRACT_PROCUREMENT", "pi", [both[2]], [submission("TECHNICAL", "IMPLEMENTING_DEPARTMENT", "pi")]))).toEqual(["SAME_PERSON_BOTH_SIDES"]);
  });
});

describe("access to a stage (FR-EVL-002, 005)", () => {
  const f = facts();
  const tech = stageOf(f.model, "TECHNICAL")!;
  const fin = stageOf(f.model, "FINANCIAL")!;
  it("financial scores are refused until the technical submission is recorded", () => {
    expect(codes(stageAccess(f, fin, f.bidders[0]))).toEqual(["STAGE_LOCKED"]);
    const after = facts({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT"), submission("ASPECTS"), submission("TECHNICAL")], results: [result("b1", "COMPLIANCE"), result("b1", "TECHNICAL")] });
    expect(stageAccess(after, fin, after.bidders[0])).toEqual([]);
  });
  it("a submitted stage takes no more scores; a bidder out of the running is not scored", () => {
    const g = facts({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT"), submission("ASPECTS"), submission("TECHNICAL")], results: [result("b1", "TECHNICAL", { outOfRunning: true, passed: false })] });
    expect(codes(stageAccess(g, tech, g.bidders[0]))).toEqual(["STAGE_SUBMITTED"]);
    expect(codes(stageAccess(g, fin, g.bidders[0]))).toEqual(["NOT_IN_RUNNING"]);
    expect(stageAccess(g, fin, g.bidders[1])).toEqual([]);
    const ex = facts({ bidders: [bidder(1, { excludedReason: "Above the ceiling" })] });
    expect(codes(stageAccess(ex, tech, ex.bidders[0]))).toEqual(["EXCLUDED_ABOVE_CEILING"]);
  });
  it("two-stage: stage 2 opens per bidder only once its first-stage matter is CARRIED", () => {
    const two: ModelContent = { ...TA109, route: "TWO_STAGE", stages: [stage({ order: 0, code: "STAGE1", kind: "COMMITTEE_DECISION", side: "COMMITTEE", committeeCode: "TB" }), ...TA109.stages] };
    const g = facts({ bidders: [bidder(1, { stageOne: "CARRIED" }), bidder(2, { stageOne: "PENDING" }), bidder(3, { stageOne: "NOT_CARRIED" })] }, two);
    const t = stageOf(g.model, "COMPLIANCE")!;
    expect(stageAccess(g, t, g.bidders[0])).toEqual([]);
    expect(codes(stageAccess(g, t, g.bidders[1]))).toEqual(["STAGE_ONE_UNDECIDED"]);
    expect(codes(stageAccess(g, t, g.bidders[2]))).toEqual(["NOT_IN_RUNNING"]);
    expect(runningAt(g, t, g.bidders[2]).state).toBe("OUT");
  });
  it("runningFaults judges the bidder alone, whatever the stage's own state (inputs and aspects, BD-68-11)", () => {
    const g = facts({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT"), submission("ASPECTS"), submission("TECHNICAL")], results: [result("b1", "TECHNICAL", { outOfRunning: true, passed: false })] });
    expect(codes(runningFaults(g, fin, g.bidders[0]))).toEqual(["NOT_IN_RUNNING"]);
    expect(runningFaults(g, fin, g.bidders[1])).toEqual([]);
    expect(runningFaults(g, tech, g.bidders[0])).toEqual([]);
    const ex = facts({ bidders: [bidder(1, { excludedReason: "Above the ceiling" })] });
    expect(codes(runningFaults(ex, fin, ex.bidders[0]))).toEqual(["EXCLUDED_ABOVE_CEILING"]);
  });
  it("a score above its maximum is refused; the scale is the model's; the scorer is on the side (E-4)", () => {
    expect(scoreFaults(f, tech, "STAFF", f.bidders[0], "pi", { marks: F("30") })).toEqual([]);
    expect(codes(scoreFaults(f, tech, "STAFF", f.bidders[0], "pi", { marks: F("30.01") }))).toEqual(["ABOVE_MAX"]);
    expect(codes(scoreFaults(f, tech, "STAFF", f.bidders[0], "pi", { passed: true }))).toEqual(["WRONG_SCALE"]);
    expect(codes(scoreFaults(f, tech, "STAFF", f.bidders[0], "pc", { marks: F("1") }))).toEqual(["NOT_ON_TEAM"]);
    expect(codes(scoreFaults(f, tech, "EXPERIENCE", f.bidders[0], "pi", { marks: F("1") }))).toEqual(["NOT_A_SCORED_CRITERION"]);
  });
});

describe("results (TA 109 in the fixture)", () => {
  const ready = (over = {}) => facts({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT"), submission("ASPECTS")], ...over });
  it("80.35 passes the technical stage at 70; 69.99 fails it and is out of the running though the composite would pass", () => {
    const f = ready({ bidders: [bidder(1, { scores: techScores("80.35") }), bidder(2, { scores: techScores("69.99") })] });
    const tech = stageOf(f.model, "TECHNICAL")!;
    const r1 = stageResult(f, tech, f.bidders[0]);
    expect(formatFixed(r1.percent!)).toBe("80.3500");
    expect(formatFixed(r1.shown!, 2)).toBe("80.35");
    expect([r1.passed, r1.outOfRunning]).toEqual([true, false]);
    const r2 = stageResult(f, tech, f.bidders[1]);
    expect([r2.passed, r2.outOfRunning]).toEqual([false, true]);
  });
  it("the financial stage's capital test: below the minimum fails it, whatever the marks", () => {
    const fin = (balances: [bigint, bigint, bigint]) => {
      const f = ready({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT"), submission("ASPECTS"), submission("TECHNICAL")], bidders: [bidder(1, { priceAsRead: RM("1077508.60"), factorOptionCode: "TENDER", balances, scores: new Map([["FINANCIAL/LIQUIDITY", score("55", "pc")], ["FINANCIAL/STANDING", score("37", "pc")]]) })] });
      return stageResult(f, stageOf(f.model, "FINANCIAL")!, f.bidders[0]);
    };
    const ok = fin([RM("107750.86"), RM("107750.86"), RM("107750.86")]);
    expect(formatFixed(ok.percent!)).toBe("92.0000");
    expect([ok.passed, ok.bandLabel]).toEqual([true, "Meets the minimum"]);
    expect(ok.banded[0].detail.minimum).toBe("107750.86");
    const low = fin([RM("107750.85"), RM("107750.85"), RM("107750.85")]);
    expect([low.passed, low.outOfRunning, low.bandLabel]).toEqual([false, true, "Below the minimum"]);
  });
  it("an input not recorded holds the computation, named", () => {
    const f = ready({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT"), submission("ASPECTS"), submission("TECHNICAL")], bidders: [bidder(1)] });
    expect(codes(stageResult(f, stageOf(f.model, "FINANCIAL")!, f.bidders[0]).faults)).toEqual(["SCORE_MISSING", "SCORE_MISSING", "FACTOR_NOT_CHOSEN"]);
  });
  it("the composite is formed from the unrounded stage figures (E-5): 85.01", () => {
    const f = facts({
      submissions: ["COMPLIANCE", "ASPECTS", "TECHNICAL", "FINANCIAL"].map((s) => submission(s)),
      results: [result("b1", "TECHNICAL", { percent: F("80.35") }), result("b1", "FINANCIAL", { percent: F("92") })],
      bidders: [bidder(1)],
    });
    const r = stageResult(f, stageOf(f.model, "COMPOSITE")!, f.bidders[0]);
    expect(formatFixed(r.shown!, 2)).toBe("85.01");
    expect(r.passed).toBe(true);
  });
  it("the places unset when it started: nothing is judged (E-5)", () => {
    const f = ready({ decimals: null, bidders: [bidder(1, { scores: techScores("80") })] });
    expect(codes(stageResult(f, stageOf(f.model, "TECHNICAL")!, f.bidders[0]).faults)).toEqual(["DECIMALS_NOT_SET"]);
  });
});

describe("submitting a stage", () => {
  it("in order, by its side, with every bidder in the running scored", () => {
    const f = facts({ bidders: [bidder(1, { scores: techScores("80") })] });
    const tech = stageOf(f.model, "TECHNICAL")!;
    expect(codes(submitStage(f, tech, "pi", new Map()).faults)).toEqual(["EARLIER_NOT_SUBMITTED", "EARLIER_NOT_SUBMITTED"]);
    const g = facts({ submissions: [submission("COMPLIANCE", "CONTRACT_PROCUREMENT"), submission("ASPECTS")], bidders: [bidder(1, { scores: techScores("80") }), bidder(2)] });
    expect(codes(submitStage(g, tech, "pi", new Map()).faults)).toEqual(["SCORE_MISSING", "SCORE_MISSING", "SCORE_MISSING", "SCORE_MISSING"]);
    expect(codes(submitStage(g, tech, "pc", new Map()).faults)).toContain("NOT_ON_TEAM");
  });
  it("the shortlist, a committee's decisions and the recommendation are recorded by their own acts", () => {
    const f = facts({}, FIVE_PHASE);
    expect(codes(submitStage(f, stageOf(f.model, "FASA2")!, "pc", new Map()).faults)).toEqual(["SUBMITTED_BY_ITS_ACT"]);
  });
  it("a value in the written gap needs the evaluators' note (OD-5 A); with it, the result freezes with the note", () => {
    const base = facts({ submissions: [submission("FASA1", "CONTRACT_PROCUREMENT"), submission("FASA2", "CONTRACT_PROCUREMENT")], team: [...TEAM], bidders: [bidder(1, { shortlisted: true, factorOptionCode: "STORE", balances: [RM("39600.00"), RM("39600.00"), RM("39600.00")], priceAsRead: RM("300000.00") })] }, FIVE_PHASE);
    const s = stageOf(base.model, "FASA3")!;
    // 39,600.00 of 330,000.00 is 12 %: no band holds it as written.
    const r = submitStage(base, s, "pc", new Map());
    expect(codes(r.faults)).toEqual(["NOT_BANDED_NOTE_REQUIRED"]);
    const notes = new Map([["b1/CAPITAL", "Twelve per cent falls between the bands as written; treated as sound."]]);
    const ok = submitStage(base, s, "pc", notes);
    expect(ok.faults).toEqual([]);
    const rows = resultRows(s, ok.results, notes);
    expect(rows[0].bandLabel).toBe("Not banded");
    expect(rows[0].outOfRunning).toBe(false);
    expect(JSON.stringify(rows[0].detail)).toMatch(/Twelve per cent/);
  });
  it("the company estimate's base waits for its disclosure", () => {
    const f = facts({ estimate: { sealed: true }, submissions: [submission("FASA1", "CONTRACT_PROCUREMENT"), submission("FASA2", "CONTRACT_PROCUREMENT")], bidders: [bidder(1, { shortlisted: true, factorOptionCode: "STORE", balances: [RM("1"), RM("1"), RM("1")] })] }, FIVE_PHASE);
    expect(codes(stageResult(f, stageOf(f.model, "FASA3")!, f.bidders[0]).faults)).toEqual(["ESTIMATE_SEALED"]);
  });
  it("only the shortlisted go on", () => {
    const f = facts({ submissions: [submission("FASA1", "CONTRACT_PROCUREMENT"), submission("FASA2", "CONTRACT_PROCUREMENT")], results: [result("b1", "FASA2"), result("b2", "FASA2", { outOfRunning: true, passed: false })] }, FIVE_PHASE);
    expect(inRunningAt(f, stageOf(f.model, "FASA3")!).map((b) => b.id)).toEqual(["b1"]);
  });
});

// RSAJ answer 11 (2026-10-27): a band set may round a figure half up before banding it. Bands as the form writes them, with gaps (80–100, 60–79).
describe("a band set's rounding before banding", () => {
  const gapped = (roundPlaces?: number | null): ModelContent => ({
    ...FIVE_PHASE,
    bandSets: FIVE_PHASE.bandSets.map((b) =>
      b.code !== "CPR" ? b : { ...b, ...(roundPlaces === undefined ? {} : { roundPlaces }), bands: [band({ labelEn: "Good", outcome: "NONE", sortOrder: 1, lower: "60", upper: "79", upperInclusive: true }), band({ labelEn: "Best", outcome: "NONE", sortOrder: 2, lower: "80", upper: "100", upperInclusive: true })] },
    ),
  });
  const cprLabel = (m: ModelContent, cpr: string) => {
    const f = facts({ bidders: [bidder(1, { cprPercent: F(cpr), cprReports: 1 })] }, m);
    const s = stageOf(f.model, "FASA4")!;
    const r = bandedRead(f, s, s.criteria.find((c) => c.code === "CPR")!, f.bidders[0]);
    return r.placement?.placed ? r.placement.band.labelEn : (r.placement?.reason ?? null);
  };
  it("at 0 places, 79.5 is Best and 79.4 Good; the figure recorded is the one entered", () => {
    expect([cprLabel(gapped(0), "79.5"), cprLabel(gapped(0), "79.4"), cprLabel(gapped(0), "80")]).toEqual(["Best", "Good", "Best"]);
    const f = facts({ bidders: [bidder(1, { cprPercent: F("79.5"), cprReports: 1 })] }, gapped(0));
    const s = stageOf(f.model, "FASA4")!;
    expect(formatFixed(bandedRead(f, s, s.criteria.find((c) => c.code === "CPR")!, f.bidders[0]).value!)).toBe("79.5000");
  });
  it("not set, or absent from a snapshot frozen before it existed: 79.5 is in no band (OD-5 A)", () => {
    expect([cprLabel(gapped(null), "79.5"), cprLabel(gapped(), "79.5")]).toEqual(["NOT_BANDED", "NOT_BANDED"]);
  });
});
