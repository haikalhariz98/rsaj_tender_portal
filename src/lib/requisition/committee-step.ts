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
