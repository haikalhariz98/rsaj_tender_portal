/**
 * Quorum and vote arithmetic.
 *
 * Pure, like the DAL resolver: it takes a committee's configuration and a sitting,
 * and says whether the sitting could lawfully decide. No database.
 *
 * The governing constraint comes from specification §5.2: committee composition and
 * quorum are, with two exceptions, *not defined anywhere in the corpus*. So the
 * honest states are three, not two — met, not met, and **not knowable because nobody
 * has ever written the rule down**. Collapsing the third into either of the others
 * is how a system ends up asserting a compliance it cannot support.
 */

export type VoteChoice = "SETUJU" | "TIDAK_SETUJU" | "ABSTAIN";

export type QuorumState = "MET" | "NOT_MET" | "UNCONFIGURED";

export interface QuorumAssessment {
  state: QuorumState;
  /// Null when the corpus states no quorum for this body.
  required: number | null;
  present: number;
  /// How many more attendees are needed. Null when there is no configured quorum.
  shortfall: number | null;
  messageEn: string;
}

export interface AssessQuorumInput {
  /// Null means no quorum is stated for this body. Not zero.
  quorum: number | null;
  /// Number of members recorded as present.
  present: number;
}

export function assessQuorum({ quorum, present }: AssessQuorumInput): QuorumAssessment {
  if (quorum == null) {
    return {
      state: "UNCONFIGURED",
      required: null,
      present,
      shortfall: null,
      messageEn:
        "No quorum has been set for this committee. " +
        "Sittings cannot be certified as quorate until one is.",
    };
  }

  const shortfall = Math.max(0, quorum - present);

  return {
    state: shortfall === 0 ? "MET" : "NOT_MET",
    required: quorum,
    present,
    shortfall,
    messageEn:
      shortfall === 0
        ? `Quorate — ${present} of ${quorum} required members present.`
        : `Not quorate — ${present} of ${quorum} required members present, ${shortfall} short.`,
  };
}

export interface VoteTally {
  setuju: number;
  tidakSetuju: number;
  abstain: number;
  /// Members entitled to vote who have not recorded one.
  notVoted: number;
  cast: number;
  /// True only where a simple majority of votes cast were in favour AND at least one
  /// vote was cast. A tie is not carried: nothing in the corpus gives the chair a
  /// casting vote, so the system must not invent one.
  carried: boolean;
}

export function tallyVotes(
  votes: { choice: VoteChoice }[],
  entitledCount: number,
): VoteTally {
  const setuju = votes.filter((v) => v.choice === "SETUJU").length;
  const tidakSetuju = votes.filter((v) => v.choice === "TIDAK_SETUJU").length;
  const abstain = votes.filter((v) => v.choice === "ABSTAIN").length;
  const cast = setuju + tidakSetuju + abstain;

  return {
    setuju,
    tidakSetuju,
    abstain,
    notVoted: Math.max(0, entitledCount - cast),
    cast,
    carried: setuju > tidakSetuju && setuju > 0,
  };
}

export type DecisionBlocker =
  | "QUORUM_NOT_MET"
  | "QUORUM_UNCONFIGURED"
  | "NO_VOTES_CAST"
  | "MEMBERS_OUTSTANDING";

export interface DecisionReadiness {
  canRecord: boolean;
  blockers: DecisionBlocker[];
  quorum: QuorumAssessment;
  tally: VoteTally;
  /// True where the act is MR or MJR — the recommendation is mandatory and
  /// non-delegable, so the body itself must record it and no one may proceed without.
  mandatory: boolean;
  messageEn: string;
}

/// Acts a committee cannot discharge with part of its body (MR, MJR, MA). The one
/// definition: the badge, the decision rule and the matter rule all read it.
export const MANDATORY_ACTS: ReadonlySet<string> = new Set(["MR", "MJR", "MA"]);

/**
 * Whether a committee decision may be recorded as final.
 *
 * A mandatory recommendation is held to a stricter standard: every entitled member
 * must have voted, because a mandatory step that half the body never saw is not a
 * recommendation the DAL would recognise.
 */
export function assessDecision(input: {
  act: string;
  quorum: number | null;
  present: number;
  entitledCount: number;
  votes: { choice: VoteChoice }[];
}): DecisionReadiness {
  const quorum = assessQuorum({ quorum: input.quorum, present: input.present });
  const tally = tallyVotes(input.votes, input.entitledCount);
  const mandatory = MANDATORY_ACTS.has(input.act);

  const blockers: DecisionBlocker[] = [];
  if (quorum.state === "NOT_MET") blockers.push("QUORUM_NOT_MET");
  if (quorum.state === "UNCONFIGURED") blockers.push("QUORUM_UNCONFIGURED");
  if (tally.cast === 0) blockers.push("NO_VOTES_CAST");
  if (mandatory && tally.notVoted > 0) blockers.push("MEMBERS_OUTSTANDING");

  return {
    canRecord: blockers.length === 0,
    blockers,
    quorum,
    tally,
    mandatory,
    messageEn: describe(blockers, tally, mandatory),
  };
}

function describe(blockers: DecisionBlocker[], tally: VoteTally, mandatory: boolean): string {
  if (blockers.length === 0) {
    return tally.carried
      ? `Carried — ${tally.setuju} setuju, ${tally.tidakSetuju} tidak setuju.`
      : `Not carried — ${tally.setuju} setuju, ${tally.tidakSetuju} tidak setuju.`;
  }
  if (blockers.includes("QUORUM_UNCONFIGURED")) {
    return "Cannot be certified: no quorum has been set for this committee.";
  }
  if (blockers.includes("QUORUM_NOT_MET")) {
    return "Cannot be recorded: the sitting is not quorate.";
  }
  if (blockers.includes("NO_VOTES_CAST")) {
    return "No votes recorded yet.";
  }
  if (blockers.includes("MEMBERS_OUTSTANDING")) {
    return mandatory
      ? `Mandatory recommendation: all members must vote. ${tally.notVoted} outstanding.`
      : `${tally.notVoted} members have not voted.`;
  }
  return "Not ready.";
}

export type QuorumFault = "QUORUM_EXCEEDS_VOTING_SEATS";

/**
 * What is wrong with a quorum as configured.
 *
 * A quorum larger than the number of voting seats can never be met: every sitting
 * would be inquorate however many attend. Reported, never repaired — which number is
 * wrong is the organisation's question. An unset quorum is not a fault here; it is
 * its own state, and `assessQuorum` already refuses to certify under it.
 */
export function quorumFaults(i: { quorum: number | null; votingSeats: number }): QuorumFault[] {
  if (i.quorum == null) return [];
  return i.quorum > i.votingSeats ? ["QUORUM_EXCEEDS_VOTING_SEATS"] : [];
}
