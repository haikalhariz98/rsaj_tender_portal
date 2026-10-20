/**
 * The evaluation's two instruments (ADR 0008 shape): the report (FR-EVL-017) and the Kertas Cadangan
 * rendered from it (FR-CTE-013), each from the customer's configured template (Configuration ›
 * Evaluation models › Policy), frozen when issued or rendered. One whitelist per instrument: a field
 * the instrument does not fill is reported and never printed as written. Values are words and
 * formatted figures, never codes. Unset template, no text, no language: nothing is rendered, and the
 * act says which. Pure.
 */

import { renderWith, renderedText, type MergeWhitelist } from "@/lib/templates/merge";
import { issueLanguage } from "@/lib/window/fields";

export type EvaluationInstrument = "REPORT" | "PROPOSAL";
type Lang = "MS" | "EN";

const COMMON: readonly { key: string; labelEn: string }[] = [
  { key: "organisation.name", labelEn: "Organisation" },
  { key: "exercise.reference", labelEn: "Exercise reference" },
  { key: "exercise.title", labelEn: "Exercise title" },
  { key: "evaluation.reference", labelEn: "Report reference" },
  { key: "evaluation.version", labelEn: "Evaluation version" },
  { key: "evaluation.model", labelEn: "Evaluation model" },
  { key: "evaluation.issuedOn", labelEn: "Report date" },
  { key: "evaluation.bidCount", labelEn: "Bids evaluated" },
  { key: "recommendation.bidder", labelEn: "Recommended tenderer" },
  { key: "recommendation.registrationNo", labelEn: "Recommended tenderer's registration number" },
  { key: "recommendation.price", labelEn: "Recommended price" },
  { key: "recommendation.period", labelEn: "Completion period" },
  { key: "recommendation.justification", labelEn: "Why another than the top-ranked is recommended" },
  { key: "saving.amount", labelEn: "Saving against the estimate" },
  { key: "saving.percent", labelEn: "Saving as a percentage" },
];

export const EVALUATION_MERGE_FIELDS: Readonly<Record<EvaluationInstrument, readonly { key: string; labelEn: string }[]>> = {
  REPORT: COMMON,
  PROPOSAL: [...COMMON, { key: "proposal.checkerOffice", labelEn: "Checking officer's office" }, { key: "proposal.recommenderOffice", labelEn: "Recommending officer's office" }],
};

/// Every key either instrument fills: a template naming one is accepted when saved (Configuration › Templates).
export const EVALUATION_FIELD_KEYS: ReadonlySet<string> = new Set(Object.values(EVALUATION_MERGE_FIELDS).flatMap((fs) => fs.map((f) => f.key)));

const whitelist = (i: EvaluationInstrument): MergeWhitelist => {
  const fs = EVALUATION_MERGE_FIELDS[i];
  return { has: (k) => fs.some((f) => f.key === k), label: (k) => fs.find((f) => f.key === k)?.labelEn ?? "A field" };
};

export type TemplateState = "OK" | "NOT_SET" | "NO_TEXT" | "NO_LANGUAGE";

export interface TemplateFacts {
  id: string;
  code: string;
  nameEn: string;
  bodyEn: string | null;
  bodyMs: string | null;
  primaryLanguage: Lang | null;
  bodyVersion: number;
}

export function renderEvaluationInstrument(instrument: EvaluationInstrument, template: TemplateFacts | null, fields: (lang: Lang) => Record<string, string>): { state: TemplateState; language: Lang | null; text: string | null; missing: string[]; unknown: string[] } {
  const none = (state: TemplateState) => ({ state, language: null, text: null, missing: [], unknown: [] });
  if (!template) return none("NOT_SET");
  const lang = issueLanguage(template);
  if (!lang) return none("NO_TEXT");
  const r = renderWith(template.bodyEn!, fields(lang), whitelist(instrument));
  return { state: "OK", language: lang, text: renderedText(r), missing: r.missing, unknown: r.unknown };
}

/// A field list in words, for a refusal.
export const evaluationFieldsInWords = (instrument: EvaluationInstrument, keys: readonly string[]) => keys.map((k) => EVALUATION_MERGE_FIELDS[instrument].find((f) => f.key === k)?.labelEn.toLowerCase() ?? `{{${k}}}`).join(", ");
