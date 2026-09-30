/**
 * The routing sheet's committee and Chief Executive blocks (FR-CTE-014), read only.
 *
 * The committee block comes from `decisionRecord()` of the decision cited on the
 * appointment route's committee step, and from nothing else; the approver's block
 * (date received, name, date decided) from the route's approving step. No column
 * stores them and no form accepts them: they render on the award and are merge fields
 * of the covering memo, where they freeze with the document.
 */

import type { DecisionRecord } from "@/lib/committee/record";

export type CommitteeBlock =
  | { state: "NOT_DECIDED" }
  | { state: "DECIDED"; committee: string; meetingReference: string; meetingDate: Date; outcome: DecisionRecord["outcome"]; decisionDate: Date | null; minuted: boolean };

export function committeeBlock(record: DecisionRecord | null, minuted: boolean): CommitteeBlock {
  if (!record) return { state: "NOT_DECIDED" };
  return { state: "DECIDED", committee: record.committee, meetingReference: record.meetingReference, meetingDate: record.meetingDate, outcome: record.outcome, decisionDate: record.decisionDate, minuted };
}

export interface ApproverBlock {
  roleLabel: string;
  /// Null: not recorded (6.11 ruling), never a guess.
  receivedOn: Date | null;
  approverName: string | null;
  decidedOn: Date | null;
}

/// The approving person step (A or MA, not a committee's) of the appointment route.
export function approverBlock(steps: readonly { act: string; committeeCode: string | null; roleLabel: string; receivedOn: Date | null; decidedByName: string | null; decidedOn: Date | null; decision: string }[]): ApproverBlock | null {
  const s = [...steps].reverse().find((x) => (x.act === "A" || x.act === "MA") && !x.committeeCode);
  if (!s) return null;
  return { roleLabel: s.roleLabel, receivedOn: s.receivedOn, approverName: s.decision === "DONE" ? s.decidedByName : null, decidedOn: s.decision === "DONE" ? s.decidedOn : null };
}

export type ReceivedFault = "RECEIVED_AFTER_DECISION" | "RECEIVED_IN_FUTURE" | "RECEIVED_BEFORE_ROUTE";

/// The day received is optional, on or before the decision, never in the future.
export function receivedOnFault(receivedOn: string | null, decidedOn: string, today: string, openedOn: string): ReceivedFault | null {
  if (!receivedOn) return null;
  if (receivedOn > today) return "RECEIVED_IN_FUTURE";
  if (receivedOn > decidedOn) return "RECEIVED_AFTER_DECISION";
  if (receivedOn < openedOn) return "RECEIVED_BEFORE_ROUTE";
  return null;
}
