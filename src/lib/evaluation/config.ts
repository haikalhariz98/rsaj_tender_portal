/**
 * Configuration › Evaluation models, the pure half (plan §4 item 10; FR-EVL-006, 008, 009; ADR 0018).
 * A model is drafted row by row (stages, criteria, factor options, band sets and bands), checked by
 * `modelFaults` and issued: the issue freezes its content (`modelSnapshot`), and an issued version is
 * read-only — a change is a new version, copied from the latest. Nothing is shipped: every number is
 * the customer's, typed with where it came from. Pure.
 *
 * This file and `config-read.ts` are the only evaluation modules that read the model's rows (the
 * source scan in `sealed.test.ts` exempts `config`): they build what an issue freezes.
 */

import { fixedToDecimalString, isFixed, parseFixed, compareFixed, fixedFromWhole } from "./fixed";
import type { AspectConfig, BandSetSnap, CriterionSnap, FactorSnap, ModelContent, StageSnap } from "./model";
import type { AspectKind, BandOutcome, CapitalBase, ComputedInput, CriterionScale, EvaluationRoute, ModelStatus, Provenance, ShortlistRule, Side, StageKind } from "./types";

export type ConfigFault = "MODEL_NOT_DRAFT" | "NOT_A_DECIMAL" | "OUT_OF_RANGE" | "CODE_TAKEN" | "ORDER_TAKEN" | "PARENT_UNKNOWN" | "PARENT_NESTED" | "DRAFT_EXISTS" | "NOT_ISSUED" | "UNKNOWN_CHOICE" | "PROVENANCE_REQUIRED" | "BAND_SET_IN_USE" | "PARENT_IN_USE";

export const CONFIG_TEXT: Readonly<Record<ConfigFault, string>> = {
  MODEL_NOT_DRAFT: "An issued or retired version is read-only: a change is a new version, started from this one.",
  NOT_A_DECIMAL: "Give a number with at most four decimal places.",
  OUT_OF_RANGE: "That number is outside what this field takes.",
  CODE_TAKEN: "That code is already used here. Codes are keys: each is used once.",
  ORDER_TAKEN: "Another row already has that order.",
  PARENT_UNKNOWN: "That group is not one of this stage's criteria.",
  PARENT_NESTED: "A group sits at the top of the stage: a criterion inside a group cannot hold others.",
  DRAFT_EXISTS: "A draft version of this model is already open: change that one.",
  NOT_ISSUED: "Only an issued version is retired.",
  UNKNOWN_CHOICE: "That choice is no longer configured.",
  PROVENANCE_REQUIRED: "Say where this value came from.",
  BAND_SET_IN_USE: "A criterion places its value in this band set: point it elsewhere first.",
  PARENT_IN_USE: "Criteria sit inside this group: move or remove them first.",
};

/// A draft is edited; an issued or retired version never is.
export const draftFault = (status: ModelStatus): ConfigFault | null => (status === "DRAFT" ? null : "MODEL_NOT_DRAFT");

/// A new version is started from the latest, only while no draft of the model is open.
export const newVersionFault = (versions: readonly { status: ModelStatus }[]): ConfigFault | null => (versions.some((v) => v.status === "DRAFT") ? "DRAFT_EXISTS" : null);

export const nextVersion = (versions: readonly { version: number }[]) => versions.reduce((n, v) => Math.max(n, v.version), 0) + 1;

/// Retiring takes an issued version out of the choice on the Window card; exercises that pinned it keep their snapshot.
export const retireFault = (status: ModelStatus): ConfigFault | null => (status === "ISSUED" ? null : "NOT_ISSUED");

/**
 * A typed decimal (four places at most), judged against its range. Empty: null (not set). `min`/`max`
 * inclusive unless `minExclusive`; whole numbers in the options.
 */
export function decimalField(raw: string | null | undefined, opts: { min?: number; max?: number; minExclusive?: boolean } = {}): { value: string | null } | { fault: ConfigFault } {
  const t = (raw ?? "").trim().replace(/,/g, "");
  if (!t) return { value: null };
  if (!isFixed(t)) return { fault: "NOT_A_DECIMAL" };
  const v = parseFixed(t);
  if (opts.min != null) {
    const c = compareFixed(v, fixedFromWhole(opts.min));
    if (c < 0 || (opts.minExclusive && c === 0)) return { fault: "OUT_OF_RANGE" };
  }
  if (opts.max != null && compareFixed(v, fixedFromWhole(opts.max)) > 0) return { fault: "OUT_OF_RANGE" };
  return { value: fixedToDecimalString(v) };
}

/// A criterion's group: one of the stage's top-level criteria, never itself, never one inside a group.
export function parentFault(criteria: readonly { code: string; parentCode: string | null }[], parentCode: string | null, selfCode: string | null): ConfigFault | null {
  if (!parentCode) return null;
  const p = criteria.find((c) => c.code === parentCode);
  if (!p || parentCode === selfCode) return "PARENT_UNKNOWN";
  if (p.parentCode != null) return "PARENT_NESTED";
  if (selfCode && criteria.some((c) => c.parentCode === selfCode)) return "PARENT_NESTED";
  return null;
}

// ------------------------------------------------------------------ rows → the content an issue freezes

type Dec = { toString(): string } | null;
const d4 = (v: Dec) => (v == null ? null : fixedToDecimalString(parseFixed(v.toString())));

export interface ModelRows {
  code: string;
  version: number;
  nameEn: string;
  nameMs: string | null;
  route: EvaluationRoute;
  provenance: Provenance;
  governingSource: string;
  stages: {
    order: number;
    code: string;
    labelEn: string;
    labelMs: string | null;
    kind: StageKind;
    side: Side;
    unlocksAfterOrder: number | null;
    maxMarks: Dec;
    passMark: Dec;
    passInclusive: boolean | null;
    mustPass: boolean | null;
    compositeWeight: Dec;
    committeeCode: string | null;
    shortlistRule: ShortlistRule | null;
    shortlistMin: number | null;
    shortlistMax: number | null;
    shortlistOfficeCode: string | null;
    capitalBase: CapitalBase | null;
    provenance: Provenance;
    governingSource: string;
    criteria: { id: string; parentId: string | null; order: number; code: string; labelEn: string; labelMs: string | null; maxMarks: Dec; scale: CriterionScale; computedInput: ComputedInput; bandSetCode: string | null; needsNamedContractor: boolean; provenance: Provenance }[];
    factorOptions: { code: string; labelEn: string; labelMs: string | null; factorPct: Dec; provenance: Provenance }[];
  }[];
  bandSets: { code: string; nameEn: string; roundPlaces: number | null; provenance: Provenance; governingSource: string; bands: { labelEn: string; labelMs: string | null; lower: Dec; lowerInclusive: boolean; lowerIsFloor: boolean; upper: Dec; upperInclusive: boolean; upperIsFloor: boolean; outcome: BandOutcome; sortOrder: number }[] }[];
}

/// A model's rows as the content `modelFaults` judges and `modelSnapshot` freezes (decimals as four-place strings).
export function contentOf(m: ModelRows): ModelContent {
  const stages: StageSnap[] = [...m.stages]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const codeOf = new Map(s.criteria.map((c) => [c.id, c.code]));
      const criteria: CriterionSnap[] = [...s.criteria]
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ code: c.code, parentCode: c.parentId ? (codeOf.get(c.parentId) ?? null) : null, order: c.order, labelEn: c.labelEn, labelMs: c.labelMs, maxMarks: d4(c.maxMarks), scale: c.scale, computedInput: c.computedInput, bandSetCode: c.bandSetCode, needsNamedContractor: c.needsNamedContractor, provenance: c.provenance }));
      const factors: FactorSnap[] = s.factorOptions.map((x) => ({ code: x.code, labelEn: x.labelEn, labelMs: x.labelMs, factorPct: d4(x.factorPct)!, provenance: x.provenance }));
      return { order: s.order, code: s.code, labelEn: s.labelEn, labelMs: s.labelMs, kind: s.kind, side: s.side, unlocksAfterOrder: s.unlocksAfterOrder, maxMarks: d4(s.maxMarks), passMark: d4(s.passMark), passInclusive: s.passInclusive, mustPass: s.mustPass, compositeWeight: d4(s.compositeWeight), committeeCode: s.committeeCode, shortlistRule: s.shortlistRule, shortlistMin: s.shortlistMin, shortlistMax: s.shortlistMax, shortlistOfficeCode: s.shortlistOfficeCode, capitalBase: s.capitalBase, provenance: s.provenance, governingSource: s.governingSource, criteria, factors };
    });
  const bandSets: BandSetSnap[] = m.bandSets.map((b) => ({ code: b.code, nameEn: b.nameEn, roundPlaces: b.roundPlaces, provenance: b.provenance, governingSource: b.governingSource, bands: [...b.bands].sort((x, y) => x.sortOrder - y.sortOrder).map((x) => ({ labelEn: x.labelEn, labelMs: x.labelMs, lower: d4(x.lower), lowerInclusive: x.lowerInclusive, lowerIsFloor: x.lowerIsFloor, upper: d4(x.upper), upperInclusive: x.upperInclusive, upperIsFloor: x.upperIsFloor, outcome: x.outcome, sortOrder: x.sortOrder })) }));
  return { code: m.code, version: m.version, nameEn: m.nameEn, nameMs: m.nameMs, route: m.route, provenance: m.provenance, governingSource: m.governingSource, stages, bandSets };
}

/// The organisation's aspect rows as `modelFaults` and `modelSnapshot` read them.
export const aspectConfigOf = (rows: readonly { code: string; kind: AspectKind; labelEn: string; labelMs: string | null; requiredOnRoute: EvaluationRoute | null; provenance: Provenance; retiredOn: Date | null }[], now: Date): AspectConfig[] =>
  rows.map((a) => ({ code: a.code, kind: a.kind, labelEn: a.labelEn, labelMs: a.labelMs, requiredOnRoute: a.requiredOnRoute, provenance: a.provenance, retired: a.retiredOn != null && a.retiredOn <= now }));
