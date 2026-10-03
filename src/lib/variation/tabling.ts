/**
 * Whether a committee's step on a variation's route can be tabled, or cited, now (6.13 Part A step 4: FR-VAR-010,
 * 013). One rule for the tabling act and the button beside it: a step's matter is tabled once and waits for the
 * committee's decision (a matter pending or deferred stands), and a step is cited only from a matter the committee
 * has decided. Pure.
 */

import type { Finding } from "./types";

export interface MatterFact {
  withdrawn: boolean;
  /// The route's domain the matter was tabled for.
  domain: string;
  committeeCode: string;
  outcome: "PENDING" | "DEFERRED" | "CARRIED" | "NOT_CARRIED";
}

const forStep = (m: MatterFact, domain: string, committeeCode: string) => !m.withdrawn && m.domain === domain && m.committeeCode === committeeCode;

/// Tabling the step's matter: refused while one stands waiting for the committee (tabled and pending, or deferred).
export function tableStepFaults(matters: readonly MatterFact[], domain: string, committeeCode: string): Finding[] {
  return matters.some((m) => forStep(m, domain, committeeCode) && (m.outcome === "PENDING" || m.outcome === "DEFERRED")) ? [{ code: "ALREADY_TABLED", level: "block" }] : [];
}

/// Citing the step: there must be a matter tabled for it, and the committee must have decided it.
export function citeStepFaults(matters: readonly MatterFact[], domain: string, committeeCode: string): Finding[] {
  const mine = matters.filter((m) => forStep(m, domain, committeeCode));
  if (!mine.length) return [{ code: "NOT_TABLED_YET", level: "block" }];
  if (!mine.some((m) => m.outcome === "CARRIED" || m.outcome === "NOT_CARRIED")) return [{ code: "NOT_DECIDED_YET", level: "block" }];
  return [];
}

/// A matter tabled from a variation, as a post-award screen says it (6.13 acceptance S-1).
export interface MatterLineIn {
  withdrawn: boolean;
  outcome: MatterFact["outcome"];
  meetingId: string;
  meetingReference: string;
  committeeName: string;
}

/**
 * Acceptance S-1 (the founder's direction; 6.17 OD-4 B): a post-award screen says where a matter was tabled and the
 * committee's outcome only (carried, not carried, deferred, withdrawn, or not decided yet), linked to the sitting,
 * whose decision record is the one place members' votes are named. It takes no votes, so it cannot name a voter. Pure.
 */
export function matterLine(m: MatterLineIn): { reference: string; committee: string; outcome: string; href: string } {
  const outcome = m.withdrawn ? "withdrawn" : m.outcome === "CARRIED" ? "carried" : m.outcome === "NOT_CARRIED" ? "not carried" : m.outcome === "DEFERRED" ? "deferred" : "not decided yet";
  return { reference: m.meetingReference, committee: m.committeeName, outcome, href: `/committees/${m.meetingId}?tab=agenda` };
}

/// The matter, as loaded, read for its line (never its votes).
export const matterLineOf = (m: { withdrawnAt: Date | null; outcome: string; meetingId: string; meeting: { reference: string; committee: { nameEn: string } } }) =>
  matterLine({ withdrawn: !!m.withdrawnAt, outcome: m.outcome as MatterFact["outcome"], meetingId: m.meetingId, meetingReference: m.meeting.reference, committeeName: m.meeting.committee.nameEn });
