/**
 * The insurance register (FR-AWD-013, §8.10).
 *
 * Which policies a contract must carry is the customer's list: a requirement row for a
 * contract type takes the place of the general row of the same kind (the design-and-
 * build tail is simply such a row). A CAR or EAR policy may stand in for the works
 * policy. Workmen's compensation is set on a basis chosen per award, never defaulted
 * (D4). Pure: the register and the award are read in, faults come out.
 */

import type { Sen } from "@/lib/money";

import { issuerApproved, type Issuer } from "./bond";
import { liabilityLimit, limitFault, type LiabilityBand } from "./liability";
import { pctOfSen } from "./money";
import { requiredInsuranceEnd, type Day, type PeriodUnit } from "./period";

export type InsuranceKind = "WORKS" | "PUBLIC_LIABILITY" | "WORKMENS_COMPENSATION" | "CAR" | "EAR";
export type WcBasis = "UNCOVERED_WAGES" | "PERCENT_OF_CONTRACT";

export interface Requirement {
  code: string;
  nameEn: string;
  kind: InsuranceKind;
  contractTypeCode: string | null;
  required: boolean;
  percent: string | null;
  tailMonths: number | null;
  tailDays: number | null;
  retiredOn?: Date | null;
}

/// The requirements that apply to a contract type: its own rows, and the general rows
/// of every kind it has no row for. Not-required rows are dropped.
export function applicableRequirements(reqs: readonly Requirement[], contractTypeCode: string | null, on?: Date): Requirement[] {
  const live = reqs.filter((r) => r.retiredOn == null || (on != null && r.retiredOn > on));
  const own = live.filter((r) => r.contractTypeCode != null && r.contractTypeCode === contractTypeCode);
  const general = live.filter((r) => r.contractTypeCode == null && !own.some((o) => o.kind === r.kind));
  return [...own, ...general].filter((r) => r.required);
}

/// The kind a policy counts as: a CAR or EAR policy accepted for the works policy counts as works.
export const countsAs = (p: { kind: InsuranceKind; substitutesFor: InsuranceKind | null }): InsuranceKind =>
  (p.kind === "CAR" || p.kind === "EAR") && p.substitutesFor === "WORKS" ? "WORKS" : p.kind;

export type InsuranceFault =
  | "ISSUER_NOT_APPROVED"
  | "BAD_SUBSTITUTION"
  | "SUM_BELOW_REQUIRED"
  | "LIMIT_NOT_SET"
  | "NO_BAND"
  | "AMBIGUOUS_BAND"
  | "LIMIT_LOWERED"
  | "LIMIT_JUSTIFICATION_REQUIRED"
  | "BELOW_LIMIT"
  | "WC_BASIS_NOT_SET"
  | "WC_PERCENT_NOT_SET"
  | "PERIOD_NOT_SET"
  | "PERIOD_TOO_SHORT";

export interface PolicyInput {
  kind: InsuranceKind;
  substitutesFor: InsuranceKind | null;
  issuerId: string | null;
  lodgedOn: Day;
  sumInsured: Sen;
  appendixAmount: Sen | null;
  requiredLimit: Sen | null;
  raisedJustification: string;
  periodEnd: Day;
}

export interface PolicyContext {
  requirement: Requirement | null;
  contractPrice: Sen;
  bands: readonly LiabilityBand[];
  wcBasis: WcBasis | null;
  issuers: readonly Issuer[];
  start: Day | null;
  completion: { n: number; unit: PeriodUnit };
  dlpMonths: number | null;
}

export function insuranceFaults(p: PolicyInput, c: PolicyContext): InsuranceFault[] {
  const out: InsuranceFault[] = [];
  if (!issuerApproved(p.issuerId, c.issuers, p.lodgedOn)) out.push("ISSUER_NOT_APPROVED");
  if (p.substitutesFor != null && !((p.kind === "CAR" || p.kind === "EAR") && p.substitutesFor === "WORKS")) out.push("BAD_SUBSTITUTION");
  const as = countsAs(p);
  if (as === "WORKS" || p.kind === "CAR" || p.kind === "EAR") {
    // The full contract price plus any amount stated in the appendix.
    if (p.sumInsured < c.contractPrice + (p.appendixAmount ?? 0n)) out.push("SUM_BELOW_REQUIRED");
  }
  if (as === "PUBLIC_LIABILITY") {
    const l = liabilityLimit(c.bands, c.contractPrice);
    if (l.state === "NOT_SET") out.push("LIMIT_NOT_SET");
    else if (l.state === "NO_BAND") out.push("NO_BAND");
    else if (l.state === "AMBIGUOUS") out.push("AMBIGUOUS_BAND");
    else {
      const chosen = p.requiredLimit ?? l.limit;
      const f = limitFault(l.limit, chosen, p.raisedJustification);
      if (f === "LOWERED") out.push("LIMIT_LOWERED");
      else if (f === "JUSTIFICATION_REQUIRED") out.push("LIMIT_JUSTIFICATION_REQUIRED");
      else if (p.sumInsured < chosen) out.push("BELOW_LIMIT");
    }
  }
  if (as === "WORKMENS_COMPENSATION") {
    if (!c.wcBasis) out.push("WC_BASIS_NOT_SET");
    else if (c.wcBasis === "PERCENT_OF_CONTRACT") {
      if (!c.requirement?.percent) out.push("WC_PERCENT_NOT_SET");
      else if (p.sumInsured < pctOfSen(c.contractPrice, c.requirement.percent)) out.push("SUM_BELOW_REQUIRED");
    }
  }
  const end = requiredInsuranceEnd(c.start, c.completion, c.dlpMonths, c.requirement ? { months: c.requirement.tailMonths, days: c.requirement.tailDays } : null);
  if (end.state === "NOT_SET") out.push("PERIOD_NOT_SET");
  else if (p.periodEnd < end.day) out.push("PERIOD_TOO_SHORT");
  return out;
}

/// The public-liability limit a policy must meet, as the register shows it.
export function derivedLimit(bands: readonly LiabilityBand[], price: Sen) {
  return liabilityLimit(bands, price);
}
