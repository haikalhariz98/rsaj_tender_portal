/**
 * Late envelopes and their admission (FR-BID-003, FR-CTE-007 late part, FR-CTE-008; OD-5, OD-6).
 *
 * A late envelope is never deleted, rejected or set aside: its admission is a LATE_TENDER matter,
 * one per envelope, named by the typed key `bidEnvelopeId`, decided by the committee the sourcing
 * method names (`lateAdmissionCommitteeCode`). CARRIED admits it; NOT_CARRIED does not. Unset
 * blocks tabling — never read as "reject" — and blocks the award only where a late envelope waits.
 *
 * Several late envelopes cannot hang off the single `dependsOnDecisionId`, and chaining them would
 * invent an order (OD-6): instead, tabling or citing an exercise's appointment matter is refused
 * while any late envelope lacks a decided admission (`lateAdmissionFault`), in 6.10's tabling and
 * 6.11's citation and award gate. Either outcome counts as decided.
 *
 * Each matter speaks under the committee it was tabled under (its sitting's), as scope matters do
 * (62-C1); a withdrawn matter, or one left undecided at a cancelled sitting, counts for nothing.
 * Pure.
 */

import type { EnvelopeFacts, Finding } from "./types";
import type { RuleSource } from "./rule-snapshot";

/// The matter domain a late-admission matter is tabled under (AuthorityRule.domain's vocabulary).
export const LATE_DOMAIN = "late_tender_admission";

/// A LATE_TENDER matter as the rules read it.
export interface LateMatter {
  id: string;
  bidEnvelopeId: string | null;
  withdrawn: boolean;
  sittingCancelled: boolean;
  tabledAt: Date | null;
  /// Null while pending.
  outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED" | null;
  decisionDate: Date | null;
  sittingReference?: string;
  committeeName?: string;
}

export type AdmissionState = "NOT_TABLED" | "PENDING" | "DEFERRED" | "ADMITTED" | "NOT_ADMITTED";

/// Whether an envelope needs a committee's admission: a late bid or alternative, not withdrawn.
export const needsAdmission = (e: Pick<EnvelopeFacts, "kind" | "late" | "status">) => e.late && e.kind !== "COMPANY_ESTIMATE" && e.status !== "WITHDRAWN";

/// Whether a matter speaks for admission.
export const counts = (m: LateMatter) => !m.withdrawn && !(m.sittingCancelled && m.outcome == null);

/// Where an envelope's admission stands, and the matter that says so.
export function admission(envelopeId: string, matters: readonly LateMatter[]): { state: AdmissionState; matter: LateMatter | null } {
  const mine = matters.filter((m) => m.bidEnvelopeId === envelopeId && counts(m));
  const decided = mine.filter((m) => m.outcome === "CARRIED" || m.outcome === "NOT_CARRIED").sort((a, b) => (a.decisionDate?.getTime() ?? 0) - (b.decisionDate?.getTime() ?? 0));
  const last = decided.at(-1);
  if (last) return { state: last.outcome === "CARRIED" ? "ADMITTED" : "NOT_ADMITTED", matter: last };
  const pending = mine.find((m) => m.outcome == null);
  if (pending) return { state: "PENDING", matter: pending };
  const deferred = mine.filter((m) => m.outcome === "DEFERRED").at(-1);
  if (deferred) return { state: "DEFERRED", matter: deferred };
  return { state: "NOT_TABLED", matter: null };
}

export const isDecided = (s: AdmissionState) => s === "ADMITTED" || s === "NOT_ADMITTED";

export type LateGateFault = "LATE_UNDECIDED";

/**
 * The gate (OD-6): null where every late envelope's admission is decided, either way. Otherwise
 * LATE_UNDECIDED with how many wait, and whether the committee that decides them is set (an unset
 * committee is named, so the refusal says where to set it).
 */
export function lateAdmissionFault(envelopes: readonly Pick<EnvelopeFacts, "id" | "kind" | "late" | "status">[], matters: readonly LateMatter[], committeeSet: boolean, committeeSource: RuleSource = "LIVE"): Finding<LateGateFault> | null {
  const waiting = envelopes.filter(needsAdmission).filter((e) => !isDecided(admission(e.id, matters).state));
  if (waiting.length === 0) return null;
  // An unset committee frozen at publication is not "set it": a later setting does not apply (CR-2).
  const data: Record<string, string | number | null> = { count: waiting.length, committeeSet: committeeSet ? "yes" : "no" };
  if (!committeeSet && committeeSource !== "LIVE") data.asPublished = committeeSource;
  return { code: "LATE_UNDECIDED", level: "block", data };
}

export type LateMatterFault = "EXERCISE_CANCELLED" | "COMMITTEE_NOT_SET" | "NOT_LATE" | "WITHDRAWN" | "ALREADY_TABLED" | "ALREADY_DECIDED" | "OTHER_COMMITTEE" | "SITTING_CLOSED" | "NOT_A_BID";

/// Tabling an envelope's admission at a sitting: of the configured committee, once per envelope (again only after a deferral).
export function lateMatterFault(i: {
  exerciseCancelled: boolean;
  committeeCode: string | null;
  /// Where the committee was read from (CR-2); an unset one frozen at publication says so.
  committeeSource?: RuleSource;
  envelope: Pick<EnvelopeFacts, "id" | "kind" | "late" | "status">;
  matters: readonly LateMatter[];
  sitting: { committeeCode: string; frozen: boolean };
}): Finding<LateMatterFault>[] {
  const out: Finding<LateMatterFault>[] = [];
  const f = (code: LateMatterFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.exerciseCancelled) f("EXERCISE_CANCELLED");
  if (!i.committeeCode) f("COMMITTEE_NOT_SET", i.committeeSource && i.committeeSource !== "LIVE" ? { asPublished: i.committeeSource } : undefined);
  if (i.envelope.kind === "COMPANY_ESTIMATE") f("NOT_A_BID");
  else if (!i.envelope.late) f("NOT_LATE");
  if (i.envelope.status === "WITHDRAWN") f("WITHDRAWN");
  const state = admission(i.envelope.id, i.matters).state;
  if (state === "PENDING") f("ALREADY_TABLED", { sitting: admission(i.envelope.id, i.matters).matter?.sittingReference ?? null });
  if (isDecided(state)) f("ALREADY_DECIDED");
  if (i.committeeCode && i.sitting.committeeCode !== i.committeeCode) f("OTHER_COMMITTEE");
  if (i.sitting.frozen) f("SITTING_CLOSED");
  return out;
}

/// A late-admission matter's subject: the exercise and the envelope, never a bidder (none is named before opening).
export const lateMatterSubject = (exerciseTitle: string, sequence: number) => `Admission of late envelope ${sequence}: ${exerciseTitle}`;
