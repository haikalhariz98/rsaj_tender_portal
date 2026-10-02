/**
 * Evaluation models (FR-EVL-006, 007, 008, 009; D1; ADR 0018). A model is drafted in configuration,
 * checked (`modelFaults`) and issued: its stages, criteria, factor options, band sets and the aspects
 * in force are frozen in one snapshot (`modelSnapshot`), which is what an exercise pins at publication
 * and what every evaluation computation runs from (`modelFromSnapshot`) — never the configuration rows
 * (FR-EVL-007, the source scan in `sealed.test.ts`). A change is a new version. Every number is the
 * customer's; the code knows only the kinds of computation. Pure.
 */

import { bandSetFaults, type Band } from "./bands";
import { compareFixed, fixedFromWhole, parseFixed, sumFixed, type Fixed } from "./fixed";
import { REQUIRED_ASPECT_KINDS, type AspectKind, type BandOutcome, type CapitalBase, type ComputedInput, type CriterionScale, type EvaluationRoute, type Finding, type Provenance, type ShortlistRule, type Side, type StageKind } from "./types";

// ------------------------------------------------------------------ the frozen content (JSON)

/// Decimals are four-place strings in the snapshot: JSON never holds a float.
export interface BandSnap {
  labelEn: string;
  labelMs: string | null;
  lower: string | null;
  lowerInclusive: boolean;
  lowerIsFloor: boolean;
  upper: string | null;
  upperInclusive: boolean;
  upperIsFloor: boolean;
  outcome: BandOutcome;
  sortOrder: number;
}
export interface BandSetSnap {
  code: string;
  nameEn: string;
  provenance: Provenance;
  governingSource: string;
  bands: BandSnap[];
}
export interface CriterionSnap {
  code: string;
  /// The group (a 40-mark block) it sits in; null at the top.
  parentCode: string | null;
  order: number;
  labelEn: string;
  labelMs: string | null;
  maxMarks: string | null;
  scale: CriterionScale;
  computedInput: ComputedInput;
  bandSetCode: string | null;
  needsNamedContractor: boolean;
  provenance: Provenance;
}
export interface FactorSnap {
  code: string;
  labelEn: string;
  labelMs: string | null;
  factorPct: string;
  provenance: Provenance;
}
export interface StageSnap {
  order: number;
  code: string;
  labelEn: string;
  labelMs: string | null;
  kind: StageKind;
  side: Side;
  unlocksAfterOrder: number | null;
  maxMarks: string | null;
  passMark: string | null;
  passInclusive: boolean | null;
  mustPass: boolean | null;
  compositeWeight: string | null;
  committeeCode: string | null;
  shortlistRule: ShortlistRule | null;
  shortlistMin: number | null;
  shortlistMax: number | null;
  shortlistOfficeCode: string | null;
  capitalBase: CapitalBase | null;
  provenance: Provenance;
  governingSource: string;
  criteria: CriterionSnap[];
  factors: FactorSnap[];
}
export interface AspectSnap {
  code: string;
  kind: AspectKind;
  labelEn: string;
  labelMs: string | null;
  /// Required on this model's route by configuration (FR-EVL-003).
  required: boolean;
  provenance: Provenance;
}
/// What a draft is, and what an issue freezes.
export interface ModelContent {
  code: string;
  version: number;
  nameEn: string;
  nameMs: string | null;
  route: EvaluationRoute;
  provenance: Provenance;
  governingSource: string;
  stages: StageSnap[];
  bandSets: BandSetSnap[];
}
export interface ModelSnapshot extends ModelContent {
  v: 1;
  modelId: string;
  issuedAt: string;
  aspects: AspectSnap[];
}

/// An aspect as configured (organisation rows).
export interface AspectConfig {
  code: string;
  kind: AspectKind;
  labelEn: string;
  labelMs: string | null;
  requiredOnRoute: EvaluationRoute | null;
  provenance: Provenance;
  retired: boolean;
}

// ------------------------------------------------------------------ checking a draft (at issue)

export type ModelFault =
  | "NO_STAGES"
  | "STAGE_ORDER_DUPLICATE"
  | "UNLOCKS_UNKNOWN"
  | "SIDE_FOR_STAGE"
  | "MAX_MARKS_NOT_SET"
  | "NO_CRITERIA"
  | "MARKS_NOT_TOTAL"
  | "CRITERION_MAX_NOT_SET"
  | "CRITERION_SCALE_FOR_STAGE"
  | "PASS_MARK_RANGE"
  | "PASS_RULE_NOT_SET"
  | "MUST_PASS_NOT_SET"
  | "SHORTLIST_RULE_NOT_SET"
  | "SHORTLIST_RANGE_NOT_SET"
  | "SHORTLIST_OFFICE_NOT_SET"
  | "CAPITAL_BASE_NOT_SET"
  | "FACTORS_NOT_SET"
  | "FACTOR_RANGE"
  | "CAPITAL_CRITERION_MISSING"
  | "BANDED_INPUT_NOT_SET"
  | "INPUT_FOR_STAGE"
  | "BAND_SET_NOT_SET"
  | "BAND_SET_UNKNOWN"
  | "FLOOR_EDGE_MISUSED"
  | "WEIGHTS_NOT_100"
  | "WEIGHT_ON_LATER_STAGE"
  | "COMPOSITE_HAS_NO_WEIGHTS"
  | "COMMITTEE_NOT_SET"
  | "TWO_STAGE_FIRST_STAGE"
  | "COMMITTEE_STAGE_ON_TRADITIONAL"
  | "RECOMMENDATION_MISSING"
  | "RECOMMENDATION_NOT_LAST"
  | "ASPECTS_STAGE_MISSING"
  | "ASPECTS_STAGE_TWICE"
  | "ASPECT_KIND_MISSING"
  | "BANDS_OVERLAP"
  | "BANDS_GAP"
  | "BANDS_EMPTY"
  | "BAND_EDGES_REVERSED";

const HUNDRED = fixedFromWhole(100);
const f = (s: string | null) => (s == null ? null : parseFixed(s));
const MUST_DECIDE: readonly StageKind[] = ["CHECKLIST", "SCORED", "FINANCIAL_TEST", "COMMERCIAL", "COMPOSITE"];
const SCORE_SCALES: Partial<Record<StageKind, readonly CriterionScale[]>> = {
  CHECKLIST: ["PASS_FAIL"],
  SCORED: ["ENTERED_MARKS", "PASS_FAIL", "BANDED"],
  FINANCIAL_TEST: ["BANDED", "PASS_FAIL", "ENTERED_MARKS"],
  COMMERCIAL: ["BANDED"],
};
const INPUTS_FOR: Partial<Record<StageKind, readonly ComputedInput[]>> = {
  SCORED: ["MIN_CAPITAL_RATIO", "VARIANCE_VS_ESTIMATE", "VARIANCE_VS_LOWEST", "CPR_PERCENT"],
  FINANCIAL_TEST: ["MIN_CAPITAL_RATIO"],
  COMMERCIAL: ["VARIANCE_VS_ESTIMATE", "VARIANCE_VS_LOWEST", "CPR_PERCENT"],
};

/// The aspects configured as required on a route, in force (FR-EVL-003).
export const aspectsRequiredOn = (aspects: readonly AspectConfig[], route: EvaluationRoute) => aspects.filter((a) => !a.retired && a.requiredOnRoute === route);

/// The bands of a set snapshot, as fixed point.
export const bandsOf = (s: BandSetSnap): Band[] => s.bands.map((b) => ({ ...b, lower: f(b.lower), upper: f(b.upper) }));

/**
 * Every reason a draft cannot be issued (block), and what it may be issued with (warn: a gap in a
 * band set, OD-5 A). `aspects` are the organisation's aspect rows in force.
 */
export function modelFaults(m: ModelContent, aspects: readonly AspectConfig[]): Finding<ModelFault>[] {
  const out: Finding<ModelFault>[] = [];
  const add = (code: ModelFault, data?: Finding["data"], level: "block" | "warn" = "block") => out.push({ code, level, ...(data ? { data } : {}) });
  const stages = [...m.stages].sort((a, b) => a.order - b.order);
  if (stages.length === 0) return [{ code: "NO_STAGES", level: "block" }];
  const orders = new Set<number>();
  for (const s of stages) {
    if (orders.has(s.order)) add("STAGE_ORDER_DUPLICATE", { stage: s.labelEn, order: s.order });
    orders.add(s.order);
  }
  const bandSets = new Map(m.bandSets.map((b) => [b.code, b]));
  const floorSets = new Set<string>();
  for (const s of stages) {
    const st = { stage: s.labelEn };
    if (s.unlocksAfterOrder != null && !stages.some((x) => x.order === s.unlocksAfterOrder && x.order < s.order)) add("UNLOCKS_UNKNOWN", st);
    if ((s.kind === "COMMITTEE_DECISION") !== (s.side === "COMMITTEE")) add("SIDE_FOR_STAGE", st);
    if (MUST_DECIDE.includes(s.kind) && s.mustPass == null) add("MUST_PASS_NOT_SET", st);
    const pm = f(s.passMark);
    if (pm != null) {
      if (compareFixed(pm, 0n) < 0 || compareFixed(pm, HUNDRED) > 0) add("PASS_MARK_RANGE", st);
      if (s.passInclusive == null) add("PASS_RULE_NOT_SET", st);
    }
    const scales = SCORE_SCALES[s.kind];
    if (scales) {
      if (s.criteria.length === 0) add("NO_CRITERIA", st);
      for (const c of s.criteria) {
        const ct = { stage: s.labelEn, criterion: c.labelEn };
        const isGroup = s.criteria.some((x) => x.parentCode === c.code);
        if (!isGroup && !scales.includes(c.scale)) add("CRITERION_SCALE_FOR_STAGE", ct);
        if (c.scale === "BANDED") {
          if (c.computedInput === "NONE") add("BANDED_INPUT_NOT_SET", ct);
          else if (!(INPUTS_FOR[s.kind] ?? []).includes(c.computedInput)) add("INPUT_FOR_STAGE", ct);
          if (!c.bandSetCode) add("BAND_SET_NOT_SET", ct);
          else if (!bandSets.has(c.bandSetCode)) add("BAND_SET_UNKNOWN", ct);
          else if (c.computedInput === "MIN_CAPITAL_RATIO") floorSets.add(c.bandSetCode);
        }
        if ((c.scale === "ENTERED_MARKS" || isGroup) && c.maxMarks == null) add("CRITERION_MAX_NOT_SET", ct);
        if (isGroup) {
          const kids = s.criteria.filter((x) => x.parentCode === c.code && x.scale === "ENTERED_MARKS" && x.maxMarks != null);
          const max = f(c.maxMarks);
          if (max != null && sumFixed(...kids.map((k) => parseFixed(k.maxMarks!))) !== max) add("MARKS_NOT_TOTAL", ct);
        }
      }
    }
    if (s.kind === "SCORED") {
      const max = f(s.maxMarks);
      if (max == null) add("MAX_MARKS_NOT_SET", st);
      else {
        const top = s.criteria.filter((c) => c.parentCode == null && c.maxMarks != null && (c.scale === "ENTERED_MARKS" || s.criteria.some((x) => x.parentCode === c.code)));
        if (sumFixed(...top.map((c) => parseFixed(c.maxMarks!))) !== max) add("MARKS_NOT_TOTAL", st);
      }
    }
    if (s.kind === "SHORTLIST") {
      if (!s.shortlistRule) add("SHORTLIST_RULE_NOT_SET", st);
      if (s.shortlistRule === "COUNT_RANGE" && (s.shortlistMin == null || s.shortlistMax == null)) add("SHORTLIST_RANGE_NOT_SET", st);
      if (s.shortlistRule === "DECIDED_BY_OFFICE" && !s.shortlistOfficeCode) add("SHORTLIST_OFFICE_NOT_SET", st);
    }
    // FR-EVL-008, 010: a minimum-capital test needs its base and the factors it may apply, on any stage that has one.
    const capital = s.criteria.some((c) => c.scale === "BANDED" && c.computedInput === "MIN_CAPITAL_RATIO");
    if (s.kind === "FINANCIAL_TEST" && !capital) add("CAPITAL_CRITERION_MISSING", st);
    if (capital) {
      if (!s.capitalBase) add("CAPITAL_BASE_NOT_SET", st);
      if (s.factors.length === 0) add("FACTORS_NOT_SET", st);
      for (const x of s.factors) {
        const p = parseFixed(x.factorPct);
        if (compareFixed(p, 0n) <= 0 || compareFixed(p, HUNDRED) > 0) add("FACTOR_RANGE", { stage: s.labelEn, factor: x.labelEn });
      }
    }
    if (s.kind === "COMMITTEE_DECISION") {
      if (!s.committeeCode) add("COMMITTEE_NOT_SET", st);
      if (m.route === "TRADITIONAL") add("COMMITTEE_STAGE_ON_TRADITIONAL", st);
    }
    if (s.kind === "COMPOSITE") {
      const parts = stages.filter((x) => x.compositeWeight != null && x.kind !== "COMPOSITE");
      if (parts.length === 0) add("COMPOSITE_HAS_NO_WEIGHTS", st);
      else if (sumFixed(...parts.map((x) => parseFixed(x.compositeWeight!))) !== HUNDRED) add("WEIGHTS_NOT_100", st);
      for (const x of parts) if (x.order > s.order) add("WEIGHT_ON_LATER_STAGE", { stage: x.labelEn });
    }
  }
  // FR-EVL-005: a two-stage tender opens with the committee's decision on each bidder.
  if (m.route === "TWO_STAGE" && stages[0].kind !== "COMMITTEE_DECISION") add("TWO_STAGE_FIRST_STAGE");
  const recs = stages.filter((s) => s.kind === "RECOMMENDATION");
  if (recs.length === 0) add("RECOMMENDATION_MISSING");
  else if (recs.length > 1 || stages.at(-1)!.kind !== "RECOMMENDATION") add("RECOMMENDATION_NOT_LAST");
  // FR-EVL-003: aspects required on the route by configuration are assessed on an ASPECTS stage.
  const aspectStages = stages.filter((s) => s.kind === "ASPECTS").length;
  const required = aspectsRequiredOn(aspects, m.route);
  if (aspectStages > 1) add("ASPECTS_STAGE_TWICE");
  if (required.length > 0 && aspectStages === 0) add("ASPECTS_STAGE_MISSING");
  // A traditional model that assesses aspects assesses FR-EVL-003's four, each configured as required on the route.
  if (m.route === "TRADITIONAL" && aspectStages > 0) for (const k of REQUIRED_ASPECT_KINDS) if (!required.some((a) => a.kind === k)) add("ASPECT_KIND_MISSING", { kind: k });
  for (const set of m.bandSets) {
    if (!floorSets.has(set.code) && set.bands.some((b) => b.lowerIsFloor || b.upperIsFloor)) add("FLOOR_EDGE_MISUSED", { set: set.nameEn });
    out.push(...bandSetFaults({ code: set.code, nameEn: set.nameEn, bands: bandsOf(set) }));
  }
  return out;
}

/// The content an issue freezes: the draft, with the aspects in force on its route.
export function modelSnapshot(modelId: string, m: ModelContent, aspects: readonly AspectConfig[], issuedAt: Date): ModelSnapshot {
  const live = aspects.filter((a) => !a.retired && (a.requiredOnRoute == null || a.requiredOnRoute === m.route));
  return {
    v: 1,
    modelId,
    issuedAt: issuedAt.toISOString(),
    ...m,
    stages: [...m.stages].sort((a, b) => a.order - b.order).map((s) => ({ ...s, criteria: [...s.criteria].sort((a, b) => a.order - b.order) })),
    aspects: live.map((a) => ({ code: a.code, kind: a.kind, labelEn: a.labelEn, labelMs: a.labelMs, required: a.requiredOnRoute === m.route, provenance: a.provenance })),
  };
}

/// A pinned snapshot read back; null where it is not one (never guessed).
export function modelFromSnapshot(json: unknown): ModelSnapshot | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const s = json as Partial<ModelSnapshot>;
  if (s.v !== 1 || !Array.isArray(s.stages) || !Array.isArray(s.bandSets) || !Array.isArray(s.aspects) || typeof s.route !== "string") return null;
  return s as ModelSnapshot;
}

/// A stage by its code, in a snapshot.
export const stageOf = (m: Pick<ModelSnapshot, "stages">, code: string) => m.stages.find((s) => s.code === code) ?? null;
/// The criteria scores are entered on: leaves (not groups) of ENTERED_MARKS or PASS_FAIL.
export const scoredCriteria = (s: StageSnap) => s.criteria.filter((c) => (c.scale === "ENTERED_MARKS" || c.scale === "PASS_FAIL") && !s.criteria.some((x) => x.parentCode === c.code));
/// The banded criteria of a stage.
export const bandedCriteria = (s: StageSnap) => s.criteria.filter((c) => c.scale === "BANDED");
/// A band set of a snapshot.
export const bandSetOf = (m: Pick<ModelSnapshot, "bandSets">, code: string | null) => (code ? (m.bandSets.find((b) => b.code === code) ?? null) : null);
/// The stages a composite weighs.
export const compositeParts = (m: Pick<ModelSnapshot, "stages">) => m.stages.filter((s) => s.compositeWeight != null && s.kind !== "COMPOSITE");
/// The stage's decimal fields as fixed point.
export const stageFigures = (s: StageSnap): { maxMarks: Fixed | null; passMark: Fixed | null; compositeWeight: Fixed | null } => ({ maxMarks: f(s.maxMarks), passMark: f(s.passMark), compositeWeight: f(s.compositeWeight) });
