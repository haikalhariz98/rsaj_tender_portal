/**
 * Where a rejected matter goes (FR-APR-016, ADR 0009; rulings CO-3, CO-4, CO-5).
 *
 * Every approval step offers Reject with a reason, and a rejected matter must go
 * somewhere: back to whoever raised it, back to a named earlier step, or nowhere — it
 * ends. Which one is the customer's policy per matter type (B4) and ships unset. The
 * destination is snapshotted onto the route when it opens, so an edit to the
 * configuration mid-route changes nothing an approver was shown (CO-4).
 *
 * A committee's own not-carried outcome governs a committee step (CO-3): a loop goes
 * back to the originator, a terminal outcome ends the matter. The configured
 * destination governs a person step. Where nothing applies — unset, a step that is not
 * on this route, or a destination this matter cannot take — the officer chooses, and
 * the choice is recorded as the officer's, never as policy (CO-5). Rejection itself is
 * never refused.
 *
 * Pure.
 */

import { inForceOn } from "@/lib/effective";

export const REJECTION_KINDS = ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"] as const;
export type RejectionKind = (typeof REJECTION_KINDS)[number];
export type RejectionSource = "CONFIGURED" | "COMMITTEE_OUTCOME" | "OFFICER_CHOICE";

/// The matter types a destination is configured for: the engine's approval domains.
export const REJECTION_DOMAINS = ["requisition", "name_approval", "appointment"] as const;
export type RejectionDomain = (typeof REJECTION_DOMAINS)[number];

export interface DestinationRow {
  id: string;
  domain: string;
  kind: RejectionKind;
  returnToRoleCode: string | null;
  provenance: "STATED" | "OBSERVED" | "ASSUMED";
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/// The destination in force for a matter type on a day, or that none is set.
export function destinationFor(rows: readonly DestinationRow[], domain: string, on: Date): { set: false } | { set: true; row: DestinationRow } {
  const live = rows.filter((r) => r.domain === domain && inForceOn(r, on)).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  return live[0] ? { set: true, row: live[0] } : { set: false };
}

/// What a route stores when it opens: the destination as it stood, or that none was set.
export function rejectionSnapshot(rows: readonly DestinationRow[], domain: string, on: Date, at: Date) {
  const d = destinationFor(rows, domain, on);
  return {
    rejectionSnapshotAt: at,
    rejectionDestinationId: d.set ? d.row.id : null,
    rejectionKind: d.set ? d.row.kind : null,
    rejectionReturnToRoleCode: d.set ? d.row.returnToRoleCode : null,
    rejectionProvenance: d.set ? d.row.provenance : null,
  };
}

export type DestinationFault = "DOMAIN_UNKNOWN" | "ROLE_REQUIRED" | "ROLE_NOT_ALLOWED" | "ROLE_UNKNOWN" | "SAME_DAY" | "ENDS_BEFORE_IT_STARTS";

/**
 * Why a destination cannot be saved. A return to a step must name the office whose
 * step it returns to, and nothing else may; two rows of one matter type taking effect
 * on the same day would leave which one applies to row order.
 */
export function destinationRowFaults(
  row: Omit<DestinationRow, "provenance">,
  others: readonly Omit<DestinationRow, "provenance">[],
  offices: readonly string[],
): DestinationFault[] {
  const faults: DestinationFault[] = [];
  if (!(REJECTION_DOMAINS as readonly string[]).includes(row.domain)) faults.push("DOMAIN_UNKNOWN");
  if (row.kind === "RETURN_TO_STEP" && !row.returnToRoleCode) faults.push("ROLE_REQUIRED");
  if (row.kind !== "RETURN_TO_STEP" && row.returnToRoleCode) faults.push("ROLE_NOT_ALLOWED");
  if (row.returnToRoleCode && !offices.includes(row.returnToRoleCode)) faults.push("ROLE_UNKNOWN");
  if (row.effectiveTo && row.effectiveTo <= row.effectiveFrom) faults.push("ENDS_BEFORE_IT_STARTS");
  if (others.some((o) => o.id !== row.id && o.domain === row.domain && o.effectiveFrom.getTime() === row.effectiveFrom.getTime())) faults.push("SAME_DAY");
  return faults;
}

export interface RouteSnapshot {
  /// Null: the route predates the snapshot (shown "not recorded").
  snapshotAt: Date | null;
  kind: RejectionKind | null;
  returnToRoleCode: string | null;
}

export interface RouteStep {
  sequence: number;
  roleCode: string | null;
}

export type RejectionOutcome =
  | { apply: RejectionKind; source: "CONFIGURED" | "COMMITTEE_OUTCOME"; returnToSeq?: number }
  | { choose: RejectionKind[]; why: "NOT_SET" | "STEP_NOT_ON_ROUTE" | "NOT_SUPPORTED" };

/// Earlier steps the matter could be returned to: every step before the rejecting one.
export function earlierSteps<T extends RouteStep>(steps: readonly T[], rejectingSeq: number): T[] {
  return steps.filter((s) => s.sequence < rejectingSeq).sort((a, b) => a.sequence - b.sequence);
}

/**
 * For a route read as a whole: whether a configured return to a step can apply to the
 * next step awaiting a decision — a step of the named office comes before it. Undefined
 * where that does not arise (no return to a step, or nothing pending).
 */
export function returnTargetBeforeNext(route: { rejectionKind: string | null; rejectionReturnToRoleCode: string | null; steps: readonly (RouteStep & { decision: string })[] }): boolean | undefined {
  const next = [...route.steps].sort((a, b) => a.sequence - b.sequence).find((s) => s.decision === "PENDING");
  return next ? returnTargetBefore(route, next.sequence) : undefined;
}

/**
 * Said of one step: whether a configured return to a step could apply if this step
 * rejected — a step of the named office comes before it (the same test
 * `rejectionOutcome` applies). Undefined where the route returns nowhere in particular.
 */
export function returnTargetBefore(route: { rejectionKind: string | null; rejectionReturnToRoleCode: string | null; steps: readonly RouteStep[] }, sequence: number): boolean | undefined {
  if (route.rejectionKind !== "RETURN_TO_STEP") return undefined;
  return earlierSteps(route.steps, sequence).some((s) => s.roleCode === route.rejectionReturnToRoleCode);
}

/// What the officer may choose among: the kinds this matter supports, and a return to a
/// step only where there is an earlier step to return to.
export function choicesFor(supports: readonly RejectionKind[], steps: readonly RouteStep[], rejectingSeq: number): RejectionKind[] {
  return REJECTION_KINDS.filter((k) => supports.includes(k) && (k !== "RETURN_TO_STEP" || earlierSteps(steps, rejectingSeq).length > 0));
}

/**
 * Where a rejection sends the matter, from the route's snapshot only. A return to a
 * step goes to the earliest step of the named office before the rejecting step.
 */
export function rejectionOutcome(i: {
  snapshot: RouteSnapshot;
  /// The rejecting step's committee outcome, as snapshotted with its decision. Null for a person step.
  committee: { kind: "LOOP" | "TERMINAL" } | null;
  steps: readonly RouteStep[];
  rejectingSeq: number;
  supports: readonly RejectionKind[];
}): RejectionOutcome {
  const choose = (why: "NOT_SET" | "STEP_NOT_ON_ROUTE" | "NOT_SUPPORTED"): RejectionOutcome => ({ choose: choicesFor(i.supports, i.steps, i.rejectingSeq), why });
  if (i.committee) {
    const kind: RejectionKind = i.committee.kind === "LOOP" ? "RETURN_TO_ORIGINATOR" : "TERMINATE";
    return i.supports.includes(kind) ? { apply: kind, source: "COMMITTEE_OUTCOME" } : choose("NOT_SUPPORTED");
  }
  const kind = i.snapshot.kind;
  if (!kind) return choose("NOT_SET");
  if (!i.supports.includes(kind)) return choose("NOT_SUPPORTED");
  if (kind !== "RETURN_TO_STEP") return { apply: kind, source: "CONFIGURED" };
  const target = earlierSteps(i.steps, i.rejectingSeq).find((s) => s.roleCode === i.snapshot.returnToRoleCode);
  return target ? { apply: kind, source: "CONFIGURED", returnToSeq: target.sequence } : choose("STEP_NOT_ON_ROUTE");
}

export type ChoiceFault = "NOT_AWAITING" | "NOT_OFFERED" | "STEP_REQUIRED" | "STEP_NOT_EARLIER" | "REASON_REQUIRED" | "PERSON_REQUIRED";

/**
 * Whether the officer's choice may be recorded: on a rejected route nothing has been
 * applied to, one of the kinds offered, a return naming an earlier step, with the
 * Person on whose behalf it is recorded and a reason.
 */
export function choiceFault(
  route: { status: string; applied: RejectionKind | null; offered: readonly RejectionKind[]; steps: readonly RouteStep[]; rejectingSeq: number | null },
  choice: { kind: RejectionKind | null; returnToSeq: number | null; personId: string | null; reason: string },
): ChoiceFault | null {
  if (route.status !== "REJECTED" || route.applied != null || route.rejectingSeq == null) return "NOT_AWAITING";
  if (!choice.kind || !route.offered.includes(choice.kind)) return "NOT_OFFERED";
  if (choice.kind === "RETURN_TO_STEP") {
    if (choice.returnToSeq == null) return "STEP_REQUIRED";
    if (!earlierSteps(route.steps, route.rejectingSeq).some((s) => s.sequence === choice.returnToSeq)) return "STEP_NOT_EARLIER";
  }
  if (!choice.personId) return "PERSON_REQUIRED";
  if (!choice.reason.trim()) return "REASON_REQUIRED";
  return null;
}

/// A step as decided, for carrying onto a successor route.
export interface DecidedStep {
  id: string;
  sequence: number;
  roleCode: string | null;
  roleLabel: string;
  act: string;
  committeeCode: string | null;
  nonDelegable: boolean;
  sourceRuleKey: string | null;
  decision: string;
  decidedByPersonId: string | null;
  decidedByName: string | null;
  decidedOn: Date | null;
  delegationId: string | null;
  reason: string;
  receivedOn: Date | null;
  recordedAt: Date | null;
  /// Where the step came from on a generated chain (FR-APR-004). Optional: a step read
  /// before core routing existed has none.
  chainOrigin?: string | null;
}

/**
 * The successor route's steps (ADR 0009: re-routing opens a new instance). Steps
 * before the one returned to are carried with their decisions, pointing at the step
 * they were taken on — never a fresh citation of a committee decision (ruling C3).
 * Steps from it onward are pending again. The chain is never shortened (FR-APR-004):
 * every step of the rejected route is on the successor, in its order.
 */
export function successorSteps(steps: readonly DecidedStep[], returnToSeq: number) {
  return [...steps]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => {
      const base = { sequence: s.sequence, roleCode: s.roleCode, roleLabel: s.roleLabel, act: s.act, committeeCode: s.committeeCode, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: s.chainOrigin ?? null };
      if (s.sequence >= returnToSeq) return { ...base, decision: "PENDING" as const, carriedFromStepId: null };
      return {
        ...base,
        decision: s.decision,
        decidedByPersonId: s.decidedByPersonId,
        decidedByName: s.decidedByName,
        decidedOn: s.decidedOn,
        delegationId: s.delegationId,
        reason: s.reason,
        receivedOn: s.receivedOn,
        recordedAt: s.recordedAt,
        carriedFromStepId: s.id,
      };
    });
}
