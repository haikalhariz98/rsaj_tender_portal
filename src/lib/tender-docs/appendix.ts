/**
 * The Appendix to the Conditions of Contract (FR-DOC-004; SK001 7.3.4(b); spec §8.3,
 * §8.6, §8.10): what it must hold before the pack goes for approval, and the figures
 * that follow from it.
 *
 * Every field is three-state. Unset is "Not set" and blocks submission naming the field;
 * it is never a zero or a default. Money is sen (bigint); percentages are decimal strings
 * read exactly (`percent.ts`). Each figure is rounded once, half up to the sen, where it
 * is stated. Pure: nothing here reads a clock, a database or configuration it is not given.
 *
 * Q-6: LAD is stated as an amount a day or as a percentage of the contract sum a day.
 * A percentage is resolved against the awarded sum at award, never against the exercise's
 * value or the company estimate (that would publish a SULIT figure, 6.2 OD-8).
 */

import type { Sen } from "@/lib/money";
import { addPeriod, type Day } from "@/lib/securities/period";

import { isPct, parsePct, PCT_COLUMN, pctOf, type PctColumn } from "./percent";
import type { AppendixStatus, Finding, LadKind, UpliftKind } from "./types";

export interface AppendixSectionFacts {
  description: string;
  ladKind: LadKind | null;
  ladAmount: Sen | null;
  ladPct: string | null;
}

export interface VariationLimitFacts {
  /// The office's or committee's name as it stood.
  label: string;
  roleCode: string | null;
  committeeCode: string | null;
  limit: Sen | null;
}

export interface AppendixFacts {
  status: AppendixStatus;
  ladOfficerRoleCode: string | null;
  eotOfficerRoleCode: string | null;
  terminationOfficerRoleCode: string | null;
  warRiskOfficerRoleCode: string | null;
  arbitrationOfficerRoleCode: string | null;
  variationLimits: readonly VariationLimitFacts[];
  pcSumWorksApply: boolean | null;
  pcSumWorksText: string;
  tplMinimum: Sen | null;
  wcMinimum: Sen | null;
  worksInsuranceUpliftKind: UpliftKind | null;
  worksInsuranceUpliftAmount: Sen | null;
  worksInsuranceUpliftPct: string | null;
  insuranceExcess: Sen | null;
  ladKind: LadKind | null;
  ladAmount: Sen | null;
  ladPct: string | null;
  sectionalCompletion: boolean | null;
  sections: readonly AppendixSectionFacts[];
  dlpApplies: boolean | null;
  dlpMonths: number | null;
  firstInterimMinimum: Sen | null;
  subsequentInterimMinimum: Sen | null;
  honourCertificateDays: number | null;
}

/// An Appendix with nothing entered: every field not set.
export const EMPTY_APPENDIX: AppendixFacts = {
  status: "DRAFT",
  ladOfficerRoleCode: null,
  eotOfficerRoleCode: null,
  terminationOfficerRoleCode: null,
  warRiskOfficerRoleCode: null,
  arbitrationOfficerRoleCode: null,
  variationLimits: [],
  pcSumWorksApply: null,
  pcSumWorksText: "",
  tplMinimum: null,
  wcMinimum: null,
  worksInsuranceUpliftKind: null,
  worksInsuranceUpliftAmount: null,
  worksInsuranceUpliftPct: null,
  insuranceExcess: null,
  ladKind: null,
  ladAmount: null,
  ladPct: null,
  sectionalCompletion: null,
  sections: [],
  dlpApplies: null,
  dlpMonths: null,
  firstInterimMinimum: null,
  subsequentInterimMinimum: null,
  honourCertificateDays: null,
};

/// The Appendix's fields, as the form and the findings name them.
export const APPENDIX_FIELD_LABEL = {
  ladOfficerRoleCode: "Officer empowered on damages for non-completion",
  eotOfficerRoleCode: "Officer empowered on delay and extension of time",
  terminationOfficerRoleCode: "Officer empowered on termination",
  warRiskOfficerRoleCode: "Officer empowered on war or earthquake",
  arbitrationOfficerRoleCode: "Officer empowered on arbitration",
  variationLimits: "Variation limits",
  pcSumWorksApply: "Work in prime cost sums the contractor may tender for",
  pcSumWorksText: "Which prime cost sum work the contractor may tender for",
  tplMinimum: "Minimum third-party liability insurance",
  wcMinimum: "Minimum workmen's compensation insurance",
  worksInsuranceUpliftKind: "Uplift to the contract sum for works insurance",
  worksInsuranceUpliftAmount: "Works insurance uplift amount",
  worksInsuranceUpliftPct: "Works insurance uplift percentage",
  insuranceExcess: "Permitted insurance excess",
  ladKind: "How liquidated damages are stated",
  ladAmount: "Liquidated damages a day",
  ladPct: "Liquidated damages, percentage of the contract sum a day",
  sectionalCompletion: "Sectional completion",
  sections: "Sections and their liquidated damages",
  dlpApplies: "Defects liability period",
  dlpMonths: "Defects liability period, months",
  firstInterimMinimum: "Minimum value of work for the first interim certificate",
  subsequentInterimMinimum: "Minimum value of work for later interim certificates",
  honourCertificateDays: "Days to honour an interim certificate",
} as const;
export type AppendixField = keyof typeof APPENDIX_FIELD_LABEL;

export type AppendixFault =
  | "FIELD_NOT_SET"
  | "FIELD_NOT_VALID"
  | "PC_SUM_TEXT_REQUIRED"
  | "SECTIONS_REQUIRED"
  | "SECTIONS_NOT_EXPECTED"
  | "SECTION_LAD_NOT_SET"
  | "VARIATION_LIMIT_NOT_SET"
  | "DLP_MONTHS_NOT_EXPECTED";

const notSet = (field: AppendixField): Finding<AppendixFault> => ({ code: "FIELD_NOT_SET", level: "block", data: { field: APPENDIX_FIELD_LABEL[field] } });
const notValid = (field: AppendixField): Finding<AppendixFault> => ({ code: "FIELD_NOT_VALID", level: "block", data: { field: APPENDIX_FIELD_LABEL[field] } });

/// LAD, or a section's: the kind, and the value of that kind. Unset either way blocks; a
/// percentage must fit the column it is kept in.
function ladFaults(kind: LadKind | null, amount: Sen | null, pct: string | null, column: PctColumn): "KIND" | "VALUE" | "PCT_INVALID" | null {
  if (kind == null) return "KIND";
  if (kind === "AMOUNT_PER_DAY") return amount == null ? "VALUE" : null;
  if (pct == null) return "VALUE";
  return isPct(pct, column) ? null : "PCT_INVALID";
}

/**
 * Every field the Appendix still needs, each named. Shown while it is being entered, and
 * refused at submission: the Appendix cannot be left incomplete when the documents go
 * (FR-DOC-004). Whether the contract type allows a DLP or prime cost sums is
 * `behaviourFaults`' to say; this says only what is entered and what is not.
 */
export function appendixFaults(a: AppendixFacts): Finding<AppendixFault>[] {
  const out: Finding<AppendixFault>[] = [];
  for (const f of ["ladOfficerRoleCode", "eotOfficerRoleCode", "terminationOfficerRoleCode", "warRiskOfficerRoleCode", "arbitrationOfficerRoleCode"] as const) if (!a[f]) out.push(notSet(f));
  if (a.variationLimits.length === 0) out.push(notSet("variationLimits"));
  for (const v of a.variationLimits) if (v.limit == null) out.push({ code: "VARIATION_LIMIT_NOT_SET", level: "block", data: { holder: v.label } });
  if (a.pcSumWorksApply == null) out.push(notSet("pcSumWorksApply"));
  else if (a.pcSumWorksApply && !a.pcSumWorksText.trim()) out.push({ code: "PC_SUM_TEXT_REQUIRED", level: "block" });
  if (a.tplMinimum == null) out.push(notSet("tplMinimum"));
  if (a.wcMinimum == null) out.push(notSet("wcMinimum"));
  if (a.worksInsuranceUpliftKind == null) out.push(notSet("worksInsuranceUpliftKind"));
  else if (a.worksInsuranceUpliftKind === "AMOUNT" && a.worksInsuranceUpliftAmount == null) out.push(notSet("worksInsuranceUpliftAmount"));
  else if (a.worksInsuranceUpliftKind === "PERCENT") {
    if (a.worksInsuranceUpliftPct == null) out.push(notSet("worksInsuranceUpliftPct"));
    else if (!isPct(a.worksInsuranceUpliftPct, PCT_COLUMN.worksInsuranceUpliftPct)) out.push(notValid("worksInsuranceUpliftPct"));
  }
  if (a.insuranceExcess == null) out.push(notSet("insuranceExcess"));
  const lad = ladFaults(a.ladKind, a.ladAmount, a.ladPct, PCT_COLUMN.ladPct);
  if (lad === "KIND") out.push(notSet("ladKind"));
  else if (lad === "VALUE") out.push(notSet(a.ladKind === "AMOUNT_PER_DAY" ? "ladAmount" : "ladPct"));
  else if (lad === "PCT_INVALID") out.push(notValid("ladPct"));
  if (a.sectionalCompletion == null) out.push(notSet("sectionalCompletion"));
  else if (a.sectionalCompletion && a.sections.length === 0) out.push({ code: "SECTIONS_REQUIRED", level: "block" });
  else if (!a.sectionalCompletion && a.sections.length > 0) out.push({ code: "SECTIONS_NOT_EXPECTED", level: "block" });
  if (a.sectionalCompletion) for (const s of a.sections) if (ladFaults(s.ladKind, s.ladAmount, s.ladPct, PCT_COLUMN.sectionLadPct)) out.push({ code: "SECTION_LAD_NOT_SET", level: "block", data: { section: s.description || "A section with no description" } });
  if (a.dlpApplies == null) out.push(notSet("dlpApplies"));
  else if (a.dlpApplies && a.dlpMonths == null) out.push(notSet("dlpMonths"));
  else if (!a.dlpApplies && a.dlpMonths != null) out.push({ code: "DLP_MONTHS_NOT_EXPECTED", level: "block" });
  if (a.firstInterimMinimum == null) out.push(notSet("firstInterimMinimum"));
  if (a.subsequentInterimMinimum == null) out.push(notSet("subsequentInterimMinimum"));
  if (a.honourCertificateDays == null) out.push(notSet("honourCertificateDays"));
  return out;
}

/// Complete: nothing blocks. The status column follows this on every save.
export const appendixComplete = (a: AppendixFacts) => appendixFaults(a).length === 0;

export type LadDaily =
  | { kind: "NOT_SET" }
  | { kind: "AMOUNT"; sen: Sen }
  /// `sen` null: the contract sum is not known yet, so the daily figure is fixed at award (Q-6).
  | { kind: "PERCENT"; pct: string; sen: Sen | null };

/**
 * The LAD a day. A percentage is resolved only against the contract sum (the awarded
 * sum, at award): given none, it says the figure is fixed at award, never a guess.
 * §8.6: 0.025% of RM1,077,508.60 is RM269.377…, stated as RM269.38 (half up to the sen).
 */
export function ladDaily(a: Pick<AppendixFacts, "ladKind" | "ladAmount" | "ladPct">, contractSum: Sen | null): LadDaily {
  if (a.ladKind === "AMOUNT_PER_DAY" && a.ladAmount != null) return { kind: "AMOUNT", sen: a.ladAmount };
  if (a.ladKind === "PERCENT_OF_SUM_PER_DAY" && a.ladPct != null && isPct(a.ladPct)) return { kind: "PERCENT", pct: a.ladPct, sen: contractSum == null ? null : pctOf(contractSum, a.ladPct) };
  return { kind: "NOT_SET" };
}

/**
 * The LAD a day the policy suggests, at its configured rate, against a contract sum. A
 * suggestion, labelled with the rate's provenance where shown; never written unasked.
 */
export function ladSuggestion(policyPct: string | null, contractSum: Sen | null): { pct: string; sen: Sen } | "NOT_SET" | "SUM_NOT_KNOWN" {
  if (policyPct == null || !isPct(policyPct)) return "NOT_SET";
  if (contractSum == null) return "SUM_NOT_KNOWN";
  return { pct: policyPct, sen: pctOf(contractSum, policyPct) };
}

/**
 * §8.3: the minimum value of work before the first interim certificate, as the policy
 * states it: the lesser of a floor and a percentage of the builders' works value.
 * RM293,473.70 at RM1,000.00 / 10%: 10% is RM29,347.37, so RM1,000.00.
 * RM8,500.00 at the same: 10% is RM850.00, below the floor, so RM850.00.
 * Either half of the policy unset: not set.
 */
export function firstInterimMinimum(buildersWorks: Sen, policy: { floor: Sen | null; pct: string | null }): Sen | "NOT_SET" {
  if (policy.floor == null || policy.pct == null || !isPct(policy.pct)) return "NOT_SET";
  const share = pctOf(buildersWorks, policy.pct);
  return share < policy.floor ? share : policy.floor;
}

/**
 * §8.10: the sum the works are insured for: the contract sum with the Appendix's uplift.
 * RM1,077,508.60 + 10% (RM107,750.86) = RM1,185,259.46.
 */
export function worksInsuredSum(contractSum: Sen, uplift: { kind: UpliftKind | null; amount: Sen | null; pct: string | null }): Sen | "NOT_SET" {
  if (uplift.kind === "AMOUNT" && uplift.amount != null) return contractSum + uplift.amount;
  if (uplift.kind === "PERCENT" && uplift.pct != null && isPct(uplift.pct)) return contractSum + pctOf(contractSum, uplift.pct);
  return "NOT_SET";
}

/// The policy's insurance tail beyond the defects liability period, for ordinary contracts
/// and for design and build. Each pair unset: not set.
export interface InsuranceTailPolicy {
  extraMonths: number | null;
  extraDays: number | null;
  dbExtraMonths: number | null;
  dbExtraDays: number | null;
}

/**
 * §8.10: the day the contractor's insurance runs to: from the start, through the
 * completion period and the defects liability period, and the policy's tail beyond it.
 * Months are summed and added once (clamped to the month's end), then days
 * (`securities/period.ts`), so two clamps never compound.
 * From 2027-01-04, 12 months' completion, 12 months' DLP, 3 months 14 days beyond: 2029-04-18.
 * `dlpMonths` null where no DLP applies (none is added). The tail unset: not set.
 */
export function insurancePeriodEnd(start: Day, completionMonths: number, dlpMonths: number | null, policy: InsuranceTailPolicy, designAndBuild: boolean): Day | "NOT_SET" {
  const months = designAndBuild ? policy.dbExtraMonths : policy.extraMonths;
  const days = designAndBuild ? policy.dbExtraDays : policy.extraDays;
  if (months == null || days == null) return "NOT_SET";
  return addPeriod(start, { months: completionMonths + (dlpMonths ?? 0) + months, days });
}

/**
 * The terms an award reads from the frozen Appendix (Q-1 B, for 6.11): it pre-fills from
 * these, and a difference needs a reason. Read only from a frozen (approved) pack's Appendix.
 */
export function awardTermsFrom(a: AppendixFacts) {
  return {
    ladKind: a.ladKind,
    ladAmount: a.ladAmount,
    ladPct: a.ladPct,
    dlpApplies: a.dlpApplies,
    dlpMonths: a.dlpMonths,
    worksInsuranceUplift: { kind: a.worksInsuranceUpliftKind, amount: a.worksInsuranceUpliftAmount, pct: a.worksInsuranceUpliftPct },
    tplMinimum: a.tplMinimum,
    wcMinimum: a.wcMinimum,
    insuranceExcess: a.insuranceExcess,
    firstInterimMinimum: a.firstInterimMinimum,
    subsequentInterimMinimum: a.subsequentInterimMinimum,
    honourCertificateDays: a.honourCertificateDays,
  };
}

/// Whether a percentage is above nothing ("0" and "0.000000" are not), read exactly.
export const pctAboveZero = (pct: string | null) => pct != null && isPct(pct) && parsePct(pct) > 0n;
