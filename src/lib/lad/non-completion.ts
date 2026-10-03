/**
 * The non-completion chain (6.13 Part A step 3: FR-LAD-001, 003–008; OD-A1 A as ruled).
 *
 * - The warning letter (FR-LAD-003): before damages are imposed, the standard letter of intention, carrying the
 *   extension-of-time clause and the extended date for completion, the damages clause and the rate per unit from the
 *   pinned baseline (never keyed), sent by registered post with its consignment reference. The contractor's response
 *   window is the organisation's LAD_WARNING_RESPONSE clock, frozen with the letter; it is advisory (the source
 *   says the letter is good practice, not a contractual step), so unset reads "Not set" and blocks nothing.
 * - The decision (FR-LAD-001): only once the date for completion has passed. Damages apply only where the causes of
 *   delay do not entitle the contractor to an extension: recorded as LAD_APPLIES, which raises the Certificate of
 *   Non-Completion; or EXCUSED_OR_PENDING, with its reasons, which lets the interim certificates proceed without a
 *   damages line. Until Part B's extension-of-time module, this decision records the entitlement determination
 *   itself; Part B's record replaces it and never rewrites an issued certificate.
 * - The certificate (FR-LAD-004): its particulars as in the contract document, whole works or a section, the date
 *   the works ought to have been completed, the insurance expiry (required) and cover extended to the expected
 *   completion date (refused otherwise), and the four pack items, each answered or marked not required with a
 *   recorded reason (FR-LAD-005).
 * Pure.
 */

import type { Sen } from "@/lib/money";
import type { Day, Finding, NonCompletionOutcome, NonCompletionScope, PackItem } from "@/lib/payment/types";
import { PACK_ITEMS } from "@/lib/payment/types";

export interface WarningInput {
  dateForCompletion: Day | null;
  /// The rate the letter carries (the pinned baseline's). Null: not stated.
  rate: Sen | null;
  eotClause: string;
  ladClause: string;
  /// The extended date for completion the letter states (the date for completion where none is extended).
  extendedCompletion: Day | null;
  /// A warning letter already live (not void, not superseded by a decision).
  liveWarning: boolean;
  /// The letter's form (PostAwardPolicy). Null: not set.
  formSet: boolean;
}

export function warningFaults(i: WarningInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.dateForCompletion) f("NO_DATE_FOR_COMPLETION");
  if (i.rate == null) f("LAD_RATE_NOT_SET");
  if (!i.eotClause.trim()) f("CLAUSE_REQUIRED", { which: "eot" });
  if (!i.ladClause.trim()) f("CLAUSE_REQUIRED", { which: "lad" });
  if (!i.extendedCompletion) f("EXTENDED_COMPLETION_REQUIRED");
  else if (i.dateForCompletion && i.extendedCompletion < i.dateForCompletion) f("EXTENDED_BEFORE_COMPLETION", { day: i.dateForCompletion });
  if (i.liveWarning) f("WARNING_ALREADY_LIVE");
  if (!i.formSet) f("FORM_NOT_SET", { form: "warning" });
  return out;
}

/// Recording the registered post: the letter issued, once, with its consignment reference, never in the future.
export function postFaults(i: { letterIssued: boolean; already: boolean; ref: string; postedOn: Day; issuedOn: Day | null; today: Day }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.letterIssued) f("WARNING_NOT_ISSUED");
  if (i.already) f("POST_ALREADY_RECORDED");
  if (!i.ref.trim()) f("CONSIGNMENT_REQUIRED");
  if (i.postedOn > i.today) f("FUTURE_DATE", { day: i.postedOn });
  if (i.issuedOn && i.postedOn < i.issuedOn) f("POSTED_BEFORE_ISSUE", { day: i.issuedOn });
  return out;
}

export interface ClockRule {
  length: number;
  unit: "DAYS" | "WEEKS" | "MONTHS";
}

/// The contractor's response is due by: posted + the frozen clock (calendar days; weeks as 7). Months are read as
/// whole months by the caller's calendar helper; null where the clock was not set (advisory: "Not set").
export function responseDue(postedOn: Day | null, clock: ClockRule | null, addMonths: (d: Day, n: number) => Day, addDays: (d: Day, n: number) => Day): Day | null {
  if (!postedOn || !clock) return null;
  return clock.unit === "MONTHS" ? addMonths(postedOn, clock.length) : addDays(postedOn, clock.unit === "WEEKS" ? clock.length * 7 : clock.length);
}

export interface PackAnswer {
  item: PackItem;
  /// What it says. Empty with `notRequired`: the reason it is not required.
  text: string;
  notRequired: boolean;
}

export interface DecisionInput {
  outcome: NonCompletionOutcome | null;
  reason: string;
  dateForCompletion: Day | null;
  today: Day;
  /// LAD_APPLIES only:
  scope: NonCompletionScope | null;
  /// A section of the pinned baseline, with its rate (SECTION scope).
  section: { known: boolean; rate: Sen | null } | null;
  wholeRate: Sen | null;
  warning: { issued: boolean; posted: boolean } | null;
  eotClause: string;
  ladClause: string;
  insuranceExpiry: Day | null;
  expectedCompletion: Day | null;
  windowFrom: Day | null;
  windowUntil: Day | null;
  pack: readonly PackAnswer[];
  formSet: boolean;
}

export function decisionFaults(i: DecisionInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.dateForCompletion) f("NO_DATE_FOR_COMPLETION");
  else if (i.today <= i.dateForCompletion) f("NOT_PAST_COMPLETION", { day: i.dateForCompletion });
  if (!i.outcome) {
    f("OUTCOME_REQUIRED");
    return out;
  }
  if (!i.reason.trim()) f("DECISION_REASON_REQUIRED");
  if (i.outcome === "EXCUSED_OR_PENDING") return out;
  if (!i.warning?.issued || !i.warning.posted) f("WARNING_NOT_SENT");
  if (!i.scope) f("SCOPE_REQUIRED");
  else if (i.scope === "SECTION" && !i.section?.known) f("SECTION_REQUIRED");
  const rate = i.scope === "SECTION" ? (i.section?.rate ?? null) : i.wholeRate;
  if (i.scope && rate == null) f("LAD_RATE_NOT_SET");
  if (!i.eotClause.trim()) f("CLAUSE_REQUIRED", { which: "eot" });
  if (!i.ladClause.trim()) f("CLAUSE_REQUIRED", { which: "lad" });
  if (!i.insuranceExpiry) f("INSURANCE_EXPIRY_REQUIRED");
  if (!i.expectedCompletion) f("EXPECTED_COMPLETION_REQUIRED");
  else if (i.insuranceExpiry && i.insuranceExpiry < i.expectedCompletion) f("INSURANCE_NOT_EXTENDED", { expiry: i.insuranceExpiry, expected: i.expectedCompletion });
  if (!i.windowFrom) f("WINDOW_FROM_REQUIRED");
  else if (i.dateForCompletion && i.windowFrom <= i.dateForCompletion) f("WINDOW_BEFORE_COMPLETION", { day: i.dateForCompletion });
  if (i.windowFrom && i.windowUntil && i.windowUntil <= i.windowFrom) f("WINDOW_ENDS_BEFORE_START");
  if (i.windowUntil && i.windowUntil > i.today) f("FUTURE_DATE", { day: i.windowUntil });
  for (const item of PACK_ITEMS) {
    const a = i.pack.find((p) => p.item === item);
    if (!a || !a.text.trim()) f(a?.notRequired ? "PACK_NOT_REQUIRED_REASON" : "PACK_ITEM_REQUIRED", { item });
  }
  if (!i.formSet) f("FORM_NOT_SET", { form: "nonCompletion" });
  return out;
}

// ------------------------------------------------------------------ one live decision (code review run 2, item 6)

export interface DecisionRow {
  id: string;
  replacesId: string | null;
  /// Its Certificate of Non-Completion's status, or null where the decision opened none (excusable or pending).
  certificateStatus: string | null;
}

/// The decision in force: the latest one no later decision replaced, whose certificate (if it has one) is not void.
/// Rows oldest first.
export function liveDecision<T extends DecisionRow>(rows: readonly T[]): T | null {
  const replaced = new Set(rows.map((r) => r.replacesId).filter((x): x is string => !!x));
  return [...rows].reverse().find((r) => !replaced.has(r.id) && r.certificateStatus !== "VOID") ?? null;
}

/// A further decision: only as an explicit replacement of the live one, with its reason, and never while the live
/// one's Certificate of Non-Completion is still open (not issued, not void).
export function replacementFaults(i: { live: DecisionRow | null; replacesId: string | null; reason: string }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.live) {
    if (i.replacesId) f("REPLACES_NOT_LIVE");
    return out;
  }
  if (i.live.certificateStatus != null && i.live.certificateStatus !== "ISSUED" && i.live.certificateStatus !== "VOID") f("EARLIER_CNC_OPEN");
  if (!i.replacesId) f("DECISION_ALREADY_LIVE");
  else if (i.replacesId !== i.live.id) f("REPLACES_NOT_LIVE");
  else if (!i.reason.trim()) f("REPLACE_REASON_REQUIRED");
  return out;
}
