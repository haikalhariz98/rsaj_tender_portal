/**
 * The notices the acts of Phase 3c raise (FR-APR-010, 011, 012, 017, FR-CTE-009), as pure drafts: who is told, what, and where it opens.
 *
 * A notice carries labels and words and never an amount: it must not give away a SULIT value to someone the value is withheld from. It names the exercise
 * it concerns, where there is one, so that a restricted exercise's notices are hidden from anyone not named on it. Its key (recipient, kind, record,
 * occurrence) is what keeps a retried act from telling anyone twice: the store writes with "skip duplicates".
 *
 * Pure.
 */

import type { StaffNoticeKind } from "./kinds";

export interface NoticeDraft {
  recipientPersonId: string;
  kind: StaffNoticeKind;
  subjectEntity: string;
  subjectId: string;
  occurrence: string;
  exerciseId: string | null;
  title: string;
  body: string;
  href: string | null;
}

/// The matter a step belongs to, by the words the worklist uses, and where it opens.
export interface MatterRef {
  label: string;
  href: string;
  /// The exercise the matter concerns, where it concerns one (for the restriction on the notice).
  exerciseId: string | null;
}

/// Everyone told, once each, in a fixed order, and never the person who did the act themselves.
function recipientsOf(ids: readonly string[], not: string | null): string[] {
  return [...new Set(ids)].sort().filter((id) => id !== not);
}

export function stepEscalatedNotices(i: {
  stepId: string;
  /// Which escalation of this step it is, so the second is another notice and a retry of the first is not.
  escalationCount: number;
  matter: MatterRef;
  actLabel: string;
  fromOffice: string;
  toOffice: string;
  /// "No one was able to act" or "A conflict of interest was declared".
  whyLabel: string;
  reason: string;
  recipients: readonly string[];
  by: string | null;
  /// The immediate superior of the office's holder, named where reporting lines are recorded, or the words "Reporting line not set".
  superiorNote: string;
}): NoticeDraft[] {
  return recipientsOf(i.recipients, i.by).map((r) => ({
    recipientPersonId: r,
    kind: "STEP_ESCALATED",
    subjectEntity: "ApprovalStep",
    subjectId: i.stepId,
    occurrence: String(i.escalationCount),
    exerciseId: i.matter.exerciseId,
    title: `A step was escalated to ${i.toOffice}`,
    body: `${i.matter.label}: the step "${i.actLabel}" moved from ${i.fromOffice} to ${i.toOffice}. ${i.whyLabel}. Reason given: ${i.reason}. ${i.superiorNote}`,
    href: i.matter.href,
  }));
}

export function stepMovedOnAbsenceNotices(i: {
  stepId: string;
  escalationCount: number;
  matter: MatterRef;
  actLabel: string;
  fromOffice: string;
  toOffice: string;
  absentName: string;
  recipients: readonly string[];
  by: string | null;
  superiorNote: string;
}): NoticeDraft[] {
  return recipientsOf(i.recipients, i.by).map((r) => ({
    recipientPersonId: r,
    kind: "STEP_MOVED_ON_ABSENCE",
    subjectEntity: "ApprovalStep",
    subjectId: i.stepId,
    occurrence: String(i.escalationCount),
    exerciseId: i.matter.exerciseId,
    title: `A step moved to ${i.toOffice} while ${i.absentName} is away`,
    body: `${i.matter.label}: the step "${i.actLabel}" waited on ${i.fromOffice}, and nobody able to act holds it now that ${i.absentName} was marked absent. It moved to ${i.toOffice}, which authority reverts to. ${i.superiorNote}`,
    href: i.matter.href,
  }));
}

export function holderMarkedAbsentNotices(i: {
  personId: string;
  personName: string;
  /// The moment of the change: a second absence of the same person is another notice.
  at: Date;
  moved: number;
  stayed: number;
  /// The steps were not looked at: whoever recorded the absence may not move approval steps (an administrator account). They wait for an officer, from the worklist.
  notMoved?: boolean;
  superiors: readonly string[];
  by: string | null;
}): NoticeDraft[] {
  const parts: string[] = [];
  if (i.moved > 0) parts.push(`${i.moved} pending ${i.moved === 1 ? "step moved" : "steps moved"} up`);
  if (i.stayed > 0) parts.push(`${i.stayed} could not be moved and stay where they are`);
  const said = i.notMoved ? " Their pending steps were not moved: an administrator account does not move approval steps, so an officer can move them from the worklist." : parts.length > 0 ? ` ${parts.join("; ")}.` : " No pending step was waiting on their office.";
  return recipientsOf(i.superiors, i.by).map((r) => ({
    recipientPersonId: r,
    kind: "HOLDER_MARKED_ABSENT",
    subjectEntity: "Person",
    subjectId: i.personId,
    occurrence: i.at.toISOString(),
    exerciseId: null,
    title: `${i.personName} was marked absent`,
    body: `${i.personName}, who reports to you, was marked absent.${said}`,
    href: "/approvals",
  }));
}

export function routeRecalledNotices(i: {
  routeId: string;
  matter: MatterRef;
  recalledBy: string;
  reason: string;
  recipients: readonly string[];
  by: string | null;
}): NoticeDraft[] {
  return recipientsOf(i.recipients, i.by).map((r) => ({
    recipientPersonId: r,
    kind: "ROUTE_RECALLED",
    subjectEntity: "ApprovalInstance",
    subjectId: i.routeId,
    occurrence: "",
    exerciseId: i.matter.exerciseId,
    title: "An approval was recalled",
    body: `${i.matter.label} was recalled by ${i.recalledBy} before any decision, so the step waiting on your office is withdrawn. Reason given: ${i.reason}.`,
    href: i.matter.href,
  }));
}

export function delegationReceivedNotice(i: {
  delegationId: string;
  /// The terms, so that a delegation changed to other terms is told again and the same terms are not.
  termsKey: string;
  toPersonId: string;
  fromName: string;
  officeLabel: string;
  /// "until 2026-10-20 (not included)" or "with no end date".
  periodWords: string;
  /// "the whole office" or "the capabilities: ...".
  whatWords: string;
  by: string | null;
}): NoticeDraft[] {
  if (i.toPersonId === i.by) return [];
  return [
    {
      recipientPersonId: i.toPersonId,
      kind: "DELEGATION_RECEIVED",
      subjectEntity: "Delegation",
      subjectId: i.delegationId,
      occurrence: i.termsKey,
      exerciseId: null,
      title: `${i.fromName} delegated ${i.officeLabel} to you`,
      body: `${i.fromName} gave you ${i.whatWords} of ${i.officeLabel}, ${i.periodWords}.`,
      href: "/approvals",
    },
  ];
}

/// Phase 4e (6.14 OD-6, BD-614-31): a contractor sent a submission from its portal account; the holders of the contract's S.O. office (and those acting in it) are told, once each. Nobody
/// did the act on the staff side, so nobody is left out. The notice carries the kind and the contract, never the amount claimed.
export function contractorSubmissionNotices(i: { submissionId: string; contractId: string; contractLabel: string; kindLabel: string; contractorName: string; dueLabel: string; recipients: readonly string[] }): NoticeDraft[] {
  return recipientsOf(i.recipients, null).map((r) => ({
    recipientPersonId: r,
    kind: "CONTRACTOR_SUBMISSION",
    subjectEntity: "ContractorSubmission",
    subjectId: i.submissionId,
    occurrence: "",
    exerciseId: null,
    title: `${i.kindLabel} from ${i.contractorName}`,
    body: `${i.contractLabel}: the contractor sent a ${i.kindLabel.toLowerCase()} from its portal account. ${i.dueLabel} It is answered from the contract's Submissions tab.`,
    // AC-16: new rows open the contract's own tab; rows written before the Documents menu went keep /documents?tab=review, which redirects permanently.
    href: `/projects/${i.contractId}?tab=submissions`,
  }));
}

export function matterNotCarriedMemo(i: {
  decisionId: string;
  matterLabel: string;
  committeeLabel: string;
  outcomeLabel: string;
  note: string;
  recipients: readonly string[];
  href: string;
  exerciseId: string | null;
}): NoticeDraft[] {
  return recipientsOf(i.recipients, null).map((r) => ({
    recipientPersonId: r,
    kind: "MATTER_NOT_CARRIED_MEMO",
    subjectEntity: "CommitteeDecision",
    subjectId: i.decisionId,
    occurrence: "",
    exerciseId: i.exerciseId,
    title: `Not approved: ${i.matterLabel}`,
    body: `${i.committeeLabel} did not carry ${i.matterLabel}. What happens next: ${i.outcomeLabel}.${i.note ? ` Note: ${i.note}` : ""}`,
    href: i.href,
  }));
}

/// FR-AWD-006 and FR-AWD-009 (design note 0004 C13, F-4): an issued award's indent ran out, or its work did not commence in time. The expiry day or the due day is the occurrence, so
/// the notice is told once however often the case is read, and a later award is another notice. No amount is named. The exercise is set, so a restricted exercise's notice is hidden.
export function caseClockNotices(i: {
  kind: "INDENT_EXPIRED" | "COMMENCEMENT_LATE";
  awardId: string;
  awardLabel: string;
  /// The expiry day, or the day the grace period ended, as the organisation's day (`YYYY-MM-DD`).
  day: string;
  /// The same day as it reads on a screen.
  dayWords: string;
  exerciseId: string;
  href: string;
  recipients: readonly string[];
}): NoticeDraft[] {
  const expired = i.kind === "INDENT_EXPIRED";
  return recipientsOf(i.recipients, null).map((r) => ({
    recipientPersonId: r,
    kind: i.kind,
    subjectEntity: "Award",
    subjectId: i.awardId,
    occurrence: i.day,
    exerciseId: i.exerciseId,
    title: expired ? `The indent has expired: ${i.awardLabel}` : `Work has not commenced: ${i.awardLabel}`,
    body: expired
      ? `${i.awardLabel}: the indent expired on ${i.dayWords} and the award has not commenced. The case page shows what the organisation's rule asks for.`
      : `${i.awardLabel}: the grace period for commencement ended on ${i.dayWords} and work has not commenced. The case page shows the consequence the variant records.`,
    href: i.href,
  }));
}
