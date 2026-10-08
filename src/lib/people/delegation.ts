/**
 * One officer standing in for another.
 *
 * Deliberately not escalation. `AuthorityRole.escalatesToCode` moves authority upward
 * when a holder cannot act and belongs to the office; a delegation is the holder's own
 * act, naming a person, a period, and often a ceiling. A decision signed under one has
 * to be able to name the delegation that permitted it, so this resolves rather than
 * infers.
 */

import { inForceOn, periodsOverlap, type Effective } from "@/lib/effective";

import { anyLineRecorded, lineOf, REPORTING_LINE_NOT_SET, type ReportingLine } from "./reporting-lines";

export interface Delegation extends Effective {
  id: string;
  /// The grantor: who gives the delegation. On a delegation recorded from FR-APR-011's rule on, the jobholder's superior; on an earlier one, the holder of the office.
  fromPersonId: string;
  /// The jobholder whose authority is delegated (product owner, 2026-10-08, decisions log line 1773). Null on a delegation recorded before the superior rule: it keeps the reading
  /// where the grantor is the holder (`holderOf`), is labelled so, and is never backfilled.
  jobholderPersonId?: string | null;
  toPersonId: string;
  roleCode: string;
  /// Empty means the whole office, which is a larger act than a listed subset.
  capabilityCodes: string[];
  /// Null means no ceiling was set. Not a ceiling of zero.
  valueCeiling: string | null;
  reason: string;
  /// The same reason in Malay.
  reasonMs: string;
  noSubDelegation: boolean;
  /// The absent holder's recommendation to re-delegate (FR-APR-012): its summary, as text.
  /// The signed recommendation itself is a document attached to the delegation (OD-6).
  holderRecommendation?: string | null;
  holderRecommendedOn?: Date | null;
  /// Whether the signed recommendation is attached, live (OD-6). Read for display.
  recommendationAttached?: boolean;
  /// Whether one was ever attached, live or not. Read for display.
  recommendationEverAttached?: boolean;
  /// The migration's mark: recorded as text before attachments existed. Read, never written.
  recommendationTextOnlyAtLanding?: boolean;
}

/// Whose holding of the office a delegation carries: the jobholder's, or on a delegation recorded before the superior rule the grantor's. The engine takes the delegated authority from this
/// person's holding, and one delegate-at-a-time and the loop check are judged on it.
export const holderOf = (d: Pick<Delegation, "fromPersonId" | "jobholderPersonId">): string => d.jobholderPersonId ?? d.fromPersonId;

export type DelegationStatus = "IN_FORCE" | "SCHEDULED" | "ENDED";

export function statusOf(delegation: Delegation, on: Date): DelegationStatus {
  if (delegation.effectiveFrom > on) return "SCHEDULED";
  return inForceOn(delegation, on) ? "IN_FORCE" : "ENDED";
}

export function inForce(delegations: readonly Delegation[], on: Date): Delegation[] {
  return delegations.filter((d) => statusOf(d, on) === "IN_FORCE");
}

/// What one person may exercise on someone else's behalf today.
export function heldOnBehalf(
  delegations: readonly Delegation[],
  personId: string,
  on: Date,
): Delegation[] {
  return inForce(delegations, on).filter((d) => d.toPersonId === personId);
}

/// Who is covering for a person today, if anyone.
export function coverFor(
  delegations: readonly Delegation[],
  personId: string,
  on: Date,
): Delegation | null {
  return inForce(delegations, on).find((d) => holderOf(d) === personId) ?? null;
}

/**
 * What is wrong with a proposed delegation.
 *
 * Returned as codes rather than sentences so the caller renders the wording. Every one
 * of these is refused at entry: a delegation that cannot be honoured is worse than no
 * delegation, because the work stops with nobody expecting it to.
 */
export type DelegationFault =
  | "TO_SELF"
  /// The officer keying a delegation from the grantor's letter is the delegate (Phase 2b review): one person would grant the authority and receive it.
  | "RECORDER_IS_DELEGATE"
  | "OVERLAPS_EXISTING"
  /// F8: the delegation would close a loop for the same office (A to B, B to C, C to A), directly or through delegations already in force.
  | "DELEGATION_CYCLE"
  /// FR-APR-011, once reporting lines are recorded: the delegate is not a direct line subordinate of the grantor.
  | "DELEGATE_NOT_SUBORDINATE"
  /// FR-APR-011, once reporting lines are recorded: the delegate has no line recorded, so they cannot be shown to be a subordinate.
  | "DELEGATE_LINE_NOT_SET"
  | "SUB_DELEGATION_FORBIDDEN"
  | "CAPABILITY_NOT_HELD"
  | "OFFICE_UNDECIDED"
  | "ENDS_BEFORE_IT_STARTS"
  | "UNBOUNDED"
  | "GRANTOR_DOES_NOT_HOLD"
  /// FR-APR-011 (ruling of 2026-10-08, log line 1773), on a delegation that records a jobholder: the jobholder does not hold the office over the whole period. The grantor, being the
  /// superior, need hold no such office.
  | "JOBHOLDER_DOES_NOT_HOLD"
  /// The grantor is the jobholder: nobody delegates their own authority (the requirement's acceptance test), whether or not any line is recorded.
  | "GRANTOR_IS_JOBHOLDER"
  /// The delegate is the jobholder: they would receive their own authority.
  | "DELEGATE_IS_JOBHOLDER"
  /// Once reporting lines are recorded: the grantor is not the jobholder's immediate superior.
  | "GRANTOR_NOT_SUPERIOR"
  /// Once reporting lines are recorded: the jobholder has no line recorded, so the grantor cannot be shown to be their superior.
  | "JOBHOLDER_LINE_NOT_SET"
  | "MANDATORY_ACT"
  | "ABSENT_GRANTOR_NO_RECOMMENDATION"
  | "ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED";

/**
 * What the caller knows about the office being delegated, beyond its capabilities.
 * Optional so a check that has not looked stays silent rather than guessing.
 */
export interface DelegationContext {
  /// The signed-in officer, where the delegation is recorded for another grantor from their letter (`PreparedAct.recorderId`). Null where the grantor signs in
  /// their own session. The grantor may not be the only check: the officer who keys it may not be its delegate either.
  recorderId?: string | null;
  /// Whether the person delegating holds the office over the whole period. Judged on the grantor, for a delegation that records no jobholder (the reading before the superior rule).
  grantorHoldsOffice?: boolean;
  /// Whether the JOBHOLDER holds the office over the whole period (ruling of 2026-10-08, log line 1773): judged for a delegation that records one, in place of the grantor.
  jobholderHoldsOffice?: boolean;
  /// Whether an approval rule gives the office a mandatory act (MR, MJR, MA).
  officeHasMandatoryActs?: boolean;
  /// Whether the holder is away (`Person.isAvailable` false): the jobholder where the delegation records one, else the grantor. Authority has then
  /// reverted upward, and passes down again only on the absent holder's recommendation.
  grantorUnavailable?: boolean;
  /// The absent holder's recommendation to re-delegate, as recorded (FR-APR-012).
  holderRecommendation?: string | null;
  /// Whether the signed recommendation is attached, live (OD-6). Not given: not looked
  /// at, and the attachment rule stays silent, as every other optional fact here does.
  recommendationAttached?: boolean;
  /// A delegation recorded on a text recommendation before attachments existed: it
  /// stands to its end date on the text, labelled, and may have the scan attached later.
  /// The caller decides it with `standsOnTextBeforeAttachments` (recommendation.ts), from
  /// the stored mark, never from the text.
  recordedBeforeAttachments?: boolean;
  /// The organisation's recorded reporting lines (FR-APR-010/011). Not given: not looked at, as every other optional fact here. Given and EMPTY: the
  /// organisation has not recorded any, and the line-management rules are not applied (`delegationNotes` says so). Given with lines: they are.
  reportingLines?: readonly ReportingLine[];
}

/// Said about a delegation that was accepted, where a rule it is owed was not applied. Words for the screen, never a refusal.
export interface DelegationNote {
  code: "REPORTING_LINES_NOT_SET" | "RULES_CHECKED";
  en: string;
}

/**
 * What the delegation rules check, and do not, said in words (FR-APR-011, product owner 2026-10-08, decisions log line 1773).
 *
 * - Always: the grantor is not the jobholder (no delegation of one's own authority), the jobholder holds the office, and nobody delegates to themselves.
 * - No reporting line is recorded: the rules that the grantor is the jobholder's immediate superior and that the delegate is the jobholder's direct line subordinate are NOT applied, and
 *   the screen says "Reporting line not set". They are applied, on the first day and on every day a line changes within the period, as soon as lines are recorded.
 * - A delegation recorded before the superior rule has no jobholder recorded and keeps the earlier reading, where the grantor is the holder: it is labelled so on the list.
 */
export function delegationNotes(context: Pick<DelegationContext, "reportingLines">): DelegationNote[] {
  if (context.reportingLines === undefined) return [];
  if (!anyLineRecorded(context.reportingLines)) {
    return [{ code: "REPORTING_LINES_NOT_SET", en: `${REPORTING_LINE_NOT_SET}: the rules that the grantor is the jobholder's immediate superior and that the delegate is the jobholder's direct line subordinate are not checked. They are applied as soon as reporting lines are recorded. What is checked now: the grantor is never the jobholder, and the jobholder holds the office.` }];
  }
  return [{ code: "RULES_CHECKED", en: "The grantor is checked against the jobholder's reporting line (the jobholder's immediate superior), and the delegate against it too (a direct line subordinate of the jobholder), on the first day and on every day a line changes within the period." }];
}

/// How a delegation recorded before the superior rule reads on a list: it has no jobholder, and the grantor is taken as the holder.
export const BEFORE_SUPERIOR_RULE_SHORT = "recorded before the superior rule";
export const BEFORE_SUPERIOR_RULE = "Recorded before the superior rule: the grantor is taken as the holder of the office.";

/**
 * Who may record a delegation for a grantor other than themselves (F8, FR-APR-011: "granted by", not "received by").
 *
 * The grantor is the officer signed in. A delegation is recorded for someone else only from that person's own letter (the act's paper reference or reason is kept
 * beside both people, `ActAttribution`), and only by an administrator, whose editor this is, or by an officer who holds the permission to record on someone's behalf.
 * Any other officer is refused: they cannot hand a colleague's authority to a third person by naming the colleague. Pure.
 */
export function grantorFault(i: { recordedForAnother: boolean; actorIsAdministrator: boolean; actorMayRecordOnBehalf: boolean }): "NOT_THE_GRANTOR" | null {
  if (!i.recordedForAnother) return null;
  return i.actorIsAdministrator || i.actorMayRecordOnBehalf ? null : "NOT_THE_GRANTOR";
}

export const GRANTOR_FAULT_TEXT = "A delegation is granted by the officer signed in. You can record one for another grantor, from their letter, only as an administrator or with the permission to record on someone's behalf, and you hold neither.";

/**
 * Whether the proposed delegation would close a loop (F8). Delegations of the same office whose periods overlap the proposal's form a graph from grantor to
 * delegate. Following it forward from the proposal's delegate, a path that arrives back at the grantor is a loop: the authority would circle with no one
 * holding it. Looks at every such delegation, in force or scheduled, and never at another office's (two officers covering each other for different offices is cover, not a loop).
 */
export function closesLoop(proposed: Delegation, existing: readonly Delegation[]): boolean {
  const edges = existing.filter((d) => d.id !== proposed.id && d.roleCode === proposed.roleCode && periodsOverlap(d, proposed));
  const seen = new Set<string>();
  const stack = [proposed.toPersonId];
  while (stack.length > 0) {
    const at = stack.pop()!;
    // The authority runs from the holder (the jobholder, or the grantor on a delegation recorded before the rule) to the delegate.
    if (at === holderOf(proposed)) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const e of edges) if (holderOf(e) === at) stack.push(e.toPersonId);
  }
  return false;
}

/// The days on which a delegate's line can differ over the period: its first day, and the first day of any of their lines that begins inside it.
function lineCheckDays(proposed: Delegation, lines: readonly ReportingLine[]): Date[] {
  // The delegate's line, and the jobholder's where one is recorded (the grantor must be the jobholder's superior on those days too).
  const who = [proposed.toPersonId, ...(proposed.jobholderPersonId ? [proposed.jobholderPersonId] : [])];
  const inside = lines.filter((l) => who.includes(l.personId) && l.effectiveFrom > proposed.effectiveFrom && (proposed.effectiveTo == null || l.effectiveFrom < proposed.effectiveTo)).map((l) => l.effectiveFrom);
  return [...new Map([proposed.effectiveFrom, ...inside].map((d) => [d.getTime(), d])).values()];
}

/**
 * FR-APR-011 (product owner, 2026-10-08, decisions log line 1773). A delegation records the JOBHOLDER whose authority is delegated, apart from the GRANTOR:
 *
 * - on a delegation that records a jobholder, the grantor is never the jobholder (refused whether or not any line is recorded: the requirement's acceptance test is that a user
 *   cannot delegate their own authority), the JOBHOLDER must hold the office over the whole period (the grantor, being the superior, need hold none), and the engine takes the
 *   delegated authority from the jobholder's holding;
 * - WHEN REPORTING LINES ARE RECORDED (`context.reportingLines`), the grantor must be the jobholder's immediate superior and the delegate a direct line subordinate of the jobholder
 *   (not of the grantor), on the first day and on every day either line changes in the period. With none recorded these two rules are not applied and `delegationNotes` says so;
 *   nothing is assumed;
 * - a delegation with no jobholder (recorded before the rule) is judged as it always was: the grantor is the holder, and the delegate a subordinate of the grantor.
 *
 * The grantor is the signed-in person, or the person the act is recorded for (both stored: Phase 2b). A loop is refused whatever the lines say (F8).
 */
export function faultsIn(
  proposed: Delegation,
  existing: readonly Delegation[],
  /// Capability codes the delegating office actually holds.
  heldByOffice: readonly string[],
  context: DelegationContext = {},
): DelegationFault[] {
  const faults: DelegationFault[] = [];

  if (proposed.fromPersonId === proposed.toPersonId) faults.push("TO_SELF");
  if (context.recorderId && context.recorderId === proposed.toPersonId && proposed.fromPersonId !== proposed.toPersonId) faults.push("RECORDER_IS_DELEGATE");

  // Time-limited or task-limited, or it is not a delegation — it is a transfer of the
  // office with no way back. No end date and the whole role is neither.
  if (proposed.effectiveTo == null && proposed.capabilityCodes.length === 0) {
    faults.push("UNBOUNDED");
  }

  const jobholder = proposed.jobholderPersonId ?? null;
  if (jobholder) {
    if (jobholder === proposed.fromPersonId) faults.push("GRANTOR_IS_JOBHOLDER");
    if (jobholder === proposed.toPersonId && jobholder !== proposed.fromPersonId) faults.push("DELEGATE_IS_JOBHOLDER");
    if (context.jobholderHoldsOffice === false) faults.push("JOBHOLDER_DOES_NOT_HOLD");
  } else if (context.grantorHoldsOffice === false) faults.push("GRANTOR_DOES_NOT_HOLD");

  // FR-APR-012, DAL p.42: on a holder's absence authority reverts upward; it is passed
  // down again only where the absent holder has recommended it — the summary as text,
  // and (OD-6) the signed recommendation attached. One recorded on text alone before
  // attachments existed stands.
  if (context.grantorUnavailable && !(context.holderRecommendation ?? "").trim()) faults.push("ABSENT_GRANTOR_NO_RECOMMENDATION");
  if (context.grantorUnavailable && context.recommendationAttached === false && !context.recordedBeforeAttachments) faults.push("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");

  // A mandatory step cannot be delegated, skipped or substituted. Handing over the
  // whole office would hand over that step with it; a listed subset of capabilities
  // does not carry an approval act.
  if (context.officeHasMandatoryActs && proposed.capabilityCodes.length === 0) {
    faults.push("MANDATORY_ACT");
  }

  if (proposed.effectiveTo && proposed.effectiveTo <= proposed.effectiveFrom) {
    faults.push("ENDS_BEFORE_IT_STARTS");
  }

  // F8: a loop for the same office is refused, whether or not the office allows onward delegation: no one would hold the authority.
  if (holderOf(proposed) !== proposed.toPersonId && closesLoop(proposed, existing)) faults.push("DELEGATION_CYCLE");

  // FR-APR-011, once lines are recorded: the delegate reports directly to the jobholder (to the grantor, on a delegation recorded before the rule), and the grantor is the jobholder's
  // immediate superior. Not applied while none are recorded (`delegationNotes`).
  if (context.reportingLines && anyLineRecorded(context.reportingLines) && proposed.fromPersonId !== proposed.toPersonId) {
    for (const day of lineCheckDays(proposed, context.reportingLines)) {
      const line = lineOf(context.reportingLines, proposed.toPersonId, day);
      if (line.kind === "NOT_SET") {
        if (!faults.includes("DELEGATE_LINE_NOT_SET")) faults.push("DELEGATE_LINE_NOT_SET");
      } else if (line.kind === "TOP" || line.superiorPersonId !== holderOf(proposed)) {
        if (!faults.includes("DELEGATE_NOT_SUBORDINATE")) faults.push("DELEGATE_NOT_SUBORDINATE");
      }
      if (jobholder && jobholder !== proposed.fromPersonId) {
        const above = lineOf(context.reportingLines, jobholder, day);
        if (above.kind === "NOT_SET") {
          if (!faults.includes("JOBHOLDER_LINE_NOT_SET")) faults.push("JOBHOLDER_LINE_NOT_SET");
        } else if (above.kind === "TOP" || above.superiorPersonId !== proposed.fromPersonId) {
          if (!faults.includes("GRANTOR_NOT_SUPERIOR")) faults.push("GRANTOR_NOT_SUPERIOR");
        }
      }
    }
  }

  // One office, one delegate at a time: two would make the same act resolvable to two
  // different people.
  const clash = existing.some(
    (d) =>
      d.id !== proposed.id &&
      d.roleCode === proposed.roleCode &&
      holderOf(d) === holderOf(proposed) &&
      periodsOverlap(d, proposed),
  );
  if (clash) faults.push("OVERLAPS_EXISTING");

  // Delegating something the office does not itself hold would manufacture authority.
  // Where nobody has decided what the office may do, that cannot be checked either —
  // which is a reason to refuse, not to wave it through.
  if (proposed.capabilityCodes.length > 0) {
    if (heldByOffice.length === 0) faults.push("OFFICE_UNDECIDED");
    else if (proposed.capabilityCodes.some((c) => !heldByOffice.includes(c))) {
      faults.push("CAPABILITY_NOT_HELD");
    }
  }

  // Onward delegation from an office that forbids it.
  const upstream = existing.find(
    (d) =>
      d.id !== proposed.id &&
      d.toPersonId === holderOf(proposed) &&
      d.roleCode === proposed.roleCode &&
      periodsOverlap(d, proposed),
  );
  if (upstream?.noSubDelegation) faults.push("SUB_DELEGATION_FORBIDDEN");

  return faults;
}
