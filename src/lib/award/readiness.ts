/**
 * The pre-signature readiness gate (FR-CON-008), shown on the award as the conditions
 * precedent to signing. Cumulative: the instrument returned, the performance bond
 * verified (or decided not required, with the reason shown), and every required policy
 * verified. The signature itself is Phase 4a; this is only the gate. An undecided bond
 * or an unset requirement list is NOT_SET, never met.
 */

import { countsAs, wcSumCheck, type InsuranceKind, type Requirement, type WcBasis } from "@/lib/securities/insurance";
import type { RequiredBond } from "@/lib/securities/bond";
import type { Sen } from "@/lib/money";

import { sumFindings, type Governing, type InsuredKind, type PolicySum } from "./insurance-terms";

export type GateState = "MET" | "NOT_MET" | "NOT_SET";
export type GateKey = "RETURNED" | "BOND" | "INSURANCE";

export interface GateItem {
  key: GateKey;
  state: GateState;
  /// What is outstanding, as keys for the label table; for insurance, each missing
  /// requirement as "LODGED:<name>" or "NOT_LODGED:<name>".
  detail: string[];
}

export function readinessGate(i: {
  returned: boolean;
  bondRequired: boolean | null;
  bondNotRequiredReason: string;
  requiredBond: RequiredBond;
  bonds: readonly { kind: string; status: string; value: Sen }[];
  requirements: readonly Requirement[];
  policies: readonly { kind: InsuranceKind; substitutesFor: InsuranceKind | null; status: string }[];
  /// How workmen's compensation is set on the award: on uncovered wages its sum is not
  /// checked, so a verified policy does not meet the gate (BD-15).
  wcBasis: WcBasis | null;
  /// 6.12 (BD-20 carry): a check of the uncovered wages recorded on the verified policy. It meets the
  /// item recorded, not judged: no configured basis compares the wages with the sum insured (D4).
  wcCheckRecorded?: boolean;
  /// 64-C4-b: the governing sum insured per kind (the award's, else the tender Appendix's minimum) and the
  /// policies' sums. Absent: not compared (a caller from before 64-C4-b).
  insured?: { governing: Readonly<Record<InsuredKind, Governing>>; policies: readonly PolicySum[] };
}): { ready: boolean; items: GateItem[] } {
  const items: GateItem[] = [];
  items.push({ key: "RETURNED", state: i.returned ? "MET" : "NOT_MET", detail: [] });

  if (i.bondRequired == null) items.push({ key: "BOND", state: "NOT_SET", detail: ["BOND_NOT_DECIDED"] });
  else if (!i.bondRequired) items.push({ key: "BOND", state: i.bondNotRequiredReason.trim() ? "MET" : "NOT_SET", detail: [i.bondNotRequiredReason.trim() ? "NOT_REQUIRED" : "REASON_NOT_RECORDED"] });
  else if (i.requiredBond.state === "NOT_SET") items.push({ key: "BOND", state: "NOT_SET", detail: ["BASIS_NOT_SET"] });
  else {
    const req = i.requiredBond.amount;
    const ok = i.bonds.some((b) => b.kind === "PERFORMANCE_BOND" && b.status === "VERIFIED" && b.value >= req);
    items.push({ key: "BOND", state: ok ? "MET" : "NOT_MET", detail: ok ? [] : ["NOT_VERIFIED"] });
  }

  if (i.requirements.length === 0) items.push({ key: "INSURANCE", state: "NOT_SET", detail: ["REQUIREMENTS_NOT_SET"] });
  else {
    const verified = new Set(i.policies.filter((p) => p.status === "VERIFIED").map((p) => countsAs(p)));
    const lodged = new Set(i.policies.filter((p) => p.status === "LODGED").map((p) => countsAs(p)));
    const missing = i.requirements.filter((r) => !verified.has(r.kind));
    const sum = i.requirements.some((r) => r.kind === "WORKMENS_COMPENSATION") ? wcSumCheck(i.wcBasis) : "CHECKED";
    // 6.12: on uncovered wages, a recorded check stands in for the sum check it cannot be.
    const wc = sum === "NOT_CHECKED" && i.wcCheckRecorded ? "RECORDED" : sum;
    // 64-C4-b: each verified policy against the sum that governs its kind; a shortfall blocks signing.
    const sums = i.insured ? sumFindings(i.requirements.map((r) => r.kind), i.insured.governing, i.insured.policies) : [];
    const short = sums.filter((f) => f.state === "SHORT");
    const detail = [
      ...missing.map((r) => `${lodged.has(r.kind) ? "LODGED" : "NOT_LODGED"}:${r.nameEn}`),
      ...sums.map((f) => (f.state === "SHORT" ? `SHORT:${f.kind}:${f.governing.sen}:${f.governing.state}:${f.insured}` : `SUM_NOT_STATED:${f.kind}`)),
      ...(wc === "NOT_CHECKED" ? ["WC_NOT_CHECKED"] : wc === "NOT_SET" ? ["WC_BASIS_NOT_SET"] : wc === "RECORDED" ? ["WC_RECORDED_NOT_JUDGED"] : []),
    ];
    items.push({ key: "INSURANCE", state: missing.length || short.length ? "NOT_MET" : wc === "NOT_CHECKED" || wc === "NOT_SET" ? "NOT_SET" : "MET", detail });
  }
  return { ready: items.every((x) => x.state === "MET"), items };
}

/**
 * How many conditions still stand between the award and signing: each gate item that is
 * not met (not set counts, as it never reads as met) and each customer condition not
 * yet satisfied. Zero means nothing is outstanding, not that nothing is recorded.
 */
export function conditionsOutstanding(gateItems: readonly { state: string }[], conditions: readonly { satisfiedOn: Date | null }[]): number {
  return gateItems.filter((i) => i.state !== "MET").length + conditions.filter((c) => !c.satisfiedOn).length;
}

/// 6.12: whether a verified workmen's compensation policy carries a recorded check of the uncovered wages.
export const wcCheckRecordedOn = (policies: readonly { kind: string; status: string; wcCheckedOn: Date | null }[]) =>
  policies.some((p) => p.kind === "WORKMENS_COMPENSATION" && p.status === "VERIFIED" && p.wcCheckedOn != null);
