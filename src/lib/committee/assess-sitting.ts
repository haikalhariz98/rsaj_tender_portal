/**
 * One sitting, assessed as a whole: who sits in which seat, what is wrong with the
 * register, and where each matter stands.
 *
 * Pure. The screen, the server actions and the votes route all call this, so the
 * rule a member sees on the page is the rule the write enforces.
 */

import type { Roster } from "@/lib/people/roster";

import { assessMatter, type DecisionOutcome, type MatterAssessment, type VotingRule } from "./matter";
import type { VoteChoice } from "./quorum";
import {
  alternatesOn,
  nonVotingMembersOn,
  presentVoters,
  votingSeatsOn,
  type AlternateSeat,
  type AttendanceRecord,
  type PresentVoters,
  type Seat,
  type VotingSeat,
} from "./sitting";

export interface SittingMatter {
  id: string;
  act: string;
  tabled: boolean;
  outcome: DecisionOutcome;
  dependencyOutcome: DecisionOutcome | null;
  recusedIds: string[];
  votes: { personId: string; choice: VoteChoice }[];
}

export interface SittingAssessment {
  voting: VotingSeat[];
  alternates: AlternateSeat[];
  nonVotingMemberIds: string[];
  present: PresentVoters;
  matters: Record<string, MatterAssessment>;
}

export function assessSitting(i: {
  meetingDate: Date;
  seats: readonly Seat[];
  roster: Roster;
  quorum: number | null;
  votingRule: VotingRule | null;
  attendance: readonly AttendanceRecord[];
  matters: readonly SittingMatter[];
}): SittingAssessment {
  const on = i.meetingDate;
  const voting = votingSeatsOn(i.seats, i.roster, on);
  const alternates = alternatesOn(i.seats, i.roster, on);
  const nonVotingMemberIds = nonVotingMembersOn(i.seats, i.roster, on);
  const present = presentVoters({ voting, alternates, nonVotingMemberIds, attendance: i.attendance });

  const matters: Record<string, MatterAssessment> = {};
  for (const m of i.matters) {
    matters[m.id] = assessMatter({
      quorum: i.quorum,
      votingRule: i.votingRule,
      act: m.act,
      tabled: m.tabled,
      seats: voting.map((s) => ({ seatId: s.seatId, holderId: s.personId })),
      occupants: present.occupants,
      recusedIds: m.recusedIds,
      votes: m.votes,
      dependencyOutcome: m.dependencyOutcome,
    });
  }

  return { voting, alternates, nonVotingMemberIds, present, matters };
}
