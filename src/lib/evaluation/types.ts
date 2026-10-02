/**
 * The vocabulary of evaluation (spec §6.8, §7.1, §8.11; plan 6.8 as ruled, E-1..E-13), as pure types.
 * Mirrors the Prisma enums so `src/lib/evaluation/**` stays free of the client, as the other lib
 * modules do. Every rule about an evaluation lives beside this file; actions and screens call it and
 * never restate it.
 *
 * Nothing here is policy (D1, rule 1): the code knows only the *kinds* of computation a stage is — a
 * weighted sum, a minimum-capital ratio, a variance, a band — and every weight, pass mark, factor and
 * band edge is the customer's configuration, issued in a versioned model and pinned on the exercise
 * at publication (FR-EVL-006, 007; ADR 0018). Unset is "not set", never zero, never a default.
 *
 * Nobody signs in yet: every person named is recorded on their behalf, not signed. Scores, prices,
 * the estimate and the report are SULIT and shown only on the Evaluation tab and its prints (E-3).
 */

import type { Provenance } from "@/lib/reference/types";

export type { Provenance };

export type Level = "block" | "warn" | "info";

export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the words are written with (names, numbers, labels, days as YYYY-MM-DD). Never a price or a score.
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

export type EvaluationRoute = "TRADITIONAL" | "TWO_STAGE";
export const EVALUATION_ROUTES: readonly EvaluationRoute[] = ["TRADITIONAL", "TWO_STAGE"];

export type StageKind = "CHECKLIST" | "SHORTLIST" | "SCORED" | "ASPECTS" | "FINANCIAL_TEST" | "COMMERCIAL" | "COMPOSITE" | "COMMITTEE_DECISION" | "RECOMMENDATION";
export const STAGE_KINDS: readonly StageKind[] = ["CHECKLIST", "SHORTLIST", "SCORED", "ASPECTS", "FINANCIAL_TEST", "COMMERCIAL", "COMPOSITE", "COMMITTEE_DECISION", "RECOMMENDATION"];

export type Side = "IMPLEMENTING_DEPARTMENT" | "CONTRACT_PROCUREMENT" | "COMMITTEE";
export const SIDES: readonly Side[] = ["IMPLEMENTING_DEPARTMENT", "CONTRACT_PROCUREMENT", "COMMITTEE"];
/// The two sides a team member is appointed to (FR-EVL-001); the committee side is the committee's.
export const TEAM_SIDES: readonly Side[] = ["IMPLEMENTING_DEPARTMENT", "CONTRACT_PROCUREMENT"];

export type CriterionScale = "ENTERED_MARKS" | "PASS_FAIL" | "BANDED";
export const CRITERION_SCALES: readonly CriterionScale[] = ["ENTERED_MARKS", "PASS_FAIL", "BANDED"];

export type ComputedInput = "NONE" | "MIN_CAPITAL_RATIO" | "VARIANCE_VS_ESTIMATE" | "VARIANCE_VS_LOWEST" | "CPR_PERCENT";
export const COMPUTED_INPUTS: readonly ComputedInput[] = ["NONE", "MIN_CAPITAL_RATIO", "VARIANCE_VS_ESTIMATE", "VARIANCE_VS_LOWEST", "CPR_PERCENT"];

export type CapitalBase = "TENDER_AMOUNT" | "COMPANY_ESTIMATE";
export const CAPITAL_BASES: readonly CapitalBase[] = ["TENDER_AMOUNT", "COMPANY_ESTIMATE"];

export type ShortlistRule = "COUNT_RANGE" | "DECIDED_BY_OFFICE" | "NONE";
export const SHORTLIST_RULES: readonly ShortlistRule[] = ["COUNT_RANGE", "DECIDED_BY_OFFICE", "NONE"];

export type ModelStatus = "DRAFT" | "ISSUED" | "RETIRED";
export type AspectKind = "COMPLETENESS" | "PRICE_VS_ESTIMATE" | "COMPLETION_PERIOD" | "CAPABILITY" | "OTHER";
export const ASPECT_KINDS: readonly AspectKind[] = ["COMPLETENESS", "PRICE_VS_ESTIMATE", "COMPLETION_PERIOD", "CAPABILITY", "OTHER"];
/// FR-EVL-003's four aspects: (a) completeness, (b) the price against the estimate, (c) the completion period, (d) capability.
export const REQUIRED_ASPECT_KINDS: readonly AspectKind[] = ["COMPLETENESS", "PRICE_VS_ESTIMATE", "COMPLETION_PERIOD", "CAPABILITY"];
export type AspectVerdict = "SATISFACTORY" | "NOT_SATISFACTORY";
export const ASPECT_VERDICTS: readonly AspectVerdict[] = ["SATISFACTORY", "NOT_SATISFACTORY"];
export type BandOutcome = "PASS" | "FAIL" | "NONE";
export const BAND_OUTCOMES: readonly BandOutcome[] = ["PASS", "FAIL", "NONE"];
export type MeetingKind = "CLARIFICATION" | "NEGOTIATION";
export type EvaluationState = "OPEN" | "ISSUED" | "SUPERSEDED" | "CANCELLED";
export type EvaluationTrigger = "START" | "LOOP" | "SUPPLEMENTARY_OPENING";
export type CommunicationDirection = "TO_TENDERER" | "FROM_TENDERER";
export const COMMUNICATION_DIRECTIONS: readonly CommunicationDirection[] = ["TO_TENDERER", "FROM_TENDERER"];
export type CommunicationChannel = "LETTER" | "EMAIL" | "FAX";
export const COMMUNICATION_CHANNELS: readonly CommunicationChannel[] = ["LETTER", "EMAIL", "FAX"];
export type PeriodUnit = "DAYS" | "WEEKS" | "MONTHS";

/// The engine's route domain authorising a negotiation (FR-EVL-016). Vocabulary, not policy: which
/// rows exist for it is the customer's matrix (none shipped; no rule refuses, naming the Approval matrix).
export const NEGOTIATION_DOMAIN = "negotiation";
/// A two-stage tender's first-stage committee matter, one per bidder (FR-EVL-005), tabled from the Evaluation tab.
export const EVALUATION_STAGE_DOMAIN = "evaluation_stage_one";
