/**
 * Contractor performance's words (Phase 2 close-out stage D). A code never reaches a screen. English only. Pure.
 */

import { formatMark, parseFixed, type Fixed } from "@/lib/evaluation/fixed";

import type { Finding } from "./form";
import type { PerformanceState } from "./report";

type Data = Record<string, string | number | null | undefined>;

export const PERFORMANCE_FAULT_WORDS: Readonly<Record<string, (d: Data) => string>> = {
  // The form
  TYPE_HAS_ISSUED_FORM: () => "This contract type already has an issued form. Retire it first.",
  SCALE_OUT_OF_RANGE: () => "The scale's top is 2 to 10.",
  NO_CRITERIA: () => "Add at least one criterion.",
  WEIGHTS_NOT_ONE: (d) => `The weights total ${d.total ?? "something else"}%, not exactly 100%.`,
  CRITERION_ORDER_REPEATED: () => "Two criteria share an order.",
  NO_BANDS: () => "Add the grades.",
  BANDS_NOT_FROM_ZERO: () => "The lowest grade starts at 0.",
  BAND_REPEATED: () => "Two grades start at the same score.",
  BANDS_OVERLAP: (d) => `Grades ${d.band ?? ""} and ${d.other ?? ""} overlap.`,
  BANDS_EMPTY: () => "Add the grades.",
  BAND_EDGES_REVERSED: (d) => `Grade ${d.band ?? ""} ends before it starts.`,
  // The report
  PERFORMANCE_FORM_NOT_SET: (d) => `${d.type ? `${d.type} contracts have` : "This contract has no contract type, so it has"} no issued performance form. Issue one in Settings › Performance forms.`,
  NOT_YET_OPEN: (d) => (d.dlp === "yes" ? "Opens once the certificate of making good defects is issued." : "Opens once the practical completion certificate is issued."),
  REPORT_LIVE: () => "This contract already has its report.",
  SCORE_MISSING: (d) => `Score ${d.criterion ?? "every criterion"}.`,
  OUT_OF_SCALE: (d) => `${d.criterion ?? "A score"} is 1 to ${d.top ?? "the scale's top"}.`,
  NOT_GRADED: () => "No grade holds this total. Correct the form's grades.",
  ASSESSED: () => "The report is assessed, so its scores are fixed.",
  NOT_ASSESSED: () => "Assess the report first.",
  SAME_PERSON: () => "You assessed this report. A different person verifies it.",
  VERIFIED: () => "The report is already verified.",
  PERFORMANCE_NOT_FILED: () => "The contractor performance report is not verified.",
};

export const performanceFaultText = (f: Finding): string => PERFORMANCE_FAULT_WORDS[f.code]?.(f.data ?? {}) ?? "Refused.";
export const performanceRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(performanceFaultText).join(" ")}`.trim();

export const PERFORMANCE_STATE_WORDS: Readonly<Record<PerformanceState, string>> = { NONE: "Not started", OPEN: "Scoring", ASSESSED: "Assessed, to verify", VERIFIED: "Filed" };
export const PERFORMANCE_STATE_TONE: Readonly<Record<PerformanceState, "info" | "ok" | "warn" | undefined>> = { NONE: undefined, OPEN: "warn", ASSESSED: "info", VERIFIED: "ok" };
export const FORM_STATUS_WORDS: Readonly<Record<string, string>> = { DRAFT: "Draft", ISSUED: "Issued", RETIRED: "Retired" };

/// A stored weight (a fraction, "0.2500") as the form shows it: "25%".
export const weightText = (w: { toString(): string }): string => `${formatMark(parseFixed(w.toString()) * 100n, 0)}%`;

/// The stored total as judged: never rounded across a grade's edge ("39.995%", "74.00%").
export const totalText = (total: Fixed): string => `${formatMark(total, 2)}%`;
