/**
 * The pre-signature readiness gate (FR-CON-008) as the award and its contract read it: one function, so
 * the award's Conditions tab and the contract's formation say the same (6.12). The instrument counts as
 * returned with its scans (OD-5; an accepted award is not re-judged); the bond and policies are read
 * from the contract's registers; a workmen's compensation policy on uncovered wages meets the gate only
 * once its check is recorded on the contract (BD-20 carry, recorded not judged).
 */

import { isLive } from "@/lib/documents/evidence";
import { senFromDecimal } from "@/lib/money";
import type { RequiredBond } from "@/lib/securities/bond";
import type { InsuranceKind, Requirement, WcBasis } from "@/lib/securities/insurance";

import type { Baseline } from "./appendix-baseline";
import { governingSums, type AwardSums } from "./insurance-terms";
import { readinessGate, wcCheckRecordedOn } from "./readiness";
import type { AwardRow } from "./repo";
import { returnRecordOf } from "./return-acceptance";
import { RETURN_SCANS, returnReadsComplete } from "./stage-two";
import type { InstrumentKind } from "./types";

/// What the gate reads of an award (6.12 review: the contracts list reads it for many contracts in one query).
type Money = Parameters<typeof senFromDecimal>[0];
export type ReadinessAward = Pick<AwardRow, "instrumentKind" | "status" | "bondRequired" | "bondNotRequiredReason" | "wcBasis" | "awardReturn"> & {
  attachments: readonly { purpose: string; detachedAt: Date | null; version: { withdrawnAt: Date | null } }[];
  /// 64-C4-b: the award's own sums insured and the awarded sum (the works minimum is the sum plus the uplift).
  awardedValue: Money;
  worksSumInsured: Money | null;
  liabilitySumInsured: Money | null;
  wcSumInsured: Money | null;
  contract: {
    securities: readonly { kind: string; status: string; value: Money }[];
    policies: readonly { kind: string; substitutesFor: string | null; status: string; wcCheckedOn: Date | null; sumInsured: Money }[];
  } | null;
};

const senOr = (v: Money | null) => (v == null ? null : senFromDecimal(v));

/// 64-C4-b: the award's own sums insured, by kind.
export const awardSumsOf = (a: Pick<ReadinessAward, "worksSumInsured" | "liabilitySumInsured" | "wcSumInsured">): AwardSums => ({ WORKS: senOr(a.worksSumInsured), PUBLIC_LIABILITY: senOr(a.liabilitySumInsured), WORKMENS_COMPENSATION: senOr(a.wcSumInsured) });

/// `tender`: the frozen tender Appendix's baseline for the award (null: the exercise froze none).
export function awardReadiness(award: ReadinessAward, requiredBond: RequiredBond, requirements: readonly Requirement[], tender: Baseline | null) {
  const kind = award.instrumentKind as InstrumentKind;
  const scanned = new Set(award.attachments.filter((a) => (RETURN_SCANS[kind] as readonly string[]).includes(a.purpose) && isLive(a)).map((a) => a.purpose as string));
  const securities = award.contract?.securities ?? [];
  const policies = award.contract?.policies ?? [];
  return readinessGate({
    returned: award.awardReturn ? returnReadsComplete(award.status, kind, returnRecordOf(award.awardReturn), scanned) : false,
    bondRequired: award.bondRequired,
    bondNotRequiredReason: award.bondNotRequiredReason,
    requiredBond,
    bonds: securities.map((s) => ({ kind: s.kind, status: s.status, value: senFromDecimal(s.value) })),
    requirements,
    policies: policies.map((p) => ({ kind: p.kind as InsuranceKind, substitutesFor: p.substitutesFor as InsuranceKind | null, status: p.status })),
    wcBasis: award.wcBasis as WcBasis | null,
    wcCheckRecorded: wcCheckRecordedOn(policies),
    insured: { governing: governingSums(awardSumsOf(award), tender), policies: policies.map((p) => ({ kind: p.kind as InsuranceKind, substitutesFor: p.substitutesFor as InsuranceKind | null, status: p.status, sumInsured: senFromDecimal(p.sumInsured) })) },
  });
}
