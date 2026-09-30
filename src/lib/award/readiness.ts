/**
 * The pre-signature readiness gate (FR-CON-008), shown on the award as the conditions
 * precedent to signing. Cumulative: the instrument returned, the performance bond
 * verified (or decided not required, with the reason shown), and every required policy
 * verified. The signature itself is Phase 4a; this is only the gate. An undecided bond
 * or an unset requirement list is NOT_SET, never met.
 */

import { countsAs, type InsuranceKind, type Requirement } from "@/lib/securities/insurance";
import type { RequiredBond } from "@/lib/securities/bond";
import type { Sen } from "@/lib/money";

export type GateState = "MET" | "NOT_MET" | "NOT_SET";
export type GateKey = "RETURNED" | "BOND" | "INSURANCE";

export interface GateItem {
  key: GateKey;
  state: GateState;
  /// What is outstanding, as keys for the label table: missing kinds, or why.
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
    const missing = i.requirements.filter((r) => !verified.has(r.kind)).map((r) => r.nameEn);
    items.push({ key: "INSURANCE", state: missing.length ? "NOT_MET" : "MET", detail: missing });
  }
  return { ready: items.every((x) => x.state === "MET"), items };
}
