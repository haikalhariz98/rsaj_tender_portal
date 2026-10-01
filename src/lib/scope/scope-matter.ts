/**
 * Scope approval (FR-REQ-014, OD-9): a finalised bill of quantities tabled before a
 * committee as a SCOPE matter, named by its typed key `bqVersionId`, and decided there.
 * Pure.
 *
 * Whether a method needs it is the customer's policy, three-state: `scopeApprovalRequired`
 * null reads RULE_NOT_SET and blocks, never NOT_REQUIRED; a rule that says yes with no
 * committee reads COMMITTEE_NOT_SET and blocks. The approval belongs to one version: a
 * revision finalised later is not approved by its predecessor's decision, and is tabled in
 * its own right. Every state names its exit (labels.ts), and an outcome that cannot be read
 * (not carried with no outcome recorded) blocks rather than being guessed at.
 *
 * State is read only from 6.10's `decisionRecord()` of the matters that name the version,
 * as the committee gate reads its matters (src/lib/requisition/gate.ts).
 *
 * A matter is judged under the rule it was tabled under (62-C1): the committee of its
 * sitting and the act written on it, which tabling took from the configuration of the day
 * (`scopeCitationFault` refuses any other). Today's committee and act decide only what is
 * tabled next; a later change, unsetting included, never turns a decided approval back,
 * and a matter still waiting is decided under the rule it was tabled under, or withdrawn
 * and tabled again. Where configuration has moved on, `ruleMove` says from what to what.
 */

import type { DecisionRecord } from "@/lib/committee/record";
import type { ExerciseStatus } from "@/lib/method/types";

import type { BqStatus, Finding } from "./types";

/// The matter domain a scope matter is tabled under (matches AuthorityRule.domain's vocabulary).
export const SCOPE_DOMAIN = "scope_approval";

/// The method's scope rule as configured, or null where the method is no longer configured.
/// `scopeAct` is the act the committee discharges on a scope matter (AuthorityAct): tabling
/// writes it, and only a matter carried under it approves the scope. Null is not set and
/// blocks, never a guess at the act.
export interface ScopeRule {
  scopeApprovalRequired: boolean | null;
  scopeCommitteeCode: string | null;
  scopeAct: string | null;
}

/// A SCOPE matter as the rules read it. `record` is `decisionRecord()`, null while pending.
export interface ScopeMatter {
  id: string;
  bqVersionId: string | null;
  committeeCode: string;
  /// The act the matter was tabled under (CommitteeDecision.act).
  act: string;
  withdrawn: boolean;
  /// Its sitting was cancelled. Cancelling a sitting leaves its matters as they were, and a
  /// matter can no longer be withdrawn from it, so an undecided one there counts as withdrawn.
  sittingCancelled: boolean;
  tabledAt: Date | null;
  record: DecisionRecord | null;
  /// Where it is tabled, for saying where the approval is waiting.
  sittingReference?: string;
  /// The name of its sitting's committee, for saying who decided or is deciding it.
  committeeName?: string;
}

/// How configuration has moved on since a matter was tabled: the rule it was tabled under
/// (its sitting's committee and its act) beside today's. Null `now` values are unset today.
export interface RuleMove {
  tabled: { committeeCode: string; act: string };
  now: { committeeCode: string | null; act: string | null };
  committeeMoved: boolean;
  actMoved: boolean;
  /// The matter has a decision recorded (it stands as taken); otherwise it is still waiting.
  decided: boolean;
}

/// The move between the rule a matter was tabled under and today's, or null where none.
export function ruleMove(rule: ScopeRule, m: ScopeMatter): RuleMove | null {
  const committeeMoved = m.committeeCode !== rule.scopeCommitteeCode;
  const actMoved = m.act !== rule.scopeAct;
  if (!committeeMoved && !actMoved) return null;
  return { tabled: { committeeCode: m.committeeCode, act: m.act }, now: { committeeCode: rule.scopeCommitteeCode, act: rule.scopeAct }, committeeMoved, actMoved, decided: m.record != null };
}

export type ScopeApprovalState =
  | "METHOD_NOT_CONFIGURED"
  | "RULE_NOT_SET"
  | "NOT_REQUIRED"
  | "COMMITTEE_NOT_SET"
  | "ACT_NOT_SET"
  | "NO_FINALISED_BILL"
  | "NOT_TABLED"
  | "PENDING"
  | "DEFERRED"
  | "APPROVED"
  | "RETURNED"
  | "ENDED"
  | "OUTCOME_NOT_RECORDED";

export interface ScopeApproval {
  state: ScopeApprovalState;
  /// The finalised version the approval is about, where there is one.
  versionNo: number | null;
  /// The matter that decides the state (the deciding one, or the one waiting).
  decisive: ScopeMatter | null;
  /// An earlier version was approved, and this one is not yet: said, never counted.
  earlierApprovedVersionNo: number | null;
  /// The deciding matter was tabled under another committee or act than today's (62-C1):
  /// the state stands under the rule it was tabled under, and the card names both.
  movedOn: RuleMove | null;
}

const decidedOn = (m: ScopeMatter) => m.record?.decisionDate ?? m.record?.meetingDate ?? null;
const t = (d: Date | null, none: number) => d?.getTime() ?? none;

/// Matters in the order they were decided: decision date, then tabling, then id.
function inDecisionOrder(ms: readonly ScopeMatter[]): ScopeMatter[] {
  return [...ms].sort((a, b) => t(decidedOn(a), Infinity) - t(decidedOn(b), Infinity) || t(a.tabledAt, Infinity) - t(b.tabledAt, Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Where scope approval stands for an exercise. `versions` are the bill's versions; the one
 * that counts is the finalised one (at most one stands). Each matter speaks under the rule
 * it was tabled under (62-C1); withdrawn ones, and undecided ones at a cancelled sitting,
 * count for nothing. An unset committee or act today blocks only where no matter speaks
 * for the finalised version (nothing tabled, or no finalised bill): it says what must be
 * set before the bill can be tabled, and never undoes a decision already taken.
 */
export function scopeApproval(
  rule: ScopeRule | null,
  versions: readonly { id: string; versionNo: number; status: BqStatus }[],
  matters: readonly ScopeMatter[],
): ScopeApproval {
  const none = { versionNo: null, decisive: null, earlierApprovedVersionNo: null, movedOn: null };
  if (rule == null) return { state: "METHOD_NOT_CONFIGURED", ...none };
  if (rule.scopeApprovalRequired == null) return { state: "RULE_NOT_SET", ...none };
  if (rule.scopeApprovalRequired === false) return { state: "NOT_REQUIRED", ...none };
  const read = byMatters(versions, matters);
  if (read.state === "NO_FINALISED_BILL" || read.state === "NOT_TABLED") {
    if (!rule.scopeCommitteeCode) return { state: "COMMITTEE_NOT_SET", ...none };
    if (!rule.scopeAct) return { state: "ACT_NOT_SET", ...none };
  }
  return { ...read, movedOn: read.decisive ? ruleMove(rule, read.decisive) : null };
}

/// The state the matters give the finalised version, each under the rule it was tabled under.
function byMatters(versions: readonly { id: string; versionNo: number; status: BqStatus }[], matters: readonly ScopeMatter[]): Omit<ScopeApproval, "movedOn"> {
  const finalised = versions.find((v) => v.status === "FINALISED") ?? null;
  const counted = matters.filter(countsFor);
  const earlier = counted
    .filter((m) => m.bqVersionId !== finalised?.id && m.record?.outcome === "CARRIED")
    .map((m) => versions.find((v) => v.id === m.bqVersionId)?.versionNo ?? null)
    .filter((n): n is number => n != null);
  const earlierApprovedVersionNo = earlier.length ? Math.max(...earlier) : null;
  if (!finalised) return { state: "NO_FINALISED_BILL", versionNo: null, decisive: null, earlierApprovedVersionNo };
  const mine = counted.filter((m) => m.bqVersionId === finalised.id);
  const base = { versionNo: finalised.versionNo, earlierApprovedVersionNo };

  const decided = inDecisionOrder(mine.filter((m) => m.record && m.record.outcome !== "DEFERRED"));
  const last = decided[decided.length - 1] ?? null;
  const waiting = [...mine.filter((m) => m.record == null)].sort((a, b) => t(a.tabledAt, -Infinity) - t(b.tabledAt, -Infinity) || (a.id < b.id ? -1 : 1));
  const w = waiting[waiting.length - 1] ?? null;
  // A matter tabled again on or after the last decision (after an outcome that could not be
  // read) is what the version now waits on: the earlier decision no longer speaks for it,
  // and while it waits the version is not tabled a third time.
  const lastDecided = last ? decidedOn(last) : null;
  if (w && (last == null || lastDecided == null || (w.tabledAt != null && w.tabledAt.getTime() >= lastDecided.getTime()))) return { state: "PENDING", decisive: w, ...base };
  if (last) {
    const r = last.record!;
    if (r.outcome === "CARRIED") return { state: "APPROVED", decisive: last, ...base };
    if (!r.notApproved) return { state: "OUTCOME_NOT_RECORDED", decisive: last, ...base };
    return { state: r.notApproved.kind === "LOOP" ? "RETURNED" : "ENDED", decisive: last, ...base };
  }
  const deferred = inDecisionOrder(mine.filter((m) => m.record?.outcome === "DEFERRED"));
  if (deferred.length) return { state: "DEFERRED", decisive: deferred[deferred.length - 1], ...base };
  return { state: "NOT_TABLED", decisive: null, ...base };
}

/// Whether a matter speaks for scope approval: not withdrawn, and not left undecided at a
/// cancelled sitting. It speaks under the committee and act it was tabled under (62-C1),
/// which tabling took from the configuration of the day; today's rule is not asked.
export function countsFor(m: ScopeMatter): boolean {
  return !m.withdrawn && !(m.sittingCancelled && m.record == null);
}

/// Whether scope approval lets the documents go for approval (packFaults reads this).
export const scopeClears = (s: ScopeApprovalState) => s === "NOT_REQUIRED" || s === "APPROVED";

export type ScopeCitationFault =
  | "EXERCISE_CANCELLED"
  | "METHOD_NOT_CONFIGURED"
  | "SCOPE_RULE_NOT_SET"
  | "SCOPE_NOT_REQUIRED"
  | "SCOPE_COMMITTEE_NOT_SET"
  | "SCOPE_ACT_NOT_SET"
  | "VERSION_NOT_FINALISED"
  | "OTHER_EXERCISE"
  | "OTHER_COMMITTEE"
  | "OTHER_ACT"
  | "SITTING_CLOSED"
  | "SCOPE_ALREADY_WAITING"
  | "SCOPE_ALREADY_APPROVED"
  | "SCOPE_RETURNED"
  | "SCOPE_ENDED";

/**
 * Whether a bill version may be tabled (cited) before a sitting as a SCOPE matter: the
 * typed key is written only where this passes, on rows read under the exercise's and the
 * sitting's locks. One version answers scope approval once: while a matter for it waits,
 * or once it is carried, another is refused; once the committee returns it, the bill is
 * revised and the new version tabled; once ended, nothing more. A deferred matter, or one
 * not carried with no outcome recorded (which cannot be read either way), may be tabled again. Tabling itself (who tables, the Secretariat) is `checkTabling`'s.
 *
 * `act` is the act the matter would carry. Only the configured act is tabled (OTHER_ACT, as
 * `gateCitationFault` refuses one): tableScope writes the configured act, so this guards it.
 */
export function scopeCitationFault(i: {
  exercise: { id: string; status: ExerciseStatus };
  rule: ScopeRule | null;
  version: { id: string; exerciseId: string; status: BqStatus };
  sitting: { committeeCode: string; frozen: boolean };
  act: string | null;
  /// Every SCOPE matter that names this version (any committee).
  matters: readonly ScopeMatter[];
}): Finding<ScopeCitationFault>[] {
  const out: Finding<ScopeCitationFault>[] = [];
  const b = (code: ScopeCitationFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.exercise.status === "CANCELLED") b("EXERCISE_CANCELLED");
  if (i.version.exerciseId !== i.exercise.id) b("OTHER_EXERCISE");
  if (i.rule == null) b("METHOD_NOT_CONFIGURED");
  else if (i.rule.scopeApprovalRequired == null) b("SCOPE_RULE_NOT_SET");
  else if (i.rule.scopeApprovalRequired === false) b("SCOPE_NOT_REQUIRED");
  else if (!i.rule.scopeCommitteeCode) b("SCOPE_COMMITTEE_NOT_SET");
  else {
    if (i.sitting.committeeCode !== i.rule.scopeCommitteeCode) b("OTHER_COMMITTEE");
    if (!i.rule.scopeAct) b("SCOPE_ACT_NOT_SET");
    else if (i.act !== i.rule.scopeAct) b("OTHER_ACT");
  }
  if (i.version.status !== "FINALISED") b("VERSION_NOT_FINALISED", { status: i.version.status });
  if (i.sitting.frozen) b("SITTING_CLOSED");
  if (i.rule?.scopeApprovalRequired && i.rule.scopeCommitteeCode && i.rule.scopeAct) {
    const s = scopeApproval(i.rule, [{ id: i.version.id, versionNo: 0, status: "FINALISED" }], i.matters);
    // A matter waiting under an earlier rule still holds the version: it is withdrawn from
    // its sitting first, then the version is tabled under today's rule.
    if (s.state === "PENDING") b("SCOPE_ALREADY_WAITING", { sitting: s.decisive?.sittingReference ?? null, ...(s.movedOn ? { tabledUnderEarlierRule: "yes" } : {}) });
    else if (s.state === "APPROVED") b("SCOPE_ALREADY_APPROVED");
    else if (s.state === "RETURNED") b("SCOPE_RETURNED");
    else if (s.state === "ENDED") b("SCOPE_ENDED");
  }
  return out;
}

/// What a scope matter is called on the agenda and in the activity feed: the exercise's name
/// first, then the version, never an id. The same words are the audit entry's label, so the
/// matter is phrased one way wherever it is read.
export const scopeMatterSubject = (exerciseTitle: string, versionNo: number) => `${exerciseTitle}, scope version ${versionNo}`;
