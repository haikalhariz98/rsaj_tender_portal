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

export const CHOICE_LABEL: Record<string, string> = {
  SETUJU: "Setuju",
  TIDAK_SETUJU: "Tidak Setuju",
  ABSTAIN: "Abstain",
};

export const BLOCKER_LABEL: Record<MatterBlocker, string> = {
  NOT_TABLED: "Not tabled",
  DEPENDENCY_PENDING: "Waits on another matter",
  QUORUM_UNCONFIGURED: "Quorum not set",
  QUORUM_NOT_MET: "Not quorate",
  VOTING_RULE_UNCONFIGURED: "Voting rule not set",
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
};

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
  NOT_A_PRESENT_VOTER: "That person is not recorded as a present voting member of this sitting.",
  RECUSED: "That member has declared a recusal on this matter.",
};

export const TABLING_FAULT_MESSAGE: Record<TablingFault, string> = {
  SECRETARIAT_NOT_SET:
    "No Secretariat office is set for this committee, so nobody may table a matter. Set one in the committee's configuration.",
  NOT_TABLED: "Choose who tabled the matter.",
  NOT_SECRETARIAT_HOLDER: "That person does not hold the Secretariat office on the tabling date.",
};

export const TRANSITION_FAULT_MESSAGE: Record<TransitionFault, string> = {
  NOT_ALLOWED: "A sitting cannot move to that status from where it is.",
  MINUTES_REQUIRED: "Write the minutes before the sitting is minuted.",
  MATTERS_PENDING: "Every matter must be decided or deferred before the sitting is minuted.",
  REASON_REQUIRED: "Say why the sitting is cancelled.",
  MATTERS_DECIDED: "A sitting that has decided a matter cannot be cancelled.",
};
