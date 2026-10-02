/**
 * Running a pinned model's stages (FR-EVL-002, 005, 007, 008, 009, 010, 011, 012). Every stage reads
 * the exercise's pinned snapshot only (FR-EVL-007); its kind says what is computed, its configuration
 * every number. Who is in the running at a stage follows from the stages before it: a bidder excluded
 * above the ceiling, out on a submitted stage it had to pass, not shortlisted, or not carried by the
 * committee at a two-stage tender's first stage. A stage is scored once the stage it waits for is
 * submitted (FR-EVL-002); it is submitted once every stage before it is, by a team member on its side,
 * with every bidder in the running scored and every input it computes from recorded; the results are
 * then frozen with the submission. Pure.
 */

import { senToDecimalString as money } from "@/lib/money";

import { placeInBands, type BandPlacement } from "./bands";
import { variance, lowestPrice } from "./commercial";
import { cprBand } from "./cpr";
import { evaluatedPrice, scoreKey, type BidderFacts, type EvaluationFacts, type ResultFacts } from "./facts";
import { averageBalance, capitalBand, capitalBase, capitalRatio, minimumCapital } from "./financial";
import { fixedOf, formatFixed, parseFixed, type Fixed } from "./fixed";
import { bandSetOf, bandsOf, compositeParts, scoredCriteria, stageFigures, type CriterionSnap, type StageSnap } from "./model";
import { composite, markFault, passes, shownFigure, stagePercent, type ScoreFault } from "./score";
import { personFaults, type PersonFault } from "./team";
import type { Finding } from "./types";

export const isSubmitted = (f: Pick<EvaluationFacts, "submissions">, code: string) => f.submissions.some((s) => s.stageCode === code);
export const resultOf = (f: Pick<EvaluationFacts, "results">, bidderId: string, code: string) => f.results.find((r) => r.bidderId === bidderId && r.stageCode === code) ?? null;
const stagesBefore = (f: EvaluationFacts, s: StageSnap) => f.model.stages.filter((x) => x.order < s.order).sort((a, b) => a.order - b.order);

export type RunningState = "IN" | "EXCLUDED" | "OUT" | "AWAITING_STAGE_ONE";

/// Where a bidder stands at a stage, from the stages before it.
export function runningAt(f: EvaluationFacts, s: StageSnap, b: BidderFacts): { state: RunningState; at: string | null } {
  if (b.excludedReason) return { state: "EXCLUDED", at: null };
  for (const e of stagesBefore(f, s)) {
    if (e.kind === "COMMITTEE_DECISION") {
      if (b.stageOne === "NOT_CARRIED") return { state: "OUT", at: e.labelEn };
      if (b.stageOne !== "CARRIED") return { state: "AWAITING_STAGE_ONE", at: e.labelEn };
      continue;
    }
    if (resultOf(f, b.id, e.code)?.outOfRunning) return { state: "OUT", at: e.labelEn };
  }
  return { state: "IN", at: null };
}

/// The bidders in the running at a stage.
export const inRunningAt = (f: EvaluationFacts, s: StageSnap) => f.bidders.filter((b) => runningAt(f, s, b).state === "IN");

/// The bidders in the running after every stage (for the recommendation).
export function finalRunning(f: EvaluationFacts): BidderFacts[] {
  const rec = f.model.stages.find((s) => s.kind === "RECOMMENDATION");
  return rec ? inRunningAt(f, rec) : f.bidders.filter((b) => !b.excludedReason);
}

// ------------------------------------------------------------------ computed (banded) criteria

export type InputFault = "FACTOR_NOT_CHOSEN" | "BALANCES_NOT_ENTERED" | "ESTIMATE_SEALED" | "ESTIMATE_NOT_AVAILABLE" | "BASE_NOT_SET" | "BASE_ZERO" | "CPR_NOT_ENTERED" | "CPR_EVIDENCE_REQUIRED" | "BANDS_NOT_SET";

export interface BandedRead {
  criterion: CriterionSnap;
  value: Fixed | null;
  placement: BandPlacement | null;
  /// The figures behind it, as words and fixed-point strings (frozen with the result).
  detail: Record<string, string>;
  /// Why it cannot be computed yet; null where it was.
  fault: Finding<InputFault> | null;
  /// Not computable for a reason that is no one's to put right (no estimate where none is required).
  notApplicable?: string;
}

/// One banded criterion of a stage, for one bidder.
export function bandedRead(f: EvaluationFacts, s: StageSnap, c: CriterionSnap, b: BidderFacts): BandedRead {
  const set = bandSetOf(f.model, c.bandSetCode);
  const bands = set ? bandsOf(set) : [];
  const r = (x: Omit<BandedRead, "criterion">): BandedRead => ({ criterion: c, ...x });
  const fault = (code: InputFault): BandedRead => r({ value: null, placement: null, detail: {}, fault: { code, level: "block", data: { criterion: c.labelEn, listingNo: b.listingNo } } });
  switch (c.computedInput) {
    case "MIN_CAPITAL_RATIO": {
      const factor = s.factors.find((x) => x.code === b.factorOptionCode) ?? null;
      if (!factor) return fault("FACTOR_NOT_CHOSEN");
      if (b.balances.some((x) => x == null)) return fault("BALANCES_NOT_ENTERED");
      const base = capitalBase(s.capitalBase, evaluatedPrice(b), f.estimate);
      if ("fault" in base) return fault(base.fault);
      const pct = parseFixed(factor.factorPct);
      const avg = averageBalance(b.balances[0]!, b.balances[1]!, b.balances[2]!);
      const ratio = capitalRatio(avg, base.base);
      if (ratio == null) return fault("BASE_ZERO");
      const minimum = minimumCapital(base.base, pct);
      return r({ value: ratio, placement: capitalBand(ratio, pct, bands, { average: avg, minimum }), fault: null, detail: { base: money(base.base), factor: factor.labelEn, factorPct: formatFixed(pct), minimum: money(minimum), average: money(avg), ratio: formatFixed(ratio) } });
    }
    case "VARIANCE_VS_ESTIMATE": {
      if ("sealed" in f.estimate) return fault("ESTIMATE_SEALED");
      if ("notRequired" in f.estimate) return r({ value: null, placement: null, detail: {}, fault: null, notApplicable: "No company estimate" });
      const v = variance(evaluatedPrice(b), f.estimate.value);
      if (v.pct == null) return fault("BASE_ZERO");
      return r({ value: v.pct, placement: placeInBands(v.pct, bands), fault: null, detail: { reference: money(f.estimate.value), difference: money(v.difference), pct: formatFixed(v.pct) } });
    }
    case "VARIANCE_VS_LOWEST": {
      const lowest = lowestPrice(inRunningAt(f, s).map(evaluatedPrice));
      if (lowest == null) return r({ value: null, placement: null, detail: {}, fault: null, notApplicable: "No price in the running" });
      const v = variance(evaluatedPrice(b), lowest);
      if (v.pct == null) return fault("BASE_ZERO");
      return r({ value: v.pct, placement: placeInBands(v.pct, bands), fault: null, detail: { reference: money(lowest), difference: money(v.difference), pct: formatFixed(v.pct) } });
    }
    case "CPR_PERCENT": {
      if (b.cprPercent == null) return fault("CPR_NOT_ENTERED");
      if (b.cprReports === 0) return fault("CPR_EVIDENCE_REQUIRED");
      const p = cprBand(b.cprPercent, bands.length ? bands : null);
      if ("fault" in p) return fault("BANDS_NOT_SET");
      return r({ value: b.cprPercent, placement: p, fault: null, detail: { cpr: formatFixed(b.cprPercent) } });
    }
    case "NONE":
      return fault("BANDS_NOT_SET");
  }
}

// ------------------------------------------------------------------ a stage's result for one bidder

export type ResultFault = ScoreFault | InputFault | "SCORE_MISSING" | "ASPECT_UNASSESSED" | "SHORTLIST_NOT_RECORDED" | "PART_NOT_SUBMITTED";

export interface StageComputation {
  bidderId: string;
  percent: Fixed | null;
  shown: Fixed | null;
  passed: boolean | null;
  bandLabel: string | null;
  outOfRunning: boolean;
  banded: BandedRead[];
  /// The banded criteria no band holds (OD-5 A): each needs the evaluator's note at submission.
  notBanded: string[];
  faults: Finding<ResultFault>[];
}

const labelOf = (p: BandPlacement | null, notApplicable?: string) => (notApplicable ? notApplicable : !p ? null : p.placed ? p.band.labelEn : "Not banded");

/// What a stage computes for one bidder in the running, and why it cannot yet.
export function stageResult(f: EvaluationFacts, s: StageSnap, b: BidderFacts): StageComputation {
  const faults: Finding<ResultFault>[] = [];
  const out: StageComputation = { bidderId: b.id, percent: null, shown: null, passed: null, bandLabel: null, outOfRunning: false, banded: [], notBanded: [], faults };
  const leafScores = scoredCriteria(s).map((c) => ({ c, score: b.scores.get(scoreKey(s.code, c.code)) ?? null }));
  for (const x of leafScores) if (!x.score) faults.push({ code: "SCORE_MISSING", level: "block", data: { listingNo: b.listingNo, criterion: x.c.labelEn } });
  const failsPassFail = leafScores.some((x) => x.c.scale === "PASS_FAIL" && x.score?.passed === false);
  const banded = s.criteria.filter((c) => c.scale === "BANDED").map((c) => bandedRead(f, s, c, b));
  out.banded = banded;
  for (const r of banded) {
    if (r.fault) faults.push(r.fault);
    else if (r.placement && !r.placement.placed) out.notBanded.push(r.criterion.code);
  }
  const bandFails = banded.some((r) => r.placement?.placed && r.placement.band.outcome === "FAIL");
  const judge = (percent: Fixed | null, extraFail: boolean) => {
    const figs = stageFigures(s);
    if (percent == null) return { passed: !extraFail, shown: null };
    const shown = shownFigure(percent, f.decimals);
    if (shown == null) {
      faults.push({ code: "DECIMALS_NOT_SET", level: "block" });
      return { passed: null, shown: null };
    }
    const p = passes(shown, figs.passMark, s.passInclusive);
    if ("fault" in p) {
      faults.push(p.fault);
      return { passed: null, shown };
    }
    return { passed: p.passed && !extraFail, shown };
  };
  switch (s.kind) {
    case "CHECKLIST": {
      out.passed = leafScores.every((x) => x.score?.passed === true);
      break;
    }
    case "SCORED":
    case "FINANCIAL_TEST": {
      const marks = leafScores.filter((x) => x.c.scale === "ENTERED_MARKS" && x.score?.marks != null).map((x) => x.score!.marks!);
      const percent = s.kind === "SCORED" || stageFigures(s).maxMarks != null ? stagePercent(marks, stageFigures(s).maxMarks) : null;
      out.percent = percent;
      const j = judge(percent, failsPassFail || bandFails);
      out.shown = j.shown;
      out.passed = j.passed;
      const capital = banded.find((r) => r.criterion.computedInput === "MIN_CAPITAL_RATIO");
      out.bandLabel = capital ? labelOf(capital.placement, capital.notApplicable) : null;
      break;
    }
    case "COMMERCIAL": {
      out.passed = !bandFails;
      out.bandLabel = banded.length ? labelOf(banded[0].placement, banded[0].notApplicable) : null;
      break;
    }
    case "COMPOSITE": {
      const parts = compositeParts(f.model).map((p) => ({ p, r: resultOf(f, b.id, p.code) }));
      const missing = parts.filter((x) => !isSubmitted(f, x.p.code) || x.r?.percent == null);
      for (const m of missing) faults.push({ code: "PART_NOT_SUBMITTED", level: "block", data: { stage: m.p.labelEn } });
      if (missing.length === 0) {
        const percent = composite(parts.map((x) => ({ percent: x.r!.percent!, weight: fixedOf(x.p.compositeWeight)! })));
        out.percent = percent;
        const j = judge(percent, false);
        out.shown = j.shown;
        out.passed = j.passed;
      }
      break;
    }
    case "ASPECTS": {
      for (const a of f.model.aspects.filter((x) => x.required)) if (!b.aspects.has(a.code)) faults.push({ code: "ASPECT_UNASSESSED", level: "block", data: { listingNo: b.listingNo, aspect: a.labelEn } });
      out.passed = null;
      break;
    }
    case "SHORTLIST": {
      if (b.shortlisted == null) faults.push({ code: "SHORTLIST_NOT_RECORDED", level: "block", data: { listingNo: b.listingNo } });
      out.passed = b.shortlisted === true;
      out.outOfRunning = b.shortlisted === false;
      return out;
    }
    case "COMMITTEE_DECISION":
    case "RECOMMENDATION":
      return out;
  }
  out.outOfRunning = s.mustPass === true && out.passed === false;
  return out;
}

/// What an open stage shows for one bidder while it is live (not yet submitted).
export interface LiveStanding {
  shown: Fixed | null;
  passed: boolean | null;
  bandLabel: string | null;
  outOfRunning: boolean;
  /// The blocking reasons the stage cannot judge this bidder yet; empty once it can.
  pending: Finding<ResultFault>[];
}

/**
 * The live view of an open stage for one bidder (6.8 review S-1). While any blocking fault stands —
 * an input not recorded, a criterion not scored, a rule not set — the stage has not judged the bidder:
 * no figure (a figure from the marks present is a partial sum) and no outcome (with nothing to judge,
 * `judge(null)` reads as a pass), only "not yet" and the reasons. A band computed from a complete input
 * is a fact and stays shown. Submission refuses on the same faults (`submitStage`), so the live view and
 * the act agree. Pure.
 */
export function liveStanding(c: StageComputation): LiveStanding {
  const pending = c.faults.filter((x) => x.level === "block");
  if (pending.length) return { shown: null, passed: null, bandLabel: c.bandLabel, outOfRunning: false, pending };
  return { shown: c.shown, passed: c.passed, bandLabel: c.bandLabel, outOfRunning: c.outOfRunning, pending: [] };
}

// ------------------------------------------------------------------ scoring and submitting

export type AccessFault = "STAGE_SUBMITTED" | "STAGE_LOCKED" | "NOT_IN_RUNNING" | "EXCLUDED_ABOVE_CEILING" | "STAGE_ONE_UNDECIDED" | "NOT_A_SCORED_CRITERION" | "WRONG_SCALE";

/**
 * Whether a stage may be scored for a bidder now (FR-EVL-002, 005): not submitted; the stage it waits
 * for submitted; the bidder in the running there (at a two-stage tender, carried at the first stage).
 */
export function stageAccess(f: EvaluationFacts, s: StageSnap, b: BidderFacts | null): Finding<AccessFault>[] {
  if (isSubmitted(f, s.code)) return [{ code: "STAGE_SUBMITTED", level: "block", data: { stage: s.labelEn } }];
  if (s.unlocksAfterOrder != null) {
    const w = f.model.stages.find((x) => x.order === s.unlocksAfterOrder);
    if (w && !isSubmitted(f, w.code)) return [{ code: "STAGE_LOCKED", level: "block", data: { stage: s.labelEn, waitsFor: w.labelEn } }];
  }
  return b ? runningFaults(f, s, b) : [];
}

/// Why a bidder takes nothing at a stage: excluded above the ceiling, out of the running, or its first stage undecided.
export function runningFaults(f: EvaluationFacts, s: StageSnap, b: BidderFacts): Finding<AccessFault>[] {
  const r = runningAt(f, s, b);
  if (r.state === "EXCLUDED") return [{ code: "EXCLUDED_ABOVE_CEILING", level: "block", data: { listingNo: b.listingNo } }];
  if (r.state === "OUT") return [{ code: "NOT_IN_RUNNING", level: "block", data: { listingNo: b.listingNo, stage: r.at } }];
  if (r.state === "AWAITING_STAGE_ONE") return [{ code: "STAGE_ONE_UNDECIDED", level: "block", data: { listingNo: b.listingNo, stage: r.at } }];
  return [];
}

/// The stages that read a bidder's factor and balances (capital), or its CPR.
export const inputStages = (f: Pick<EvaluationFacts, "model">, kind: "capital" | "cpr") =>
  f.model.stages.filter((s) => s.criteria.some((c) => c.scale === "BANDED" && (kind === "capital" ? c.computedInput === "MIN_CAPITAL_RATIO" : c.computedInput === "CPR_PERCENT")));

/// Why a stage reading a bidder's inputs takes none from it now (BD-68-11): submitted, or the bid excluded or out of the running there.
export function inputStageFaults(f: EvaluationFacts, s: StageSnap, b: BidderFacts): Finding<AccessFault | "INPUTS_FROZEN">[] {
  if (isSubmitted(f, s.code)) return [{ code: "INPUTS_FROZEN", level: "block" }];
  return runningFaults(f, s, b);
}

/**
 * Whether a bidder's inputs may be recorded at all now (6.8 review S-2): some stage that reads them
 * still takes them. Empty: allowed; else every reason, so the screen's trigger and `recordInputs`
 * (which runs `inputStageFaults` on the stages a change reads) give the same answer.
 */
export function inputsAccess(f: EvaluationFacts, b: BidderFacts): Finding<AccessFault | "INPUTS_FROZEN">[] {
  const per = [...inputStages(f, "capital"), ...inputStages(f, "cpr")].map((s) => inputStageFaults(f, s, b));
  return per.length === 0 || per.some((x) => x.length === 0) ? [] : per.flat();
}

/// A score on one criterion of one bidder (FR-EVL-001; E-4): its scale, its maximum, the stage open, the scorer on its side.
export function scoreFaults(f: EvaluationFacts, s: StageSnap, criterionCode: string, b: BidderFacts, scorerId: string | null, value: { marks: Fixed } | { passed: boolean }): Finding<AccessFault | ScoreFault | PersonFault>[] {
  const c = scoredCriteria(s).find((x) => x.code === criterionCode);
  if (!c || !(s.kind === "CHECKLIST" || s.kind === "SCORED" || s.kind === "FINANCIAL_TEST")) return [{ code: "NOT_A_SCORED_CRITERION", level: "block" }];
  const out: Finding<AccessFault | ScoreFault | PersonFault>[] = [...stageAccess(f, s, b), ...personFaults(s.side, scorerId, f.team, f.submissions)];
  if (c.scale === "ENTERED_MARKS") {
    if (!("marks" in value)) out.push({ code: "WRONG_SCALE", level: "block", data: { criterion: c.labelEn } });
    else {
      const m = markFault(value.marks, fixedOf(c.maxMarks) ?? 0n);
      if (m) out.push({ ...m, data: { criterion: c.labelEn, max: c.maxMarks } });
    }
  } else if (!("passed" in value)) out.push({ code: "WRONG_SCALE", level: "block", data: { criterion: c.labelEn } });
  return out;
}

export type SubmitFault = AccessFault | PersonFault | ResultFault | "ALREADY_SUBMITTED" | "EARLIER_NOT_SUBMITTED" | "SUBMITTED_BY_ITS_ACT" | "NOT_BANDED_NOTE_REQUIRED";

/**
 * Submitting a stage: every stage before it submitted (a committee stage: every bidder decided), the
 * submitter on its side, every bidder in the running computed, and a note for each value no band holds
 * (OD-5 A). Returns the results to freeze with it.
 */
export function submitStage(f: EvaluationFacts, s: StageSnap, personId: string | null, notes: ReadonlyMap<string, string>): { faults: Finding<SubmitFault>[]; results: StageComputation[] } {
  const faults: Finding<SubmitFault>[] = [];
  if (s.kind === "SHORTLIST" || s.kind === "COMMITTEE_DECISION" || s.kind === "RECOMMENDATION") return { faults: [{ code: "SUBMITTED_BY_ITS_ACT", level: "block", data: { stage: s.labelEn } }], results: [] };
  if (isSubmitted(f, s.code)) return { faults: [{ code: "ALREADY_SUBMITTED", level: "block", data: { stage: s.labelEn } }], results: [] };
  for (const e of stagesBefore(f, s)) {
    if (e.kind === "COMMITTEE_DECISION") {
      for (const b of f.bidders.filter((x) => !x.excludedReason && x.stageOne !== "CARRIED" && x.stageOne !== "NOT_CARRIED")) faults.push({ code: "STAGE_ONE_UNDECIDED", level: "block", data: { listingNo: b.listingNo, stage: e.labelEn } });
    } else if (e.kind !== "RECOMMENDATION" && !isSubmitted(f, e.code)) faults.push({ code: "EARLIER_NOT_SUBMITTED", level: "block", data: { stage: e.labelEn } });
  }
  faults.push(...personFaults(s.side, personId, f.team, f.submissions));
  const results = inRunningAt(f, s).map((b) => stageResult(f, s, b));
  for (const r of results) {
    faults.push(...r.faults);
    const b = f.bidders.find((x) => x.id === r.bidderId)!;
    for (const code of r.notBanded) if (!(notes.get(`${b.id}/${code}`) ?? "").trim()) faults.push({ code: "NOT_BANDED_NOTE_REQUIRED", level: "block", data: { listingNo: b.listingNo, criterion: s.criteria.find((c) => c.code === code)?.labelEn ?? null } });
  }
  return { faults, results };
}

/// The result rows a submission freezes, with the notes for values no band holds.
export function resultRows(s: StageSnap, results: readonly StageComputation[], notes: ReadonlyMap<string, string>): (ResultFacts & { detail: Record<string, unknown> })[] {
  return results.map((r) => ({
    bidderId: r.bidderId,
    stageCode: s.code,
    percent: r.percent,
    shown: r.shown,
    passed: r.passed,
    bandLabel: r.bandLabel,
    outOfRunning: r.outOfRunning,
    detail: {
      banded: r.banded.map((x) => ({ criterion: x.criterion.code, label: x.criterion.labelEn, band: labelOf(x.placement, x.notApplicable), outcome: x.placement?.placed ? x.placement.band.outcome : null, value: x.value == null ? null : formatFixed(x.value), figures: x.detail, note: notes.get(`${r.bidderId}/${x.criterion.code}`) ?? null })),
    },
  }));
}
