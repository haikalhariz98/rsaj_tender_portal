/**
 * One sitting, assessed as a whole: who sits in which seat, what is wrong with the
 * register, and where each matter stands.
 *
 * Pure. The screen, the server actions and the votes route all call this, so the
 * rule a member sees on the page is the rule the write enforces.
 *
 * The register is resolved once (`resolveRegister`) and can be frozen as a snapshot
 * when the sitting is minuted: a minuted sitting is then assessed from the snapshot
 * (`assessFromRegister`), never from today's seats, roster or quorum.
 */

import type { Roster } from "@/lib/people/roster";

import { assessMatter, type DecisionOutcome, type MatterAssessment, type MeetingStatus, type VotingRule } from "./matter";
import type { VoteChoice } from "./quorum";
import {
  alternatesOn,
  nonVotingMembersOn,
  presentVoters,
  seatHasAlternate,
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
  /// A decided matter is judged on the quorum and rule it was recorded under. Absent,
  /// the committee's current ones apply.
  snapshot?: {
    quorum: number | null;
    votingRule: VotingRule | null;
    /// The committee's answer on alternates for recused members, as it stood when
    /// the matter was decided. Later edits to the committee do not rewrite it.
    alternateMayVoteForRecused: boolean | null;
  };
}

/// The register: every seat resolved, and who sat where. JSON-safe, so it can be
/// stored as the minuted sitting's snapshot.
export interface Register {
  voting: VotingSeat[];
  alternates: AlternateSeat[];
  nonVotingMemberIds: string[];
  present: PresentVoters;
}

export interface SittingRules {
  quorum: number | null;
  votingRule: VotingRule | null;
  alternateMayVoteForRecused: boolean | null;
}

export interface SittingAssessment extends Register {
  matters: Record<string, MatterAssessment>;
  /// False while the sitting has not started (SCHEDULED): no register has been taken,
  /// so "0 of N present" would read as a shortfall that is not one.
  registerTaken: boolean;
}

export function resolveRegister(i: {
  meetingDate: Date;
  seats: readonly Seat[];
  roster: Roster;
  attendance: readonly AttendanceRecord[];
}): Register {
  const on = i.meetingDate;
  const voting = votingSeatsOn(i.seats, i.roster, on);
  const alternates = alternatesOn(i.seats, i.roster, on);
  const nonVotingMemberIds = nonVotingMembersOn(i.seats, i.roster, on);
  const present = presentVoters({ voting, alternates, nonVotingMemberIds, attendance: i.attendance });
  return { voting, alternates, nonVotingMemberIds, present };
}

/// The register with a different attendance, for checking a change before it is made.
export function withAttendance(r: Register, attendance: readonly AttendanceRecord[]): Register {
  return { ...r, present: presentVoters({ ...r, attendance }) };
}

/// `status` is the sitting's; absent, it is taken to be open (the write paths, which
/// only run on a sitting in progress). It is never part of `SittingRules`, which are
/// frozen into the minuted snapshot.
export function assessFromRegister(
  register: Register,
  rules: SittingRules,
  matters: readonly SittingMatter[],
  status?: MeetingStatus,
): SittingAssessment {
  const seats = register.voting.map((s) => ({
    seatId: s.seatId,
    holderId: s.personId,
    hasAlternate: seatHasAlternate(s, register.alternates),
  }));
  const out: Record<string, MatterAssessment> = {};
  for (const m of matters) {
    out[m.id] = assessMatter({
      quorum: m.snapshot ? m.snapshot.quorum : rules.quorum,
      votingRule: m.snapshot ? m.snapshot.votingRule : rules.votingRule,
      alternateMayVoteForRecused: m.snapshot ? m.snapshot.alternateMayVoteForRecused : rules.alternateMayVoteForRecused,
      act: m.act,
      tabled: m.tabled,
      seats,
      occupants: register.present.occupants,
      recusedIds: m.recusedIds,
      votes: m.votes,
      dependencyOutcome: m.dependencyOutcome,
      sittingStatus: status,
    });
  }
  return { ...register, matters: out, registerTaken: status !== "SCHEDULED" };
}

export function assessSitting(i: {
  meetingDate: Date;
  seats: readonly Seat[];
  roster: Roster;
  quorum: number | null;
  votingRule: VotingRule | null;
  alternateMayVoteForRecused?: boolean | null;
  attendance: readonly AttendanceRecord[];
  matters: readonly SittingMatter[];
  status?: MeetingStatus;
}): SittingAssessment {
  return assessFromRegister(
    resolveRegister(i),
    { quorum: i.quorum, votingRule: i.votingRule, alternateMayVoteForRecused: i.alternateMayVoteForRecused ?? null },
    i.matters,
    i.status,
  );
}

/// A decided matter that no longer follows from the register and its votes.
export function decisionHolds(m: SittingMatter, a: MatterAssessment): boolean {
  if (m.outcome !== "CARRIED" && m.outcome !== "NOT_CARRIED") return true;
  return a.canRecord && a.computed === m.outcome;
}

export interface AttendanceChangeCheck {
  ok: boolean;
  /// Register faults the change would create, for anyone.
  newFaults: PresentVoters["faults"];
  /// Votes on record that the change would make ineligible, on any matter.
  newlyIneligible: { matterId: string; personId: string }[];
  /// Decided matters that would no longer follow from the register.
  brokenDecisions: string[];
}

/**
 * Whether an attendance change may be made (send-backs 8.6 and review 2).
 *
 * Refused where it would create a register fault for anyone — not only the person
 * changed — where it would make a vote already on record ineligible on any matter
 * (a vote cannot be withdrawn), or where a decided matter would no longer follow from
 * the register. A change that removes a fault is always allowed.
 */
export function checkAttendanceChange(
  register: Register,
  rules: SittingRules,
  matters: readonly SittingMatter[],
  proposed: readonly AttendanceRecord[],
): AttendanceChangeCheck {
  return checkRegisterChange(register, withAttendance(register, proposed), rules, matters);
}

/**
 * Whether a register may change from `beforeRegister` to `afterRegister` under a
 * sitting in progress — through its attendance, or through a seat or role
 * assignment that re-resolves who holds a seat on the sitting date (send-back 9.4).
 * The same three refusals: no new fault for anyone, no vote on record made
 * ineligible, no decided matter broken.
 */
export function checkRegisterChange(
  beforeRegister: Register,
  afterRegister: Register,
  rules: SittingRules,
  matters: readonly SittingMatter[],
): AttendanceChangeCheck {
  const before = assessFromRegister(beforeRegister, rules, matters);
  const after = assessFromRegister(afterRegister, rules, matters);

  const key = (f: { personId: string; fault: string }) => `${f.personId}|${f.fault}`;
  const had = new Set(before.present.faults.map(key));
  const newFaults = after.present.faults.filter((f) => !had.has(key(f)));

  const newlyIneligible: AttendanceChangeCheck["newlyIneligible"] = [];
  const brokenDecisions: string[] = [];
  for (const m of matters) {
    const was = new Set(before.matters[m.id].ineligibleVoterIds);
    for (const p of after.matters[m.id].ineligibleVoterIds) {
      if (!was.has(p)) newlyIneligible.push({ matterId: m.id, personId: p });
    }
    if (decisionHolds(m, before.matters[m.id]) && !decisionHolds(m, after.matters[m.id])) brokenDecisions.push(m.id);
  }

  return {
    ok: newFaults.length === 0 && newlyIneligible.length === 0 && brokenDecisions.length === 0,
    newFaults,
    newlyIneligible,
    brokenDecisions,
  };
}

/**
 * Whether a recusal may be declared (acceptance send-back 1).
 *
 * Not only "has this person voted": a holder's recusal excuses their seat, so an
 * alternate who has already voted in it would lose their vote. The matter is assessed
 * with and without the recusal, and any vote on it that would stop counting refuses
 * the recusal — the same before/after comparison attendance uses.
 */
export function checkRecusalChange(
  register: Register,
  rules: SittingRules,
  matter: SittingMatter,
  personId: string,
): { ok: boolean; newlyIneligible: string[] } {
  const before = assessFromRegister(register, rules, [matter]).matters[matter.id];
  const after = assessFromRegister(register, rules, [{ ...matter, recusedIds: [...matter.recusedIds, personId] }]).matters[
    matter.id
  ];
  const was = new Set(before.ineligibleVoterIds);
  const newlyIneligible = after.ineligibleVoterIds.filter((p) => !was.has(p));
  return { ok: newlyIneligible.length === 0, newlyIneligible };
}

/// What stops the sitting being minuted beyond the lifecycle rule itself.
export function minutingChecks(a: SittingAssessment, matters: readonly SittingMatter[]) {
  return {
    registerFaults: a.present.faults.length,
    brokenDecisions: matters.filter((m) => !decisionHolds(m, a.matters[m.id])).length,
  };
}

/// The snapshot stored on a minuted sitting.
export interface RegisterSnapshot {
  version: 1;
  register: Register;
  rules: SittingRules & { votingRuleProvenance: string | null };
  committeeName: string;
  /// Names as they read on the day, keyed by person id.
  names: Record<string, string>;
}

export function snapshotRegister(
  register: Register,
  rules: RegisterSnapshot["rules"],
  committeeName: string,
  names: Record<string, string>,
): RegisterSnapshot {
  // A plain-JSON copy: nothing in it may point back at live configuration.
  return JSON.parse(JSON.stringify({ version: 1, register, rules, committeeName, names }));
}

export function isRegisterSnapshot(v: unknown): v is RegisterSnapshot {
  return typeof v === "object" && v != null && (v as { version?: unknown }).version === 1 && "register" in v;
}
