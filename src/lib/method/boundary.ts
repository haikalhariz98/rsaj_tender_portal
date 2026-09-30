/**
 * The D3 boundary, for the method and terms families (FR-MTD-003, 6.3 rulings R-7, R-8).
 *
 * One switch, `boundaryInclusive`, decides which side a value exactly on the boundary
 * falls. The regime edge (`tenderFloor`) always follows it — `regimeFor` passes that
 * explicitly. A rule or terms band follows it only where it says so. The tender floor
 * must be the boundary (a hard reject on save), and a ruling recorded as STATED must
 * cite its source.
 */

import { compareAmounts, parseSen, senFromAmount, type Sen } from "@/lib/money";
import { edgeAtBoundary } from "@/lib/authority/resolve";
import type { Matrix, Policy } from "@/lib/authority/types";

import { APPOINTMENT_DOMAIN, type BoundaryOperator, type Finding, type Provenance, type TermsBand } from "./types";

export type PolicyFault = "TENDER_NOT_ABOVE_QUOTATION" | "TENDER_FLOOR_NOT_BOUNDARY" | "BOUNDARY_SOURCE_REQUIRED";

/**
 * Why an issue's thresholds cannot be saved. Amounts as the decimal strings the form
 * gave, compared exactly. Each fault names the field it belongs to.
 */
export function matrixPolicyFaults(p: {
  quotationFloor: string;
  tenderFloor: string;
  boundaryValue: string;
  boundaryProvenance: Provenance;
  boundarySource: string;
}): (Finding<PolicyFault> & { field: string })[] {
  const out: (Finding<PolicyFault> & { field: string })[] = [];
  if (compareAmounts(p.tenderFloor, p.quotationFloor) <= 0) out.push({ code: "TENDER_NOT_ABOVE_QUOTATION", level: "block", field: "tenderFloor" });
  // The boundary is where the two regimes meet, so it is the tender floor. Anywhere
  // else, the switch would govern no regime edge at all (ruling R-7).
  if (compareAmounts(p.boundaryValue, p.tenderFloor) !== 0) out.push({ code: "TENDER_FLOOR_NOT_BOUNDARY", level: "block", field: "boundaryValue" });
  // A written ruling cites where it is written (ruling R-8).
  if (p.boundaryProvenance === "STATED" && !p.boundarySource.trim()) out.push({ code: "BOUNDARY_SOURCE_REQUIRED", level: "block", field: "boundarySource" });
  return out;
}

export type ConsistencyFault = "SWITCH_GOVERNS_NO_REGIME" | "BOUNDARY_UNDECIDED" | "REGIME_RULE_DISAGREE";

/**
 * Where the method and terms families could disagree with the regime at the boundary,
 * on an issue as it stands. The tender floor check is for rows saved before it was
 * refused on save; an appointment rule or terms band with an edge on the boundary
 * that has not decided whether it follows the switch, or has decided not to, would
 * put a value exactly on the boundary in a different band from its regime.
 */
export function bandConsistencyFaults(matrix: Matrix, termsBands: readonly TermsBand[]): Finding<ConsistencyFault>[] {
  const out: Finding<ConsistencyFault>[] = [];
  const p = matrix.policy;
  if (senFromAmount(p.tenderFloor) !== senFromAmount(p.boundaryValue)) out.push({ code: "SWITCH_GOVERNS_NO_REGIME", level: "warn" });
  const edges = [
    ...matrix.rules
      .filter((r) => r.domain === APPOINTMENT_DOMAIN)
      .map((r) => ({ label: r.labelEn, kind: "rule", follows: r.followsBoundarySwitch, at: edgeAtBoundary(r, p) })),
    ...termsBands.map((t) => ({
      label: t.labelEn,
      kind: "terms",
      follows: t.followsBoundarySwitch,
      at: edgeAtBoundary({ minValue: t.minValue, maxValue: t.maxValue, contractValueMin: null, contractValueMax: null }, p),
    })),
  ];
  for (const e of edges) {
    if (!e.at) continue;
    if (e.follows == null) out.push({ code: "BOUNDARY_UNDECIDED", level: "warn", data: { label: e.label, kind: e.kind } });
    else if (e.follows === false) out.push({ code: "REGIME_RULE_DISAGREE", level: "warn", data: { label: e.label, kind: e.kind } });
  }
  return out;
}

/// A terms band's edge on the boundary must say whether it follows the switch, as a
/// rule's must (6.1). Null where it may be saved.
export function termsBandBoundaryFault(band: Pick<TermsBand, "minValue" | "maxValue" | "followsBoundarySwitch">, policy: Pick<Policy, "boundaryValue">): "BOUNDARY_UNDECIDED" | null {
  const at = edgeAtBoundary({ minValue: band.minValue, maxValue: band.maxValue, contractValueMin: null, contractValueMax: null }, policy);
  return at && band.followsBoundarySwitch == null ? "BOUNDARY_UNDECIDED" : null;
}

export interface BoundaryResult {
  boundaryValue: number;
  /// The comparison the regime edge applied: GT keeps a value exactly on the boundary
  /// in the lower regime, GTE moves it up.
  operator: BoundaryOperator;
  onBoundary: boolean;
  /// Whether the boundary ruling is written down (STATED with a source).
  ruled: boolean;
  provenance: Provenance;
}

export function boundaryOf(value: Sen, policy: Pick<Policy, "boundaryValue" | "boundaryInclusive">, provenance: Provenance): BoundaryResult {
  return {
    boundaryValue: policy.boundaryValue,
    operator: policy.boundaryInclusive ? "GT" : "GTE",
    onBoundary: value === senFromAmount(policy.boundaryValue),
    ruled: provenance === "STATED",
    provenance,
  };
}

/// The logged exception (spec D3): a case on the boundary while the ruling is unwritten.
export function boundaryFindings(b: BoundaryResult): Finding<"BOUNDARY_NOT_RULED">[] {
  return b.onBoundary && !b.ruled ? [{ code: "BOUNDARY_NOT_RULED", level: "warn", data: { operator: b.operator } }] : [];
}

/// Exact sen of a decimal string, for callers holding Decimal columns.
export const senOf = (v: { toString(): string }): Sen => parseSen(v.toString());
