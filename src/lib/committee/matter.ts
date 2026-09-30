/**
 * Whether one matter at a sitting may be decided, and whether a requested outcome
 * may be recorded against it.
 *
 * Pure. Judged per matter, because a recusal takes a member out of one matter's vote
 * and quorum and no other. Judged on seats rather than on named holders, because a
 * seat covered by a valid alternate is a seat present (ruling 5.9).
 *
 * Three states wherever the source may be silent: a quorum or a voting rule that
 * nobody has set is not a quorum of zero or an assumed majority. It blocks.
 */

import {
  assessQuorum,
  MANDATORY_ACTS,
  tallyVotes,
  type QuorumAssessment,
  type VoteChoice,
  type VoteTally,
} from "./quorum";
import type { Occupant } from "./sitting";

export type VotingRule = "SIMPLE_MAJORITY" | "UNANIMOUS";
export type DecisionOutcome = "PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED";
export type MeetingStatus = "SCHEDULED" | "IN_PROGRESS" | "MINUTED" | "CANCELLED";

export { MANDATORY_ACTS };

export type MatterBlocker =
  | "NOT_TABLED"
  | "DEPENDENCY_PENDING"
  | "QUORUM_UNCONFIGURED"
  | "QUORUM_NOT_MET"
  | "VOTING_RULE_UNCONFIGURED"
  | "ALTERNATE_FOR_RECUSED_UNCONFIGURED"
  | "INELIGIBLE_VOTE"
  | "VOTES_OUTSTANDING"
  | "MANDATORY_ACT_NOT_FULL_BODY";

export interface MatterInput {
  quorum: number | null;
  votingRule: VotingRule | null;
  act: string;
  tabled: boolean;
  /// Every voting seat in force on the sitting date, with its holder where resolved,
  /// and whether any alternate in force could cover it.
  seats: readonly { seatId: string; holderId: string | null; hasAlternate?: boolean }[];
  /// Committee.alternateMayVoteForRecused. Null: nobody has said. Only `false` is a
  /// usable answer today: the permissive value needs a per-matter stand-in while the
  /// holder is present, which is not built, so it is treated as unanswered.
  alternateMayVoteForRecused?: boolean | null;
  /// Who sits in which seat, from `presentVoters`.
  occupants: readonly Pick<Occupant, "seatId" | "personId">[];
  recusedIds: readonly string[];
  votes: readonly { personId: string; choice: VoteChoice }[];
  /// The outcome of the matter this one depends on, or null where it depends on none.
  dependencyOutcome: DecisionOutcome | null;
}

export interface MatterAssessment {
  canRecord: boolean;
  blockers: MatterBlocker[];
  quorum: QuorumAssessment;
  tally: VoteTally;
  /// What the votes come to under the committee's rule. Null while no rule is set or
  /// no vote is cast.
  computed: "CARRIED" | "NOT_CARRIED" | null;
  mandatory: boolean;
  /// People entitled to vote on this matter: present in a seat that votes on it, not
  /// recused. The count the quorum is judged on.
  entitledIds: string[];
  /// Recused members who are present. Absent recusals change nothing.
  recusedPresentIds: string[];
  /// Votes on record from someone not entitled on this matter, or ABSTAIN.
  ineligibleVoterIds: string[];
  /// Seats that do not vote on this matter because their holder is recused.
  excusedSeatIds: string[];
  /// Voting seats that no present, non-recused member covers.
  uncoveredSeatIds: string[];
  messageEn: string;
}

/// What the votes come to under a rule. A tie is never carried: nothing in the corpus
/// gives the chair a casting vote.
export function combine(rule: VotingRule, tally: VoteTally): "CARRIED" | "NOT_CARRIED" {
  if (rule === "UNANIMOUS") {
    return tally.cast > 0 && tally.setuju === tally.cast ? "CARRIED" : "NOT_CARRIED";
  }
  return tally.setuju > tally.tidakSetuju && tally.setuju > 0 ? "CARRIED" : "NOT_CARRIED";
}

export function assessMatter(i: MatterInput): MatterAssessment {
  const recused = new Set(i.recusedIds);
  const occupantsOf = new Map<string, string[]>();
  for (const o of i.occupants) occupantsOf.set(o.seatId, [...(occupantsOf.get(o.seatId) ?? []), o.personId]);

  // A recused holder's seat does not vote on the matter, whether or not the holder
  // attends: attendance must not decide whether a seat votes. Where an alternate could
  // cover that seat, whether they may vote in the holder's place is the committee's
  // policy; unanswered, the matter cannot be decided.
  const excusedSeatIds: string[] = [];
  let alternateQuestion = false;
  const entitled = new Set<string>();
  const uncoveredSeatIds: string[] = [];
  for (const seat of i.seats) {
    const occupants = occupantsOf.get(seat.seatId) ?? [];
    if (seat.holderId != null && recused.has(seat.holderId)) {
      excusedSeatIds.push(seat.seatId);
      if (seat.hasAlternate && i.alternateMayVoteForRecused !== false) alternateQuestion = true;
      continue;
    }
    if (occupants.length === 0) {
      uncoveredSeatIds.push(seat.seatId);
      continue;
    }
    // An alternate covering an absent holder who recuses personally leaves the seat
    // with nobody to vote: excused, not missing.
    const voters = occupants.filter((p) => !recused.has(p));
    if (voters.length === 0) excusedSeatIds.push(seat.seatId);
    for (const p of voters) entitled.add(p);
  }
  const entitledIds = [...entitled];
  const recusedPresentIds = [...new Set(i.occupants.map((o) => o.personId))].filter((p) => recused.has(p));

  const quorum = assessQuorum({ quorum: i.quorum, present: entitledIds.length });

  const eligible = i.votes.filter((v) => entitled.has(v.personId) && v.choice !== "ABSTAIN");
  const ineligibleVoterIds = i.votes
    .filter((v) => !entitled.has(v.personId) || v.choice === "ABSTAIN")
    .map((v) => v.personId);
  const ineligible = ineligibleVoterIds.length;
  const tally = tallyVotes(eligible, entitledIds.length);

  const mandatory = MANDATORY_ACTS.has(i.act);
  const blockers: MatterBlocker[] = [];
  if (!i.tabled) blockers.push("NOT_TABLED");
  if (i.dependencyOutcome === "PENDING" || i.dependencyOutcome === "DEFERRED") {
    blockers.push("DEPENDENCY_PENDING");
  }
  if (quorum.state === "UNCONFIGURED") blockers.push("QUORUM_UNCONFIGURED");
  if (quorum.state === "NOT_MET") blockers.push("QUORUM_NOT_MET");
  if (i.votingRule == null) blockers.push("VOTING_RULE_UNCONFIGURED");
  if (alternateQuestion) blockers.push("ALTERNATE_FOR_RECUSED_UNCONFIGURED");
  if (ineligible > 0) blockers.push("INELIGIBLE_VOTE");
  // Stricter than assessDecision: every present, non-recused voter votes (FR-CTE-005).
  if (tally.notVoted > 0 || tally.cast === 0) blockers.push("VOTES_OUTSTANDING");
  if (mandatory && uncoveredSeatIds.length > 0) blockers.push("MANDATORY_ACT_NOT_FULL_BODY");

  const computed = i.votingRule != null && tally.cast > 0 ? combine(i.votingRule, tally) : null;

  return {
    canRecord: blockers.length === 0,
    blockers,
    quorum,
    tally,
    computed,
    mandatory,
    entitledIds,
    recusedPresentIds,
    ineligibleVoterIds,
    excusedSeatIds,
    uncoveredSeatIds,
    messageEn: describe(blockers, quorum, tally, computed, uncoveredSeatIds.length),
  };
}

function describe(
  blockers: MatterBlocker[],
  quorum: QuorumAssessment,
  tally: VoteTally,
  computed: "CARRIED" | "NOT_CARRIED" | null,
  uncovered: number,
): string {
  const first = blockers[0];
  switch (first) {
    case undefined:
      return computed === "CARRIED"
        ? `Carried — ${tally.setuju} setuju, ${tally.tidakSetuju} tidak setuju.`
        : `Not carried — ${tally.setuju} setuju, ${tally.tidakSetuju} tidak setuju.`;
    case "NOT_TABLED":
      return "Not tabled yet. A holder of the Secretariat office must table the matter first.";
    case "DEPENDENCY_PENDING":
      return "Waits on another matter that has not been decided.";
    case "QUORUM_UNCONFIGURED":
      return "Cannot be certified: no quorum has been set for this committee.";
    case "QUORUM_NOT_MET":
      return `Cannot be recorded: ${quorum.messageEn.charAt(0).toLowerCase()}${quorum.messageEn.slice(1)}`;
    case "VOTING_RULE_UNCONFIGURED":
      return "Cannot be recorded: no voting rule has been set for this committee, and none is assumed.";
    case "ALTERNATE_FOR_RECUSED_UNCONFIGURED":
      return "A member with an alternate has recused on this matter, and the committee has not said whether an alternate may vote in a recused member's place. Set it in the committee's configuration.";
    case "INELIGIBLE_VOTE":
      return "A vote is on record from someone not entitled to vote on this matter. It is shown against the matter.";
    case "VOTES_OUTSTANDING":
      return tally.cast === 0
        ? "No votes recorded yet. Every present member votes before an outcome is recorded."
        : `${tally.notVoted} of ${tally.cast + tally.notVoted} present members have not voted.`;
    case "MANDATORY_ACT_NOT_FULL_BODY":
      return `Mandatory act: every voting seat, less recusals, must be present and vote. ${uncovered} ${uncovered === 1 ? "seat is" : "seats are"} not covered.`;
  }
}

// -------------------------------------------------------------------- outcomes

export interface OutcomeOption {
  id: string;
  /// Null offers it to every committee.
  committeeId: string | null;
  retiredOn: Date | null;
}

/// The not-approved outcomes a committee may choose from on a date.
export function outcomesOffered<T extends OutcomeOption>(all: readonly T[], committeeId: string, on: Date): T[] {
  return all.filter(
    (o) => (o.committeeId == null || o.committeeId === committeeId) && (o.retiredOn == null || o.retiredOn > on),
  );
}

export type OutcomeFault =
  | "MATTER_NOT_READY"
  | "OUTCOME_CONTRADICTS_VOTES"
  | "NO_OUTCOMES_CONFIGURED"
  | "OUTCOME_REQUIRED"
  | "OUTCOME_NOT_OFFERED"
  | "NOTE_REQUIRED";

/**
 * Whether a requested outcome may be recorded.
 *
 * DEFERRED is not a decision, so it needs neither quorum nor votes — only a note of
 * why. CARRIED and NOT_CARRIED must follow from the individual votes. NOT_CARRIED also
 * needs one of the committee's configured not-approved outcomes (ruling 5.5): with
 * none configured the matter waits, and so does the minute.
 */
export function checkOutcome(
  a: MatterAssessment,
  req: { outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED"; notApprovedOutcomeId: string | null; note: string },
  ctx: { outcomes: readonly OutcomeOption[]; committeeId: string; on: Date },
): { ok: true } | { ok: false; fault: OutcomeFault } {
  const note = req.note.trim();
  if (req.outcome === "DEFERRED") {
    return note ? { ok: true } : { ok: false, fault: "NOTE_REQUIRED" };
  }
  if (!a.canRecord) return { ok: false, fault: "MATTER_NOT_READY" };
  if (a.computed !== req.outcome) return { ok: false, fault: "OUTCOME_CONTRADICTS_VOTES" };
  if (req.outcome === "CARRIED") return { ok: true };

  const offered = outcomesOffered(ctx.outcomes, ctx.committeeId, ctx.on);
  if (offered.length === 0) return { ok: false, fault: "NO_OUTCOMES_CONFIGURED" };
  if (!req.notApprovedOutcomeId) return { ok: false, fault: "OUTCOME_REQUIRED" };
  if (!offered.some((o) => o.id === req.notApprovedOutcomeId)) {
    return { ok: false, fault: "OUTCOME_NOT_OFFERED" };
  }
  if (!note) return { ok: false, fault: "NOTE_REQUIRED" };
  return { ok: true };
}

// ------------------------------------------------------------------------ votes

export type VoteFault =
  | "INVALID_CHOICE"
  | "INVALID_DATE"
  | "ABSTAIN_REFUSED"
  | "DATE_IN_FUTURE"
  | "DATE_BEFORE_SITTING"
  | "MEETING_NOT_STARTED"
  | "MEETING_CLOSED"
  | "MATTER_NOT_TABLED"
  | "MATTER_DECIDED"
  | "NOT_A_PRESENT_VOTER"
  | "RECUSED";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Whether one member's vote may be recorded.
 *
 * Checked in this order: the input (400, ABSTAIN 422), the sitting and matter
 * (409), the sheet date (422), then who is voting (403).
 *
 * Only while the sitting is in progress: a scheduled sitting has no register yet, and
 * a minuted or cancelled one is frozen. Only from someone present and not recused on
 * this matter. SETUJU or TIDAK SETUJU only — ABSTAIN is refused (ruling 5.7), since
 * recusal already covers legitimate non-participation. The date is the one on the
 * signed sheet: not before the sitting, not after today. Dates compare as UTC days.
 */
export function canVote(i: {
  meetingStatus: MeetingStatus;
  meetingDate: Date;
  /// Today in the organisation's time zone, YYYY-MM-DD (`dayIn`).
  today: string;
  outcome: DecisionOutcome;
  tabled: boolean;
  personId: string;
  presentVoterIds: readonly string[];
  recusedIds: readonly string[];
  choice: string;
  votedAt: string;
}): { ok: true } | { ok: false; fault: VoteFault } {
  if (i.choice === "ABSTAIN") return { ok: false, fault: "ABSTAIN_REFUSED" };
  if (i.choice !== "SETUJU" && i.choice !== "TIDAK_SETUJU") return { ok: false, fault: "INVALID_CHOICE" };
  if (!DAY.test(i.votedAt) || Number.isNaN(new Date(`${i.votedAt}T00:00:00Z`).getTime())) {
    return { ok: false, fault: "INVALID_DATE" };
  }
  // The sitting's state before the sheet date: on a sitting not yet held, every date
  // would read as before it, which misstates why the vote is refused.
  if (i.meetingStatus === "SCHEDULED") return { ok: false, fault: "MEETING_NOT_STARTED" };
  if (i.meetingStatus !== "IN_PROGRESS") return { ok: false, fault: "MEETING_CLOSED" };
  if (i.outcome !== "PENDING") return { ok: false, fault: "MATTER_DECIDED" };
  if (!i.tabled) return { ok: false, fault: "MATTER_NOT_TABLED" };

  if (i.votedAt > i.today) return { ok: false, fault: "DATE_IN_FUTURE" };
  if (i.votedAt < dayOf(i.meetingDate)) return { ok: false, fault: "DATE_BEFORE_SITTING" };

  if (i.recusedIds.includes(i.personId)) return { ok: false, fault: "RECUSED" };
  if (!i.presentVoterIds.includes(i.personId)) return { ok: false, fault: "NOT_A_PRESENT_VOTER" };
  return { ok: true };
}

/// The HTTP status the votes route answers each refusal with.
export const VOTE_FAULT_STATUS: Record<VoteFault, 400 | 403 | 409 | 422> = {
  INVALID_CHOICE: 400,
  INVALID_DATE: 400,
  ABSTAIN_REFUSED: 422,
  DATE_IN_FUTURE: 422,
  DATE_BEFORE_SITTING: 422,
  MEETING_NOT_STARTED: 409,
  MEETING_CLOSED: 409,
  MATTER_NOT_TABLED: 409,
  MATTER_DECIDED: 409,
  NOT_A_PRESENT_VOTER: 403,
  RECUSED: 403,
};

// --------------------------------------------------------------- recusal

export type RecusalFault =
  | "SITTING_CLOSED"
  | "MATTER_DECIDED"
  | "NOT_A_VOTING_MEMBER"
  | "ALREADY_RECUSED"
  | "ALREADY_VOTED";

/**
 * Whether a member may declare a recusal on a matter.
 *
 * Open before and during the sitting (ruling §8.2), never once minuted or cancelled,
 * never on a decided matter. Only a voting member or an alternate. Declared before
 * voting (§8.6): a vote cannot be withdrawn, so a recusal after it would leave a vote
 * on record from someone not entitled.
 */
export function checkRecusal(i: {
  meetingStatus: MeetingStatus;
  outcome: DecisionOutcome;
  role: "VOTING" | "ALTERNATE" | "NON_VOTING" | "CONTESTED" | "NOT_A_MEMBER";
  alreadyRecused: boolean;
  hasVoted: boolean;
}): { ok: true } | { ok: false; fault: RecusalFault } {
  if (i.meetingStatus === "MINUTED" || i.meetingStatus === "CANCELLED") return { ok: false, fault: "SITTING_CLOSED" };
  if (i.outcome !== "PENDING") return { ok: false, fault: "MATTER_DECIDED" };
  if (i.role !== "VOTING" && i.role !== "ALTERNATE") return { ok: false, fault: "NOT_A_VOTING_MEMBER" };
  if (i.alreadyRecused) return { ok: false, fault: "ALREADY_RECUSED" };
  if (i.hasVoted) return { ok: false, fault: "ALREADY_VOTED" };
  return { ok: true };
}
