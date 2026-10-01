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
    const wc = i.requirements.some((r) => r.kind === "WORKMENS_COMPENSATION") ? wcSumCheck(i.wcBasis) : "CHECKED";
    const detail = [
      ...missing.map((r) => `${lodged.has(r.kind) ? "LODGED" : "NOT_LODGED"}:${r.nameEn}`),
      ...(wc === "NOT_CHECKED" ? ["WC_NOT_CHECKED"] : wc === "NOT_SET" ? ["WC_BASIS_NOT_SET"] : []),
    ];
    items.push({ key: "INSURANCE", state: missing.length ? "NOT_MET" : wc !== "CHECKED" ? "NOT_SET" : "MET", detail });
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
