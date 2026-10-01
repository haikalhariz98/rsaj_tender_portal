/**
 * How committee codes read on a screen.
 *
 * Statuses, blockers, faults and kinds are configuration keys; none of them may
 * reach a screen as written. One place, so a blocker reads the same on the sitting,
 * the matter and the route's error.
 */

import type { AttendanceFault } from "./sitting";
import type { MatterBlocker, OutcomeFault, VoteFault } from "./matter";
import type { TablingFault } from "./tabling";
import type { TransitionFault } from "./meeting";

export const MEETING_STATUS_LABEL = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  MINUTED: "Minuted",
  CANCELLED: "Cancelled",
} as const;

export const MEETING_STATUS_TONE = {
  SCHEDULED: "info",
  IN_PROGRESS: "brand",
  MINUTED: "ok",
  CANCELLED: "neutral",
} as const;

export const OUTCOME_LABEL = {
  PENDING: "Pending",
  CARRIED: "Carried",
  NOT_CARRIED: "Not carried",
  DEFERRED: "Deferred",
} as const;

export const OUTCOME_TONE = {
  PENDING: "warn",
  CARRIED: "ok",
  NOT_CARRIED: "err",
  DEFERRED: "neutral",
} as const;

export const VOTING_RULE_LABEL = {
  SIMPLE_MAJORITY: "Simple majority of votes cast",
  UNANIMOUS: "Unanimous",
} as const;

export const NOT_APPROVED_KIND_LABEL = {
  LOOP: "Returns the matter",
  TERMINAL: "Ends the matter",
} as const;

/// The closed set of record kinds a matter can concern (ruling 5.3).
export const MATTER_KIND_LABEL = {
  REQUISITION: "Requisition",
  EXERCISE: "Sourcing exercise",
  LATE_TENDER: "Late tender admission",
  CONTRACT: "Contract",
  VARIATION: "Variation",
} as const;

export type MatterKind = keyof typeof MATTER_KIND_LABEL;
export const MATTER_KINDS = Object.keys(MATTER_KIND_LABEL) as MatterKind[];

export const POSITION_LABEL = {
  CHAIRMAN: "Chairman",
  DEPUTY_CHAIRMAN: "Deputy Chairman",
  MEMBER: "Member",
  SECRETARY: "Secretary",
} as const;

/// A vote, in English, with the Malay term the member signs on the sheet.
export const VOTE_LABEL = {
  SETUJU: { en: "Agree", ms: "Setuju" },
  TIDAK_SETUJU: { en: "Disagree", ms: "Tidak setuju" },
} as const;

export const CHOICE_LABEL: Record<string, string> = {
  SETUJU: "Agree (Setuju)",
  TIDAK_SETUJU: "Disagree (Tidak setuju)",
  ABSTAIN: "Abstain",
};

/// What a committee does when it sits, as a noun, matching the act labels
/// ("Recommendation" beside "Mandatory recommendation").
export const COMMITTEE_ACTION_LABEL: Record<string, string> = {
  APPROVES: "Approval",
  RECOMMENDS: "Recommendation",
  CONSENTS: "Consent",
  DECIDES: "Decision",
};

/// Tabled and pending counts, worded one way on every screen.
export function matterCount(tabled: number, pending: number): string {
  return tabled === 0 ? "None tabled" : `${tabled} tabled · ${pending} pending`;
}

export const BLOCKER_LABEL: Record<MatterBlocker, string> = {
  SITTING_NOT_STARTED: "Sitting not started",
  NOT_TABLED: "Not tabled",
  DEPENDENCY_PENDING: "Waits on another matter",
  QUORUM_UNCONFIGURED: "Quorum not set",
  QUORUM_NOT_MET: "Not quorate",
  VOTING_RULE_UNCONFIGURED: "Voting rule not set",
  ALTERNATE_FOR_RECUSED_UNCONFIGURED: "Alternates for recused members not set",
  INELIGIBLE_VOTE: "Vote from someone not entitled",
  VOTES_OUTSTANDING: "Votes outstanding",
  MANDATORY_ACT_NOT_FULL_BODY: "Full body required",
};

export const ATTENDANCE_FAULT_MESSAGE: Record<AttendanceFault, string> = {
  NOT_A_MEMBER: "does not hold a seat on this committee on the sitting date.",
  STAND_IN_FOR_CHAIR: "cannot stand in for the chair. Nobody substitutes for the chairman.",
  STAND_IN_WHILE_HOLDER_PRESENT: "is standing in for a seat whose holder is present.",
  ALTERNATE_NOT_FOR_THAT_SEAT: "is not an alternate for that seat.",
  SEAT_COVERED_TWICE: "is standing in for a seat another alternate already covers.",
  OFFICE_CONTESTED:
    "holds an office that has more than one holder on the sitting date. Fix the role assignments under Configuration, Users & roles, Roles; the system will not pick one.",
};

/// Where contested office assignments are fixed.
export const ROLE_ASSIGNMENTS_HREF = "/configuration/users?tab=roles";

/**
 * An attendance fault as a sentence about one person. A contested office names the
 * office and its competing holders, so the fix is findable.
 */
export function attendanceFaultText(
  name: string,
  fault: AttendanceFault,
  contested?: { office: string | null; holders: string[] },
): string {
  if (fault === "OFFICE_CONTESTED" && contested) {
    return `${name} holds the office of ${contested.office ?? "an office"}, which ${contested.holders.join(" and ")} both hold on the sitting date. Fix the conflicting role assignment under Configuration, Users & roles, Roles; the system will not pick one.`;
  }
  return `${name} ${ATTENDANCE_FAULT_MESSAGE[fault]}`;
}

/// The notification event a matter not carried will raise once delivery exists. A
/// NotificationRule may be configured for it now; nothing is sent (FR-CTE-009).
export const NOT_CARRIED_EVENT_KEY = "committee_matter_not_carried";

export const OUTCOME_FAULT_MESSAGE: Record<OutcomeFault, string> = {
  MATTER_NOT_READY: "The matter cannot be decided yet. Clear what blocks it first.",
  OUTCOME_CONTRADICTS_VOTES: "That outcome does not follow from the votes recorded.",
  NO_OUTCOMES_CONFIGURED:
    "No not-approved outcome is configured for this committee, so a matter voted down cannot be recorded. Configure one under Configuration, Committees, Not-approved outcomes.",
  OUTCOME_REQUIRED: "Choose what happens to the matter next.",
  OUTCOME_NOT_OFFERED: "That outcome is retired or not offered to this committee.",
  NOTE_REQUIRED: "Say why, in a note.",
};

export const VOTE_FAULT_MESSAGE: Record<VoteFault, string> = {
  INVALID_CHOICE: "The vote must be Setuju or Tidak Setuju.",
  INVALID_DATE: "The date on the voting sheet must be a date (YYYY-MM-DD).",
  ABSTAIN_REFUSED:
    "Abstention is not recorded. A member who cannot take part declares a recusal instead.",
  DATE_IN_FUTURE: "The date on the voting sheet cannot be after today.",
  DATE_BEFORE_SITTING: "The date on the voting sheet cannot be before the sitting.",
  MEETING_NOT_STARTED: "The sitting has not started. Start it before recording votes.",
  MEETING_CLOSED: "The sitting is closed. Votes can no longer change.",
  MATTER_NOT_TABLED: "The matter has not been tabled.",
  MATTER_DECIDED: "The matter has already been decided.",
  MATTER_WITHDRAWN: "The matter was withdrawn from the agenda: nothing is recorded on it.",
  TIME_ZONE_UNSET:
    "The organisation's time zone is not set, so the date on a voting sheet cannot be judged. Set it under Configuration, Organisation.",
  NOT_A_PRESENT_VOTER: "That person is not recorded as a present voting member of this sitting.",
  RECUSED: "That member has declared a recusal on this matter.",
};

export const TABLING_FAULT_MESSAGE: Record<TablingFault, string> = {
  SECRETARIAT_NOT_SET:
    "No Secretariat office is set for this committee, so nobody may table a matter. Set one in the committee's configuration.",
  NOT_TABLED: "Choose who tabled the matter.",
  NOT_SECRETARIAT_HOLDER: "That person does not hold the Secretariat office on the tabling date.",
  TIME_ZONE_UNSET:
    "The organisation's time zone is not set, so the tabling day cannot be judged. Set it under Configuration, Organisation.",
};

export const TRANSITION_FAULT_MESSAGE: Record<TransitionFault, string> = {
  NOT_ALLOWED: "A sitting cannot move to that status from where it is.",
  MINUTES_REQUIRED: "Write the minutes before the sitting is minuted.",
  MATTERS_PENDING: "Every matter must be decided or deferred before the sitting is minuted.",
  REASON_REQUIRED: "Say why the sitting is cancelled.",
  MATTERS_DECIDED: "A sitting that has decided a matter cannot be cancelled.",
  NOT_YET_DUE: "A sitting cannot start before the day it is dated.",
  TIME_ZONE_UNSET:
    "The organisation's time zone is not set, so whether the sitting's day has come cannot be judged. Set it under Configuration, Organisation.",
  REGISTER_FAULTS: "The register has faults. Correct the attendance before the sitting is minuted.",
  DECISION_NO_LONGER_HOLDS:
    "A decided matter no longer follows from the register and the votes. Correct it before the sitting is minuted.",
};

/**
 * Why a matter cannot be decided, in a few words, for beside a disabled control.
 * The first blocker only: it is the one to clear next.
 */
export function blockerShort(a: {
  blockers: readonly MatterBlocker[];
  quorum: { shortfall: number | null };
  tally: { notVoted: number; cast: number };
}): string | null {
  const b = a.blockers[0];
  if (!b) return null;
  switch (b) {
    case "SITTING_NOT_STARTED":
      return "The sitting has not started";
    case "QUORUM_NOT_MET": {
      const n = a.quorum.shortfall ?? 0;
      return `Needs ${n} more voting ${n === 1 ? "member" : "members"} present`;
    }
    case "VOTES_OUTSTANDING":
      return a.tally.cast === 0
        ? "No votes recorded yet"
        : `${a.tally.notVoted} ${a.tally.notVoted === 1 ? "vote" : "votes"} outstanding`;
    case "QUORUM_UNCONFIGURED":
      return "The committee's quorum is not set";
    case "VOTING_RULE_UNCONFIGURED":
      return "The committee's voting rule is not set";
    case "ALTERNATE_FOR_RECUSED_UNCONFIGURED":
      return "Whether an alternate may vote for a recused member is not set";
    case "NOT_TABLED":
      return "Not tabled";
    case "DEPENDENCY_PENDING":
      return "Waits on another matter";
    case "INELIGIBLE_VOTE":
      return "A vote on record does not count";
    case "MANDATORY_ACT_NOT_FULL_BODY":
      return "The full voting body must be present";
  }
}

/// Where the committee's own configuration makes a matter undecidable, one sentence
/// for the matter rather than a list of tags.
export function configurationGapLine(blockers: readonly MatterBlocker[]): string | null {
  const q = blockers.includes("QUORUM_UNCONFIGURED");
  const r = blockers.includes("VOTING_RULE_UNCONFIGURED");
  if (q && r) return "Can't be decided until the committee's quorum and voting rule are set.";
  if (q) return "Can't be decided until the committee's quorum is set.";
  if (r) return "Can't be decided until the committee's voting rule is set.";
  return null;
}

/// Where the organisation's time zone is set.
export const ORGANISATION_HREF = "/configuration/organisation";

/// Why a matter cannot be withdrawn from the agenda (6.10 follow-up).
export const WITHDRAW_FAULT_MESSAGE: Record<import("./matter").WithdrawFault, string> = {
  ALREADY_WITHDRAWN: "This matter is already withdrawn.",
  SITTING_STARTED: "The sitting has opened. A matter is withdrawn only before it opens; now it is deferred, with a note.",
  MATTER_DECIDED: "The matter has been decided, so it stays on the agenda.",
  MATTER_CITED: "A record cites this matter, so it stays on the agenda. Defer it at the sitting instead, with a note.",
  HAS_DEPENDENTS: "Another matter on the agenda waits on this one, so it stays. Withdraw that matter first, or defer this one at the sitting.",
  REASON_REQUIRED: "Say why it is withdrawn.",
};

// ------------------------------------------------------------ signed minutes (FR-CTE-004)

export type SignedMinutesState = "ATTACHED" | "OUTSTANDING" | "AFTER_MINUTING" | "CANCELLED";

/**
 * Where a sitting's signed minutes stand. They are attached once it is minuted (signing
 * follows minuting, so minuting does not wait on them); a minuted sitting without a live
 * signed copy shows it outstanding.
 */
export function signedMinutesState(status: string, liveSignedCopies: number): SignedMinutesState {
  if (status === "CANCELLED") return "CANCELLED";
  if (status !== "MINUTED") return "AFTER_MINUTING";
  return liveSignedCopies > 0 ? "ATTACHED" : "OUTSTANDING";
}

export const SIGNED_MINUTES_LABEL: Record<SignedMinutesState, string> = {
  ATTACHED: "Signed copy attached",
  OUTSTANDING: "Signed copy outstanding",
  AFTER_MINUTING: "Attached once the sitting is minuted",
  CANCELLED: "None: the sitting was cancelled",
};

export const SIGNED_MINUTES_TONE: Record<SignedMinutesState, "ok" | "warn" | "neutral"> = {
  ATTACHED: "ok",
  OUTSTANDING: "warn",
  AFTER_MINUTING: "neutral",
  CANCELLED: "neutral",
};

/// The gate card's line on a cited decision's sitting (FR-REQ-012).
export const GATE_MINUTES_NOTE: Record<SignedMinutesState, string> = {
  ATTACHED: "minutes recorded as text, signed copy attached",
  OUTSTANDING: "minutes recorded as text, signed copy outstanding",
  AFTER_MINUTING: "minutes recorded as text, signed copy attached once minuted",
  CANCELLED: "the sitting was cancelled",
};

export const MINUTES_EDITOR_DESCRIPTION = "The minutes as text. The signed copy is attached to the sitting once it is minuted.";
