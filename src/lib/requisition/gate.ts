/**
 * The committee gate (FR-REQ-012, ADR 0010; rulings CO-1, CO-2, C2).
 *
 * Outside every approval matrix: a funding route may require an approved requisition
 * to pass one or more committees before its first sourcing exercise. Whether a route
 * has a gate is the customer's policy and ships unset; unset blocks, and nothing here
 * ever reads an unknown as a pass (ruling C2). A gate's state is read only from 6.10's
 * `decisionRecord()` of the matters cited against it: carried passes, not carried with
 * a loop returns it for revision, not carried with a terminal outcome ends it.
 *
 * Pure. The action determines the gates on approval (or on "Check committee gates" for
 * a requisition approved before gates existed) and stores what each rule read.
 */

import type { DecisionRecord } from "@/lib/committee/record";
import { inForceOn } from "@/lib/effective";
import { parseSen, type Sen } from "@/lib/money";

import type { Provenance } from "./types";

/// The matter domain a gate matter is tabled under.
export const GATE_DOMAIN = "committee_gate";

export interface GateRuleRow {
  id: string;
  fundingRouteCode: string;
  committeeCode: string;
  subjectEn: string;
  act: string;
  /// Strictly above this, as a two-decimal string. Null: any value.
  aboveValue: string | null;
  provenance: Provenance;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sortOrder: number;
}

export type GatesFinding =
  /// Nobody has said whether the route has a gate: blocks, naming the setting.
  | { state: "NOT_SET" }
  /// The route says it has a gate, and no gate rule is in force for it: blocks.
  | { state: "RULE_MISSING" }
  /// No gate: the route has none, or no rule applies at the approved value.
  | { state: "NONE"; why: "ROUTE_HAS_NO_GATE" | "NO_RULE_AT_VALUE" }
  | { state: "RULES"; rules: GateRuleRow[] };

/**
 * The gates an approved requisition must pass. `approved` is the value the route
 * approved, in sen; a rule's `aboveValue` is compared in sen and strictly — a
 * requisition approved for exactly that value is not above it.
 */
export function gatesFor(
  route: { code: string; committeeGateRequired: boolean | null } | null,
  rules: readonly GateRuleRow[],
  approved: Sen,
  on: Date,
): GatesFinding {
  if (!route || route.committeeGateRequired == null) return { state: "NOT_SET" };
  if (route.committeeGateRequired === false) return { state: "NONE", why: "ROUTE_HAS_NO_GATE" };
  const inForce = rules.filter((r) => r.fundingRouteCode === route.code && inForceOn(r, on));
  if (inForce.length === 0) return { state: "RULE_MISSING" };
  const applies = inForce
    .filter((r) => r.aboveValue == null || approved > parseSen(r.aboveValue))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.committeeCode.localeCompare(b.committeeCode));
  return applies.length === 0 ? { state: "NONE", why: "NO_RULE_AT_VALUE" } : { state: "RULES", rules: applies };
}

export type GateState = "AWAITING" | "PASSED" | "RETURNED" | "ENDED" | "OUTCOME_NOT_RECORDED";

/// A matter cited against a gate. `record` is `decisionRecord()`, null while pending.
export interface GateMatter {
  id: string;
  tabledAt: Date | null;
  withdrawn: boolean;
  record: DecisionRecord | null;
}

const decidedOn = (m: GateMatter) => m.record?.decisionDate ?? m.record?.meetingDate ?? null;

/// Matters in the order they were decided: decision date, then tabling, then id.
export function inDecisionOrder(matters: readonly GateMatter[]): GateMatter[] {
  const t = (d: Date | null) => d?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...matters].sort((a, b) => t(decidedOn(a)) - t(decidedOn(b)) || t(a.tabledAt) - t(b.tabledAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Where a gate stands, from the latest decided matter cited against it. Pending and
 * deferred matters leave it awaiting; a withdrawn one counts for nothing. A not-carried
 * decision with no outcome snapshot cannot say whether it loops or ends, so it blocks
 * rather than being read as either (the exit is to table the matter again).
 */
export function gateState(matters: readonly GateMatter[]): { state: GateState; decisive: GateMatter | null } {
  const decided = inDecisionOrder(matters.filter((m) => !m.withdrawn && m.record && m.record.outcome !== "DEFERRED"));
  const last = decided[decided.length - 1] ?? null;
  if (!last) return { state: "AWAITING", decisive: null };
  const r = last.record!;
  if (r.outcome === "CARRIED") return { state: "PASSED", decisive: last };
  if (!r.notApproved) return { state: "OUTCOME_NOT_RECORDED", decisive: last };
  return { state: r.notApproved.kind === "LOOP" ? "RETURNED" : "ENDED", decisive: last };
}

export type GateCitationFault =
  | "NOT_THIS_REQUISITION"
  | "NOT_GATE_DOMAIN"
  | "OTHER_COMMITTEE"
  | "OTHER_ACT"
  | "CITED_ON_ROUTE_STEP"
  | "ALREADY_CITED"
  | "WITHDRAWN"
  | "DECIDED_BEFORE_GATE"
  | "GATE_PASSED"
  | "GATE_ENDED"
  | "NOT_AFTER_RETURN";

/**
 * Whether a matter may be cited against a gate. Loop-back is enforced: once a gate is
 * returned, only a matter decided after the returning decision can move it, and the
 * returning decision itself is already cited (one matter answers one gate). A matter
 * cited on an approval-route step answers that step, never a gate.
 */
export function gateCitationFault(
  matter: {
    id: string;
    requisitionId: string | null;
    matterKind: string | null;
    domain: string;
    committeeCode: string;
    act: string;
    requisitionGateId: string | null;
    citedOnStep: boolean;
    withdrawn: boolean;
    /// The decision day as stored, or null while undecided.
    decidedOn: Date | null;
  },
  gate: { id: string; requisitionId: string; committeeCode: string; act: string; determinedOn: Date },
  current: { state: GateState; decisive: GateMatter | null },
): GateCitationFault | null {
  if (matter.requisitionId !== gate.requisitionId) return "NOT_THIS_REQUISITION";
  if (matter.matterKind !== "REQUISITION" || matter.domain !== GATE_DOMAIN) return "NOT_GATE_DOMAIN";
  if (matter.committeeCode !== gate.committeeCode) return "OTHER_COMMITTEE";
  if (matter.act !== gate.act) return "OTHER_ACT";
  if (matter.citedOnStep) return "CITED_ON_ROUTE_STEP";
  if (matter.requisitionGateId) return "ALREADY_CITED";
  if (matter.withdrawn) return "WITHDRAWN";
  if (current.state === "PASSED") return "GATE_PASSED";
  if (current.state === "ENDED") return "GATE_ENDED";
  const day = (d: Date) => d.toISOString().slice(0, 10);
  if (matter.decidedOn && day(matter.decidedOn) < day(gate.determinedOn)) return "DECIDED_BEFORE_GATE";
  if (current.state === "RETURNED" || current.state === "OUTCOME_NOT_RECORDED") {
    const returnedOn = decidedOn(current.decisive!);
    if (matter.decidedOn && returnedOn && matter.decidedOn.getTime() <= returnedOn.getTime()) return "NOT_AFTER_RETURN";
  }
  return null;
}

/// One gate as the exercise check needs it.
export interface GateSummary {
  committeeLabel: string;
  state: GateState;
}

/**
 * What the gates say about opening an exercise. Undetermined is never a pass: the
 * reason it is undetermined (the route's setting unset, its rules missing, or the
 * requisition approved before gates were checked) is carried for the blocker.
 */
export type GateFinding =
  | { code: "CLEAR" }
  | { code: "GATES_NOT_DETERMINED"; why: "NOT_SET" | "RULE_MISSING" | "NOT_CHECKED" }
  | { code: "GATE_AWAITING" | "GATE_RETURNED" | "GATE_ENDED" | "GATE_OUTCOME_NOT_RECORDED"; committee: string };

export function gateFinding(
  determined: boolean,
  undeterminedWhy: "NOT_SET" | "RULE_MISSING" | "NOT_CHECKED",
  gates: readonly GateSummary[],
): GateFinding {
  if (!determined) return { code: "GATES_NOT_DETERMINED", why: undeterminedWhy };
  // The worst gate speaks: ended, then an unreadable outcome, then returned, then awaiting.
  for (const [state, code] of [
    ["ENDED", "GATE_ENDED"],
    ["OUTCOME_NOT_RECORDED", "GATE_OUTCOME_NOT_RECORDED"],
    ["RETURNED", "GATE_RETURNED"],
    ["AWAITING", "GATE_AWAITING"],
  ] as const) {
    const g = gates.find((x) => x.state === state);
    if (g) return { code, committee: g.committeeLabel };
  }
  return { code: "CLEAR" };
}

/// Whether a gate has ended the requisition: the one way an approved one closes unsourced.
export function anyGateEnded(gates: readonly GateSummary[]): boolean {
  return gates.some((g) => g.state === "ENDED");
}

export type GateRuleFault = "ROUTE_UNKNOWN" | "COMMITTEE_UNKNOWN" | "ENDS_BEFORE_IT_STARTS" | "OVERLAPS";

/**
 * Why a gate rule cannot be saved. One committee answers one route's gate once at a
 * time: two rules for the same route and committee in force together would ask the
 * same committee twice.
 */
export function gateRuleFaults(
  rule: Pick<GateRuleRow, "id" | "fundingRouteCode" | "committeeCode" | "effectiveFrom" | "effectiveTo">,
  others: readonly Pick<GateRuleRow, "id" | "fundingRouteCode" | "committeeCode" | "effectiveFrom" | "effectiveTo">[],
  known: { routes: readonly string[]; committees: readonly string[] },
): GateRuleFault[] {
  const faults: GateRuleFault[] = [];
  if (!known.routes.includes(rule.fundingRouteCode)) faults.push("ROUTE_UNKNOWN");
  if (!known.committees.includes(rule.committeeCode)) faults.push("COMMITTEE_UNKNOWN");
  if (rule.effectiveTo && rule.effectiveTo <= rule.effectiveFrom) faults.push("ENDS_BEFORE_IT_STARTS");
  const overlaps = others.some(
    (o) =>
      o.id !== rule.id &&
      o.fundingRouteCode === rule.fundingRouteCode &&
      o.committeeCode === rule.committeeCode &&
      !(o.effectiveTo != null && o.effectiveTo <= rule.effectiveFrom) &&
      !(rule.effectiveTo != null && rule.effectiveTo <= o.effectiveFrom),
  );
  if (overlaps) faults.push("OVERLAPS");
  return faults;
}
