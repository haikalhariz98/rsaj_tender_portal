/**
 * The award's own insurance terms against the tender Appendix's minimums (carry 64-C4-b, ruled at 6.13
 * planning; a flagged step of 6.11).
 *
 * The Letter of Acceptance may state a sum insured for each kind of policy the contract carries: the works
 * (a CAR or EAR policy accepted for the works counts as works), public liability and workmen's compensation.
 * Which figure governs a kind, in ADR 0021's precedence (the award over the Appendix):
 * - the award states one: it governs, even below the Appendix's minimum; then both figures are shown, and a
 *   figure other than the one the Appendix governs, above or below, needs its reason before issue (6.13 Part A
 *   ruling on BD-613-2, through 64-C4's difference path in appendix-baseline.ts);
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

import { appendixInsured, type Baseline, type SumField } from "./appendix-baseline";

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

/// The baseline field that carries each kind's Appendix figure.
const FIELD_OF = { WORKS: "worksInsured", PUBLIC_LIABILITY: "liabilityInsured", WORKMENS_COMPENSATION: "wcInsured" } as const satisfies Record<InsuredKind, SumField>;

/**
 * The Appendix's minimum for a kind; null where it states none (or no Appendix was frozen). One derivation (6.13A
 * residual): the figure `appendixInsured` reads from the baseline, whose works figure `baselineOf` derived once
 * (the awarded sum plus the uplift, `worksInsuredSum`) against the awarded sum it was built for.
 */
export function appendixMinimum(kind: InsuredKind, b: Baseline | null): Sen | null {
  return b ? appendixInsured(FIELD_OF[kind], b) : null;
}

/// The figure that governs one kind.
export function governingSum(kind: InsuredKind, award: Sen | null, b: Baseline | null): Governing {
  const a = appendixMinimum(kind, b);
  if (award != null) return { state: "AWARD", sen: award, appendix: a, belowAppendix: a != null && award < a };
  if (a != null) return { state: "APPENDIX", sen: a };
  return { state: "NOT_STATED" };
}

export const governingSums = (award: AwardSums, b: Baseline | null): Record<InsuredKind, Governing> =>
  Object.fromEntries(INSURED_KINDS.map((k) => [k, governingSum(k, award[k], b)])) as Record<InsuredKind, Governing>;

export const isInsuredKind = (k: string): k is InsuredKind => (INSURED_KINDS as readonly string[]).includes(k);

export interface PolicySum {
  kind: InsuranceKind;
  substitutesFor: InsuranceKind | null;
  status: string;
  sumInsured: Sen;
}

export type SumFinding =
  /// A verified policy of the kind is below the governing figure (blocks).
  | { kind: InsuranceKind; state: "SHORT"; governing: Governing & { sen: Sen }; insured: Sen }
  /// Nothing states a figure for a required kind: not compared (does not block).
  | { kind: InsuranceKind; state: "NOT_STATED" };

/**
 * The figure a required kind is judged against (review 13): its own, or for a contractor's or erection all risks
 * policy required in its own right, the works' figure (it insures the works). Never skipped.
 */
export const governedAs = (kind: InsuranceKind): InsuredKind => (isInsuredKind(kind) ? kind : "WORKS");

/// The required kinds in the order judged: the award's three, then any all-risks policy required in its own right.
const JUDGED_ORDER: readonly InsuranceKind[] = [...INSURED_KINDS, "CAR", "EAR"];

/**
 * Each required kind's comparison, in order. A kind is judged on its best verified policy (one that counts
 * as it); a kind with no verified policy is the gate's "not verified", not a shortfall. Only required kinds
 * are compared, and every required kind is: a CAR or EAR policy required in its own right is compared with the
 * works' governing figure, or said not compared (review 13).
 */
export function sumFindings(required: readonly InsuranceKind[], gov: Readonly<Record<InsuredKind, Governing>>, policies: readonly PolicySum[]): SumFinding[] {
  const out: SumFinding[] = [];
  for (const kind of JUDGED_ORDER) {
    if (!required.includes(kind)) continue;
    const g = gov[governedAs(kind)];
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
