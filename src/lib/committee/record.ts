/**
 * A decided matter, as a routing sheet will cite it (FR-CTE-014).
 *
 * The only source a sheet may read: the sitting's date and reference, the outcome, and
 * each member's vote with the date on their signed sheet. Everything comes from the
 * snapshot taken at recording, never from today's configuration, so a later change to
 * the quorum or the voting rule cannot rewrite what was decided.
 */

import type { DecisionOutcome, VotingRule } from "./matter";

export interface DecisionRecordInput {
  meeting: { reference: string; meetingDate: Date; committeeName: string };
  decision: {
    subject: string;
    matterRef: string | null;
    outcome: DecisionOutcome;
    decisionDate: Date | null;
    quorumRequired: number | null;
    presentVoters: number | null;
    recusedCount: number | null;
    votingRule: VotingRule | null;
    votingRuleProvenance: string | null;
    outcomeNote: string;
    notApprovedOutcome: { nameEn: string; kind: "LOOP" | "TERMINAL" } | null;
  };
  votes: { name: string; choice: string; comment: string; votedAt: Date }[];
}

export interface DecisionRecord {
  committee: string;
  meetingReference: string;
  meetingDate: Date;
  subject: string;
  matterRef: string | null;
  outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED";
  decisionDate: Date | null;
  quorum: { required: number | null; present: number | null; recused: number | null };
  votingRule: { rule: VotingRule | null; provenance: string | null };
  notApproved: { nameEn: string; kind: "LOOP" | "TERMINAL" } | null;
  note: string;
  votes: { name: string; choice: "SETUJU" | "TIDAK_SETUJU"; comment: string; votedAt: Date }[];
}

/// Null while the matter is still pending: an undecided matter has nothing to cite.
export function decisionRecord(i: DecisionRecordInput): DecisionRecord | null {
  const d = i.decision;
  if (d.outcome === "PENDING") return null;
  return {
    committee: i.meeting.committeeName,
    meetingReference: i.meeting.reference,
    meetingDate: i.meeting.meetingDate,
    subject: d.subject,
    matterRef: d.matterRef,
    outcome: d.outcome,
    decisionDate: d.decisionDate,
    quorum: { required: d.quorumRequired, present: d.presentVoters, recused: d.recusedCount },
    votingRule: { rule: d.votingRule, provenance: d.votingRuleProvenance },
    notApproved: d.notApprovedOutcome,
    note: d.outcomeNote,
    votes: i.votes
      .filter((v) => v.choice === "SETUJU" || v.choice === "TIDAK_SETUJU")
      .map((v) => ({ ...v, choice: v.choice as "SETUJU" | "TIDAK_SETUJU" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
