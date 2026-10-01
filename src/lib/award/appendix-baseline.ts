/**
 * The award against its tender (6.4 Q-1 B, carried as 64-C4; a flagged step of 6.11).
 *
 * Where the exercise's approved tender pack froze an Appendix to the Conditions of
 * Contract, that Appendix is the contract baseline (FR-DOC-004): the award opens with its
 * terms pre-filled from it, and any term the award states differently needs a reason,
 * which is audited and shown as "differs from the tender Appendix". Issue is refused while
 * a difference has no reason. The exercise's regulated-activity answer, as frozen with the
 * pack, joins the same rule ("differs from the tender").
 *
 * Which terms are compared is decided by what both records hold (BD-64-40):
 * - liquidated damages: the Appendix's amount a day, or its percentage a day resolved
 *   against the **awarded** sum (Q-6), never the exercise's value or the estimate. The
 *   award states it as an amount and the unit "per day".
 * - defects liability: the Appendix's months, or none (stated on the award as 0 months).
 * - the regulated activity: the exercise's answer as frozen at submission.
 * - insurance: the Appendix's minimums, uplift and excess are carried, not restated: the
 *   award has no columns of its own for them, so they cannot differ. The works uplift
 *   resolved against the awarded sum is what a works policy must cover beyond the price.
 * - the performance bond: the Appendix states none (D4: decided per contract), so there
 *   is no baseline to compare it with.
 *
 * An exercise with no frozen Appendix (Phase 1's, or one whose pack was never approved)
 * has no baseline: everything here returns null or nothing, and the award behaves exactly
 * as before. Pure: money is sen, percentages exact decimal strings, rounded once, half up
 * to the sen, where the figure is stated.
 */

import type { Sen } from "@/lib/money";
import { ladDaily, worksInsuredSum, type AppendixFacts } from "@/lib/tender-docs/appendix";

import type { Finding } from "./types";

/// The award's word for a daily rate: the key the letter's merge reads (`fields.ts`).
export const LAD_PER_DAY = "per day";

/// The terms compared, in the order the screens list them.
export const BASELINE_FIELDS = ["lad", "dlp", "regulated"] as const;
export type BaselineField = (typeof BASELINE_FIELDS)[number];

export const BASELINE_FIELD_LABEL: Record<BaselineField, string> = {
  lad: "Liquidated damages",
  dlp: "Defects liability period",
  regulated: "The regulated activity",
};

/// The award's column that keeps each field's reason.
export const REASON_COLUMN = { lad: "ladDiffersReason", dlp: "dlpDiffersReason", regulated: "regulatedDiffersReason" } as const satisfies Record<BaselineField, string>;

/// The approved pack's frozen record, as the award reads it.
export interface FrozenTender {
  packVersion: number;
  /// The day the pack froze, for the screen.
  frozenOn: string | null;
  /// The Appendix as frozen with the pack.
  appendix: Pick<AppendixFacts, "ladKind" | "ladAmount" | "ladPct" | "dlpApplies" | "dlpMonths" | "tplMinimum" | "wcMinimum" | "worksInsuranceUpliftKind" | "worksInsuranceUpliftAmount" | "worksInsuranceUpliftPct" | "insuranceExcess" | "sectionalCompletion">;
  /// The exercise's regulated-activity answer as the pack froze it. Null: not answered, or
  /// frozen before the answer was recorded with the pack (never read from the live exercise).
  regulated: boolean | null;
}

export type LadBaseline = { kind: "AMOUNT"; sen: Sen } | { kind: "PERCENT"; pct: string; sen: Sen };
export type DlpBaseline = { applies: true; months: number } | { applies: false };

export interface Baseline {
  packVersion: number;
  frozenOn: string | null;
  lad: LadBaseline | null;
  dlp: DlpBaseline | null;
  regulated: boolean | null;
  insurance: {
    tplMinimum: Sen | null;
    wcMinimum: Sen | null;
    insuranceExcess: Sen | null;
    /// What a works policy must cover beyond the awarded sum: the uplift, resolved.
    worksUplift: { kind: "AMOUNT"; sen: Sen } | { kind: "PERCENT"; pct: string; sen: Sen } | null;
  };
  /// Sectional completion carries its own damages per section, which the award's single
  /// figure cannot state: they stay the Appendix's.
  sectional: boolean;
}

/**
 * The baseline for an award of `awardedValue`. A percentage is resolved here, against the
 * awarded sum, half up to the sen (§8.6: 0.025% of RM1,077,508.60 is RM269.38).
 */
export function baselineOf(t: FrozenTender, awardedValue: Sen): Baseline {
  const a = t.appendix;
  const lad = ladDaily(a, awardedValue);
  const insured = worksInsuredSum(awardedValue, { kind: a.worksInsuranceUpliftKind, amount: a.worksInsuranceUpliftAmount, pct: a.worksInsuranceUpliftPct });
  return {
    packVersion: t.packVersion,
    frozenOn: t.frozenOn,
    lad: lad.kind === "AMOUNT" ? { kind: "AMOUNT", sen: lad.sen } : lad.kind === "PERCENT" && lad.sen != null ? { kind: "PERCENT", pct: lad.pct, sen: lad.sen } : null,
    dlp: a.dlpApplies === true && a.dlpMonths != null ? { applies: true, months: a.dlpMonths } : a.dlpApplies === false ? { applies: false } : null,
    regulated: t.regulated,
    insurance: {
      tplMinimum: a.tplMinimum,
      wcMinimum: a.wcMinimum,
      insuranceExcess: a.insuranceExcess,
      worksUplift: insured === "NOT_SET" ? null : a.worksInsuranceUpliftKind === "PERCENT" ? { kind: "PERCENT", pct: a.worksInsuranceUpliftPct!, sen: insured - awardedValue } : { kind: "AMOUNT", sen: insured - awardedValue },
    },
    sectional: a.sectionalCompletion === true,
  };
}

/// The award's terms the baseline is compared with.
export interface AwardTerms {
  ladAmount: Sen | null;
  ladUnit: string;
  dlpMonths: number | null;
  regulatedActivity: boolean | null;
}

/// The months a DLP baseline states: none is 0.
const dlpMonthsOf = (d: DlpBaseline) => (d.applies ? d.months : 0);

/**
 * What the award is opened with: each term the baseline states. A term it does not state
 * is left out, so the award's own "not set" stands.
 */
export function prefill(b: Baseline): Partial<AwardTerms> {
  return {
    ...(b.lad ? { ladAmount: b.lad.sen, ladUnit: LAD_PER_DAY } : {}),
    ...(b.dlp ? { dlpMonths: dlpMonthsOf(b.dlp) } : {}),
    ...(b.regulated != null ? { regulatedActivity: b.regulated } : {}),
  };
}

/// Whether the award states the field as the baseline does; null where the baseline states nothing.
export function matchesBaseline(field: BaselineField, b: Baseline, v: AwardTerms): boolean | null {
  switch (field) {
    case "lad":
      return b.lad ? v.ladAmount === b.lad.sen && v.ladUnit.trim().toLowerCase() === LAD_PER_DAY : null;
    case "dlp":
      return b.dlp ? v.dlpMonths === dlpMonthsOf(b.dlp) : null;
    case "regulated":
      return b.regulated != null ? v.regulatedActivity === b.regulated : null;
  }
}

export type Reasons = Partial<Record<BaselineField, string | null>>;

export interface Difference {
  field: BaselineField;
  /// The reason recorded, trimmed; null where none is.
  reason: string | null;
}

/// Every field the award states differently from the baseline, with its reason if recorded.
export function differences(b: Baseline, v: AwardTerms, reasons: Reasons): Difference[] {
  return BASELINE_FIELDS.filter((f) => matchesBaseline(f, b, v) === false).map((field) => ({ field, reason: reasons[field]?.trim() || null }));
}

/// Each difference with no reason refuses issue, naming the term.
export function differenceFindings(diffs: readonly Difference[]): Finding[] {
  return diffs.filter((d) => !d.reason).map((d) => ({ code: "APPENDIX_DIFFERENCE_UNEXPLAINED", level: "block" as const, data: { field: d.field } }));
}

/**
 * The reasons a save of the terms writes, and the fields still needing one. For each field
 * the save carried: where it now matches the baseline its reason is cleared (nothing
 * differs); where it differs, the reason given is kept, or the one stored if none was
 * given; with neither, the field is named as missing and the save is refused. A field the
 * save did not carry keeps its stored reason.
 */
export function reasonsOnSave(b: Baseline, after: AwardTerms, carried: ReadonlySet<BaselineField>, given: Reasons, stored: Reasons): { reasons: Record<BaselineField, string | null>; missing: BaselineField[] } {
  const reasons = {} as Record<BaselineField, string | null>;
  const missing: BaselineField[] = [];
  for (const f of BASELINE_FIELDS) {
    const kept = stored[f]?.trim() || null;
    const m = matchesBaseline(f, b, after);
    if (!carried.has(f) || m == null) {
      reasons[f] = kept;
      continue;
    }
    if (m) {
      reasons[f] = null;
      continue;
    }
    reasons[f] = given[f]?.trim() || kept;
    if (!reasons[f]) missing.push(f);
  }
  return { reasons, missing };
}

/**
 * The damages a draft's new value brings. A percentage is resolved against the awarded
 * sum, so where the award still stated the figure resolved against its old value (it had
 * not been changed from the tender), it follows the new value. A figure the officer
 * changed, with its reason, is left as they stated it. Null: nothing to change.
 */
export function ladOnValueChange(t: FrozenTender, before: Sen, after: Sen, v: AwardTerms): Sen | null {
  const old = baselineOf(t, before);
  const next = baselineOf(t, after);
  if (old.lad?.kind !== "PERCENT" || next.lad?.kind !== "PERCENT") return null;
  if (matchesBaseline("lad", old, v) !== true) return null;
  return next.lad.sen === old.lad.sen ? null : next.lad.sen;
}

/**
 * A policy covering the works (works, or contractors' or erection all risks in its place)
 * states "the amount stated in the appendix" it must cover beyond the price. Where the
 * tender froze an Appendix, that amount is the Appendix's uplift resolved against the
 * awarded sum: left blank it is taken from there; another figure is refused, because it
 * would misstate the Appendix and move the sum the policy is checked against. Elsewhere
 * the entered figure stands, as before.
 */
export function worksAppendixAmount(coversWorks: boolean, entered: Sen | null, b: Baseline | null): { amount: Sen | null } | { fault: "DIFFERS_FROM_APPENDIX"; appendix: Sen } {
  const uplift = coversWorks ? b?.insurance.worksUplift : null;
  if (!uplift) return { amount: entered };
  if (entered == null) return { amount: uplift.sen };
  return entered === uplift.sen ? { amount: entered } : { fault: "DIFFERS_FROM_APPENDIX", appendix: uplift.sen };
}

/// What the issue snapshot keeps of the comparison: the baseline in words and figures, and each difference with its reason.
export function baselineSnapshot(b: Baseline, diffs: readonly Difference[]) {
  const sen = (x: Sen | null) => (x == null ? null : x.toString());
  return {
    packVersion: b.packVersion,
    frozenOn: b.frozenOn,
    lad: b.lad ? { kind: b.lad.kind, sen: sen(b.lad.sen), pct: b.lad.kind === "PERCENT" ? b.lad.pct : null } : null,
    dlp: b.dlp ? { applies: b.dlp.applies, months: b.dlp.applies ? b.dlp.months : null } : null,
    regulated: b.regulated,
    differences: diffs.map((d) => ({ field: BASELINE_FIELD_LABEL[d.field], reason: d.reason })),
  };
}
