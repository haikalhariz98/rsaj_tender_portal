/**
 * The decided-step record (FR-APR-007): for every step decided, who acted, the office
 * they acted in, the act, the decision, the day decided and the moment recorded, any
 * comment, and the clause and issue of the approval limits it was decided under.
 *
 * The step and its route together hold that record. The route pins the clause and the
 * issue when it is opened (and issued issues are locked), so a step decided years later
 * still reads the rules it ran under; the step holds the rest, written once, here. Every
 * place that records a decision — a person's or a committee's, on a requisition, a name
 * or an award route — builds what it writes with these functions, so the record cannot
 * differ between them.
 *
 * Pure: the moment recorded is passed in, never read from a clock.
 */

import type { AuthorityAct } from "./types";

export type StepOutcome = "DONE" | "REJECTED";

/// A person's decision on a step, recorded on their behalf (not signed).
export interface PersonDecision {
  decision: StepOutcome;
  person: { id: string; name: string };
  decidedOn: Date;
  /// The delegation the person acted under, or null where they hold the office.
  delegationId: string | null;
  /// The comment. Required by the callers for a rejection; empty otherwise.
  reason: string;
  recordedAt: Date;
  /// The day the matter reached the decider, where the route records it (award). Left
  /// out entirely where the route does not, so the write never clears it.
  receivedOn?: Date | null;
}

/// A committee's decision, discharging a committee step by citation.
export interface CommitteeCitation {
  decision: StepOutcome;
  committeeName: string;
  decidedOn: Date | null;
  committeeDecisionId: string;
  recordedAt: Date;
}

/// What is written to the step when a person decides it.
export function personDecisionWrite(d: PersonDecision) {
  return {
    decision: d.decision,
    decidedByPersonId: d.person.id,
    decidedByName: d.person.name,
    decidedOn: d.decidedOn,
    ...(d.receivedOn !== undefined ? { receivedOn: d.receivedOn } : {}),
    delegationId: d.delegationId,
    reason: d.reason,
    recordedAt: d.recordedAt,
  };
}

/// What is written to the step when a committee's decision discharges it.
export function committeeCitationWrite(c: CommitteeCitation) {
  return {
    decision: c.decision,
    decidedByName: c.committeeName,
    decidedOn: c.decidedOn,
    committeeDecisionId: c.committeeDecisionId,
    recordedAt: c.recordedAt,
  };
}

/// The step as stored, as far as the record needs it.
export interface StoredStep {
  roleCode: string | null;
  roleLabel: string;
  actingRoleCode: string | null;
  actingRoleLabel: string | null;
  act: AuthorityAct;
  decision: string;
  decidedByPersonId: string | null;
  decidedByName: string | null;
  decidedOn: Date | null;
  recordedAt: Date | null;
  reason: string;
  delegationId: string | null;
  committeeDecisionId: string | null;
}

/// The route as stored: the clause and issue it pinned when it was opened.
export interface StoredRoute {
  authorityMatrixId: string | null;
  matrixLabel: string | null;
  ruleClause: string | null;
  fundingOverrideApplied: boolean;
  overrideMatrixId: string | null;
  overrideMatrixLabel: string | null;
}

export interface DecidedStepRecord {
  /// Who acted: a person (with their id), a committee (no person), or — on a trail
  /// received from outside — a name the sender gave with no person on record.
  actor:
    | { kind: "PERSON"; personId: string; name: string }
    | { kind: "COMMITTEE"; name: string; committeeDecisionId: string }
    | { kind: "NAMED_ONLY"; name: string };
  /// The office the step was acted in: the office acting for it where it was escalated.
  office: { code: string | null; label: string };
  act: AuthorityAct;
  decision: StepOutcome;
  underDelegation: boolean;
  decidedOn: Date | null;
  recordedAt: Date | null;
  comment: string;
  /// The clause relied on, as the route pinned it. Null: not recorded.
  clause: string | null;
  /// The issue relied on: the funder's rule set where it superseded, else the
  /// organisation's issue. Null id: not recorded (a received trail).
  issue: { id: string | null; label: string | null };
}

/**
 * The FR-APR-007 record of a decided step, read from what was stored. Null for a step
 * not decided. Nothing here reads current configuration: an issue revised since reads
 * as the one the route pinned.
 */
export function decidedStepRecord(step: StoredStep, route: StoredRoute): DecidedStepRecord | null {
  if (step.decision !== "DONE" && step.decision !== "REJECTED") return null;
  const actor: DecidedStepRecord["actor"] = step.decidedByPersonId
    ? { kind: "PERSON", personId: step.decidedByPersonId, name: step.decidedByName ?? "" }
    : step.committeeDecisionId
      ? { kind: "COMMITTEE", name: step.decidedByName ?? "", committeeDecisionId: step.committeeDecisionId }
      : { kind: "NAMED_ONLY", name: step.decidedByName ?? "" };
  const overridden = route.fundingOverrideApplied && route.overrideMatrixId != null;
  return {
    actor,
    office: { code: step.actingRoleCode ?? step.roleCode, label: step.actingRoleLabel ?? step.roleLabel },
    act: step.act,
    decision: step.decision,
    underDelegation: step.delegationId != null,
    decidedOn: step.decidedOn,
    recordedAt: step.recordedAt,
    comment: step.reason,
    clause: route.ruleClause,
    issue: overridden ? { id: route.overrideMatrixId, label: route.overrideMatrixLabel } : { id: route.authorityMatrixId, label: route.matrixLabel },
  };
}
