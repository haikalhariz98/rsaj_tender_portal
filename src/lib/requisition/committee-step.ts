/**
 * A committee step, from the committee's decision (FR-REQ-012, 6.10 ruling).
 *
 * Reads 6.10's `decisionRecord()` output and nothing else: the sitting, the outcome
 * and the not-approved outcome as snapshotted when the matter was decided. Pending or
 * deferred keeps the step pending. Carried discharges it on the decision date. Not
 * carried rejects it, and the not-approved outcome says where the requisition goes:
 * a loop back to Draft, or closed.
 */

import type { DecisionRecord } from "@/lib/committee/record";
import { formatOrgDay } from "@/lib/format";
import { compareAmounts } from "@/lib/money";

import type { StepDecision } from "./types";

export interface CommitteeStep {
  decision: StepDecision;
  decidedOn: Date | null;
  /// Where the requisition goes when the step is rejected. Null where it is not, or
  /// where the decision recorded no not-approved outcome to say.
  requisitionGoesTo: "DRAFT" | "CLOSED" | null;
  citation: { committee: string; meetingReference: string; meetingDate: Date; outcome: DecisionRecord["outcome"] } | null;
}

export function committeeStepFrom(record: DecisionRecord | null): CommitteeStep {
  if (!record || record.outcome === "DEFERRED") {
    return { decision: "PENDING", decidedOn: null, requisitionGoesTo: null, citation: record ? cite(record) : null };
  }
  if (record.outcome === "CARRIED") {
    return { decision: "DONE", decidedOn: record.decisionDate ?? record.meetingDate, requisitionGoesTo: null, citation: cite(record) };
  }
  return {
    decision: "REJECTED",
    decidedOn: record.decisionDate ?? record.meetingDate,
    requisitionGoesTo: record.notApproved ? (record.notApproved.kind === "LOOP" ? "DRAFT" : "CLOSED") : null,
    citation: cite(record),
  };
}

function cite(r: DecisionRecord): CommitteeStep["citation"] {
  return { committee: r.committee, meetingReference: r.meetingReference, meetingDate: r.meetingDate, outcome: r.outcome };
}

export type CitationFault =
  | "NOT_THIS_REQUISITION"
  | "NOT_A_REQUISITION_MATTER"
  | "OTHER_COMMITTEE"
  | "OTHER_ACT"
  | "OTHER_AMOUNT"
  | "CITED_ON_RETURNED_ROUTE"
  | "ALREADY_CITED";

/**
 * Whether a committee matter may discharge a step (code review, item 1): a matter
 * tabled as a requisition against this requisition, before the step's committee, for
 * the act the step asks and the requisition's value (or no amount), and not already
 * cited by another step — one decision discharges one step.
 */
export function committeeCitationFault(
  matter: { requisitionId: string | null; matterKind: string | null; domain: string; act: string; amount: string | null; committeeCode: string; id: string },
  step: { committeeCode: string | null; act: string },
  requisition: { id: string; estimatedValue: string },
  citedDecisionIds: readonly string[],
  /// Decisions cited on a route closed as returned at approval (ruling R2). They stay
  /// with that route; the resubmitted route needs the matter tabled again.
  citedOnReturnedRoute: readonly string[] = [],
): CitationFault | null {
  if (matter.requisitionId !== requisition.id) return "NOT_THIS_REQUISITION";
  if (matter.matterKind !== "REQUISITION" || matter.domain !== "requisition") return "NOT_A_REQUISITION_MATTER";
  if (matter.committeeCode !== step.committeeCode) return "OTHER_COMMITTEE";
  if (matter.act !== step.act) return "OTHER_ACT";
  // Exact, in sen: two amounts a float would call equal are not the same amount.
  if (matter.amount != null && compareAmounts(matter.amount, requisition.estimatedValue) !== 0) return "OTHER_AMOUNT";
  if (citedOnReturnedRoute.includes(matter.id)) return "CITED_ON_RETURNED_ROUTE";
  if (citedDecisionIds.includes(matter.id)) return "ALREADY_CITED";
  return null;
}

/**
 * What a route closed as returned at approval says about the committee decisions cited
 * on it (ruling R2): each stays with that route and cannot discharge the resubmitted
 * one. Named from the step's snapshot — the committee as it read when cited, and the
 * decision date. Empty for any other route.
 */
export function returnedRouteCitationNotes(route: {
  returnedAtApproval: boolean;
  steps: readonly { committeeDecisionId: string | null; decidedByName: string | null; roleLabel: string; decidedOn: Date | null }[];
}): string[] {
  if (!route.returnedAtApproval) return [];
  return route.steps
    .filter((s) => s.committeeDecisionId)
    .map((s) => {
      const committee = s.decidedByName?.trim() || s.roleLabel;
      // A stored day (midnight UTC of the day recorded), read as that day.
      const when = s.decidedOn ? ` of ${formatOrgDay(s.decidedOn, "UTC")}` : "";
      return `The ${committee}'s decision${when} was cited on the returned route and cannot discharge this one; table the matter again.`;
    });
}
