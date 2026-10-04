/**
 * Whether a committee's step on a variation's route can be tabled, or cited, now (6.13 Part A step 4: FR-VAR-010,
 * 013). One rule for the tabling act and the button beside it: a step's matter is tabled once and waits for the
 * committee's decision (a matter pending or deferred stands), and a step is cited only from a matter the committee
 * has decided. Pure.
 */

import { citeFaults, tableFaults, type MatterFact } from "@/lib/matter/tabling";

import type { Finding } from "./types";

// 6.13 Part B run 1a (ADR 0029 §3, against accepted Part A): the rule is the one every matter tabled from its record
// follows (`tablingOf`, src/lib/matter/tabling.ts); these keep the variation's names, and their tests, unchanged.
export type { MatterFact };

/// Tabling the step's matter: refused while one stands waiting for the committee (tabled and pending, or deferred).
export function tableStepFaults(matters: readonly MatterFact[], domain: string, committeeCode: string): Finding[] {
  return tableFaults(matters, domain, committeeCode);
}

/// Citing the step: there must be a matter tabled for it, and the committee must have decided it.
export function citeStepFaults(matters: readonly MatterFact[], domain: string, committeeCode: string): Finding[] {
  return citeFaults(matters, domain, committeeCode);
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
