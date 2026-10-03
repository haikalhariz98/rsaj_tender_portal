/**
 * The award's own insurance terms against the tender Appendix's minimums (carry 64-C4-b, ruled at 6.13
 * planning; a flagged step of 6.11).
 *
 * The Letter of Acceptance may state a sum insured for each kind of policy the contract carries: the works
 * (a CAR or EAR policy accepted for the works counts as works), public liability and workmen's compensation.
 * Which figure governs a kind, in ADR 0021's precedence (the award over the Appendix):
 * - the award states one: it governs, even below the Appendix's minimum; then both figures are shown;
 * - the award states none: the frozen tender Appendix's minimum governs, shown with its source "Appendix"
 *   (the works: the awarded sum plus the Appendix's uplift, resolved half up; public liability: the
 *   third-party minimum; workmen's compensation: its minimum);
 * - neither states one: nothing governs and nothing is compared, said so, never read as 0.
 *
 * The readiness gate (FR-CON-008) compares each verified policy's sum insured with the governing figure of
 * its kind: a shortfall blocks signing. Pure: money is sen, the Appendix as frozen with the approved pack.
 */

import type { Sen } from "@/lib/money";
import { countsAs, type InsuranceKind } from "@/lib/securities/insurance";

import type { Baseline } from "./appendix-baseline";

/// The kinds the award states a sum insured for, in the order the screens list them.
export const INSURED_KINDS = ["WORKS", "PUBLIC_LIABILITY", "WORKMENS_COMPENSATION"] as const;
export type InsuredKind = (typeof INSURED_KINDS)[number];

/// The award's column for each kind.
export const SUM_COLUMN = { WORKS: "worksSumInsured", PUBLIC_LIABILITY: "liabilitySumInsured", WORKMENS_COMPENSATION: "wcSumInsured" } as const satisfies Record<InsuredKind, string>;

export type AwardSums = Readonly<Record<InsuredKind, Sen | null>>;

export type Governing =
  /// The award's figure; `appendix` is the Appendix's minimum beside it (null: the Appendix states none).
  | { state: "AWARD"; sen: Sen; appendix: Sen | null; belowAppendix: boolean }
  | { state: "APPENDIX"; sen: Sen }
  | { state: "NOT_STATED" };

/// The Appendix's minimum for a kind; null where it states none (or no Appendix was frozen).
export function appendixMinimum(kind: InsuredKind, b: Baseline | null, awardedValue: Sen): Sen | null {
  if (!b) return null;
  switch (kind) {
    case "WORKS":
      return b.insurance.worksUplift ? awardedValue + b.insurance.worksUplift.sen : null;
    case "PUBLIC_LIABILITY":
      return b.insurance.tplMinimum;
    case "WORKMENS_COMPENSATION":
      return b.insurance.wcMinimum;
  }
}

/// The figure that governs one kind.
export function governingSum(kind: InsuredKind, award: Sen | null, b: Baseline | null, awardedValue: Sen): Governing {
  const a = appendixMinimum(kind, b, awardedValue);
  if (award != null) return { state: "AWARD", sen: award, appendix: a, belowAppendix: a != null && award < a };
  if (a != null) return { state: "APPENDIX", sen: a };
  return { state: "NOT_STATED" };
}

export const governingSums = (award: AwardSums, b: Baseline | null, awardedValue: Sen): Record<InsuredKind, Governing> =>
  Object.fromEntries(INSURED_KINDS.map((k) => [k, governingSum(k, award[k], b, awardedValue)])) as Record<InsuredKind, Governing>;

export const isInsuredKind = (k: string): k is InsuredKind => (INSURED_KINDS as readonly string[]).includes(k);

export interface PolicySum {
  kind: InsuranceKind;
  substitutesFor: InsuranceKind | null;
  status: string;
  sumInsured: Sen;
}

export type SumFinding =
  /// A verified policy of the kind is below the governing figure (blocks).
  | { kind: InsuredKind; state: "SHORT"; governing: Governing & { sen: Sen }; insured: Sen }
  /// Nothing states a figure for a required kind: not compared (does not block).
  | { kind: InsuredKind; state: "NOT_STATED" };

/**
 * Each required kind's comparison, in order. A kind is judged on its best verified policy (one that counts
 * as it); a kind with no verified policy is the gate's "not verified", not a shortfall. Only required kinds
 * are compared.
 */
export function sumFindings(required: readonly InsuranceKind[], gov: Readonly<Record<InsuredKind, Governing>>, policies: readonly PolicySum[]): SumFinding[] {
  const out: SumFinding[] = [];
  for (const kind of INSURED_KINDS) {
    if (!required.includes(kind)) continue;
    const g = gov[kind];
    if (g.state === "NOT_STATED") {
      out.push({ kind, state: "NOT_STATED" });
      continue;
    }
    const verified = policies.filter((p) => p.status === "VERIFIED" && countsAs(p) === kind);
    if (verified.length === 0) continue;
    const best = verified.reduce((m, p) => (p.sumInsured > m ? p.sumInsured : m), verified[0].sumInsured);
    if (best < g.sen) out.push({ kind, state: "SHORT", governing: g, insured: best });
  }
  return out;
}
