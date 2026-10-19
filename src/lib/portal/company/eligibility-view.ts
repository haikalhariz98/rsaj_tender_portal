/**
 * A supplier's own eligibility for an exercise, in its own words (Phase 4c; FR-VND-011, after 615-C1). Pure. The judgement is `eligibility` (src/lib/suppliers/eligibility.ts), the very rule
 * the office's screens and a bid's opening use; nothing is restated here. What this adds is wording for the person it is about: each condition with a pass or a fail and the reason, the
 * failing condition named, and the settings the office has not finished written as "the office has not set this up yet" rather than as a path through its configuration.
 *
 * "Not assessed" is never shown as a pass, and never as green: it means a condition could not be checked, and the supplier is told which.
 */

import type { ConditionKind, ConditionRow, Result, Verdict } from "@/lib/suppliers/eligibility";
import { CONDITION_LABEL, conditionWords, RESULT_LABEL, VERDICT_LABEL } from "@/lib/suppliers/labels";

export interface ConditionView {
  key: string;
  /// What is being checked ("Grade").
  label: string;
  result: Result;
  resultText: string;
  tone: "ok" | "err" | "warn" | "info";
  /// Why, in a sentence.
  reason: string;
  /// Which requirement of the exercise it belongs to, when it does (the body's name).
  about: string | null;
}

/// The reasons that name a setting of the office's (a path through its configuration). The supplier cannot set them, so it is told the office has not.
const OFFICE_SETTING: Readonly<Record<string, string>> = {
  NO_DOCUMENT_TYPE_FOR_BODY: "Not checked: the office has not set how this registration is recorded.",
  GRADE_RANK_NOT_SET: "Not checked: the office has not set the order of grades.",
  LAPSE_RULE_NOT_SET: "Not checked: the office has not set what an expired document does.",
  CLOSING_DAY_RULE_NOT_SET: "Your certificate expires on the closing day. The office has not set if that day counts.",
  EVIDENCE_TYPE_NOT_SET: "Not checked: the office has not set which document proves the restriction.",
};

const RESULT_TONE: Readonly<Record<Result, ConditionView["tone"]>> = { PASS: "ok", FAIL: "err", NOT_ASSESSED: "warn", PASS_BY_PERMISSION: "info" };

export function conditionViews(rows: readonly ConditionRow[]): ConditionView[] {
  return rows.map((r, n) => ({
    key: `${r.kind}-${r.requirementId ?? "x"}-${n}`,
    label: CONDITION_LABEL[r.kind as ConditionKind].en,
    result: r.result,
    resultText: RESULT_LABEL[r.result].en,
    tone: RESULT_TONE[r.result],
    reason: OFFICE_SETTING[r.reason] ?? conditionWords(r).en,
    about: typeof r.data?.body === "string" ? r.data.body : null,
  }));
}

export const SUPPLIER_VERDICT: Readonly<Record<Verdict, { text: string; detail: string; tone: "ok" | "err" | "warn" }>> = {
  ELIGIBLE: { text: VERDICT_LABEL.ELIGIBLE.en, detail: "You meet every condition that could be checked.", tone: "ok" },
  NOT_ELIGIBLE: { text: VERDICT_LABEL.NOT_ELIGIBLE.en, detail: "At least one condition is not met.", tone: "err" },
  NOT_ASSESSED: { text: VERDICT_LABEL.NOT_ASSESSED.en, detail: "Something could not be checked.", tone: "warn" },
};

/// The conditions that are not a pass, first: what a supplier needs to read to know what to do.
export function failingFirst(views: readonly ConditionView[]): ConditionView[] {
  const order: Record<Result, number> = { FAIL: 0, NOT_ASSESSED: 1, PASS_BY_PERMISSION: 2, PASS: 3 };
  return [...views].sort((a, b) => order[a.result] - order[b.result]);
}
