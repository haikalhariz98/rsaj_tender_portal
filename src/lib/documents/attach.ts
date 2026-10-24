/**
 * Whether a version may be attached to, detached from, or re-pinned on an owner
 * (plan §3, OD-8). The owner module's action locks the owner row, reads these facts
 * under the lock and runs the same function the screen runs, so the two never disagree.
 *
 * "Frozen" is purpose-aware: a minuted sitting is frozen for everything except its
 * signed minutes, which can only be attached once it is minuted. Every refusal names
 * the way out (`exit`), because a state must always have one.
 */

import { isLive } from "./evidence";
import type { ExerciseStatus } from "@/lib/method/types";
import { actStatusFault, type ContractAct } from "@/lib/contract/act-status";
import { isExecuted, possessionTaken } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";
import { exerciseAllowsPanel } from "@/lib/scope/panel";
import type { PartSource, TenderPackStatus } from "@/lib/tender-docs/types";

import { OWNER_ACT_PURPOSES, PURPOSE_CLASSIFICATION, PURPOSE_OWNER, SECOND_OWNER_PURPOSES, type AttachmentPurpose, type Finding, type SecurityClass } from "./types";

export type MeetingStatus = "SCHEDULED" | "IN_PROGRESS" | "MINUTED" | "CANCELLED";
/// X-8: the one ExerciseStatus type, from the method module, never restated here.
export type { ExerciseStatus };
export type AwardStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ISSUED" | "ACCEPTED" | "CANCELLED";
export type InstrumentKind = "LETTER_OF_ACCEPTANCE" | "WORK_INDENT";

/// The owner as its lock-holding action read it.
export type OwnerFacts =
  | { kind: "meeting"; status: MeetingStatus }
  | {
      kind: "exercise";
      status: ExerciseStatus;
      /// An award's appointment route is open on the exercise.
      appointmentRouteOpen: boolean;
      /// An award on the exercise is approved, issued or accepted.
      awardApproved: boolean;
      /// What its sourcing method asks it to keep, as decided (the classification snapshot)
      /// or, while a draft, as configured now. Null where neither is known: the method is
      /// no longer configured, so the exercise keeps nothing.
      method: ExerciseMethodFlags | null;
      /// 6.5: its invitation window's path, where it has a window. Publication proofs are kept
      /// only by an advertised one, attendance sheets by any window. Absent or null: no window.
      window?: { path: "ADVERTISED" | "INVITED" } | null;
      /// Go-live R4: what the published schedule of tenders is judged on. Absent reads as not met: that purpose fails closed.
      /// `restricted`: the exercise is confidential (FR-MTD-007). `openingFinalised`: its main opening is finalised. `awardIssued`: an award is issued or accepted.
      restricted?: boolean;
      openingFinalised?: boolean;
      awardIssued?: boolean;
    }
  | {
      kind: "award";
      status: AwardStatus;
      instrumentKind: InstrumentKind;
      /// False only for an award accepted before return scans were required (OD-5).
      scansRequired: boolean;
      /// ADR 0045 D1 (WV-4): a return lodged online waits for an officer. Its scans are not mixed with paper ones: a return purpose is frozen until it is decided.
      /// Absent reads as none waiting.
      onlineReturnWaiting?: boolean;
      /// FR-AWD-006 (ruling B, 2026-10-24): an issued work indent whose stored received day is past its expiry. Set by the staff attach under the award's lock; absent reads as not late.
      indentLate?: { expiredOn: string; receivedOn: string } | null;
    }
  /// `ended` null: today cannot be told (no time zone set), so whether it has ended is not judged (66-C2).
  | { kind: "delegation"; ended: boolean | null }
  /// 6.2: a specification panel, judged with its exercise's status. BD-62-26: the scan
  /// versions its `verifiedSnapshot` names, and the version of each live attachment of the
  /// signed form (one entry per attachment), so reliance falls only on a scan it was verified on.
  | { kind: "specificationPanel"; exerciseStatus: ExerciseStatus; status: "DRAFT" | "VERIFIED"; verifiedScanVersionIds: readonly string[]; liveScanVersionIds: readonly string[]; used: boolean | null }
  /// 6.2 Q-3: a bill of quantities version, judged with its exercise's status.
  | { kind: "bqVersion"; exerciseStatus: ExerciseStatus; status: "DRAFT" | "FINALISED" | "SUPERSEDED"; onScreen: boolean | null }
  /// 6.4: a tender pack's part, judged with its pack's and exercise's status. SR-11: a part whose content is uploaded (source UPLOAD), a merged-text part
  /// (a file then replaces the merged text), and the bill part where the bill is not built on screen (SR-09, `billOnScreen` false) keep a file; the Appendix does not.
  /// `liveFiles`: the files it holds now (the bill is one file).
  | { kind: "tenderPackPart"; exerciseStatus: ExerciseStatus; packStatus: TenderPackStatus; source: PartSource; billOnScreen: boolean | null; liveFiles: number }
  /// 6.5: an addendum, judged with its exercise's status. Its signed copy changes only while it is a draft.
  | { kind: "addendum"; exerciseStatus: ExerciseStatus; status: "DRAFT" | "ISSUED" | "VOID" }
  /// 6.6 (X-11): a bid withdrawal, judged with its exercise's status. Its letter may follow the record.
  | { kind: "bidWithdrawal"; exerciseStatus: ExerciseStatus }
  /// 6.6 (FR-BID-010): a validity extension, judged with its exercise's status. Applied, it stands on its consent.
  | { kind: "validityExtension"; exerciseStatus: ExerciseStatus; applied: boolean }
  /// 6.7 (FR-OPN-006): an opening, judged with its exercise's status. Its signed schedule's scan is
  /// accepted only once it is finalised: the paper carries the estimate's row (6.2 Q-2, C-5).
  | { kind: "opening"; exerciseStatus: ExerciseStatus; finalised: boolean }
  /// 6.8 (FR-EVL-017, FR-CTE-013): an evaluation version, judged with its exercise's status. Its
  /// report's drawings are added while it is open (annex F lists them at issue); the signed report
  /// once issued; the signed Kertas Cadangan once both its signers are recorded.
  | { kind: "evaluation"; exerciseStatus: ExerciseStatus; state: EvaluationState; proposalSigned: boolean }
  /// 6.8 (FR-EVL-015, 016): a clarification or negotiation meeting; closed, it is frozen.
  | { kind: "evaluationMeeting"; exerciseStatus: ExerciseStatus; evaluationState: EvaluationState; closed: boolean }
  /// 6.8 (FR-EVL-012, 013): a bidder under evaluation; a CPR entered stands on its report (OD-4).
  | { kind: "evaluationBidder"; exerciseStatus: ExerciseStatus; evaluationState: EvaluationState; cprEntered: boolean }
  /// 6.15 (FR-VND-002, 004): a supplier's document. Renewed, it keeps what it has; verified, it stands on its scan.
  | { kind: "supplierDocument"; renewed: boolean; verified: boolean }
  /// 6.15 (FR-VND-006, OD-3 B): a supplier's application. Decided, it keeps what it has; sent for decision, it stands on its declaration.
  | { kind: "supplierApplication"; open: boolean; sent: boolean }
  /// 6.12 (FR-CON-006, 007, 009, 011): a contract, with where it stands, whether it has been sent for legal
  /// review and whether the contractor's signature is recorded (which stands on the company resolution).
  /// 6.12 review: and the legal office's comments a return stands on: every attachment of a comments document
  /// attached while a returned review was open, its later versions included (attachNewVersion keeps the document).
  | { kind: "contract"; status: ContractStatus; legalSubmitted: boolean; contractorSigned: boolean; returnComments?: readonly { versionId: string; documentId: string; live: boolean }[] }
  /// 6.13 Part A acceptance S-2 (FR-VAR-015): the S.O.'s Instruction of a variation, with its contract's status, its
  /// certificate's and whether its variation is closed. Its plans or sketches may follow its issue (not required at it).
  | { kind: "variationInstruction"; contractStatus: ContractStatus; certificateStatus: string; variationClosed: boolean }
  /// 6.15 (615-C2, BD-613-91): a supplier's standing event; only a registration cancelled takes a notice. Withdrawn as
  /// recorded in error, it keeps what it has. Nothing stands on the notice (it is the body's, attached for the record).
  | { kind: "standingEvent"; cancellation: boolean; withdrawn: boolean }
  /// 6.13 Part B run 1b (FR-EOT-001): a delay notice, with its contract's status. Its scan may follow the record.
  | { kind: "delayNotice"; contractStatus: ContractStatus }
  /// 6.13 Part B run 1b (FR-EOT-005, 006): an EOT claim, with its contract's status, whether it is determined or closed
  /// (it then stands on what it was determined with) and whether it is a weather claim (only one keeps meteorological
  /// records).
  | { kind: "eotClaim"; contractStatus: ContractStatus; determined: boolean; closed: boolean; isWeather: boolean }
  /// ADR 0042 D1: a version of a Project workspace document, with its contract's status. Its files are pinned by the workspace act that makes the version
  /// (`OWNER_ACT_PURPOSES`), never from the shared attach choice; the PROJECT_WORKSPACE row is read first, as every contract purpose reads its family's.
  | { kind: "projectDocumentVersion"; contractStatus: ContractStatus };

/// 6.8: where an evaluation version stands (the Prisma enum's values).
export type EvaluationState = "OPEN" | "ISSUED" | "SUPERSEDED" | "CANCELLED";

/// Whether an exercise's status freezes what it (and its panel and bill) holds. Exhaustive
/// (X-8): a status added to ExerciseStatus fails to compile here until it is decided.
export function exerciseFrozen(status: ExerciseStatus): boolean {
  switch (status) {
    case "DRAFT":
    case "DOCUMENTS_IN_PREPARATION":
    // 6.4: the exercise's own documents stay open while its pack is with approval and after;
    // the pack's parts freeze with the pack (`tenderPackPart`), not with the exercise.
    case "PENDING_APPROVAL_FOR_TENDERING":
    case "APPROVED_FOR_TENDERING":
    // 6.5: published, the exercise keeps its publication proofs and attendance sheets.
    case "ADVERTISED":
    case "INVITED":
    // 6.7: opening and opened, the exercise's own documents stay open.
    case "OPENING_IN_PROGRESS":
    case "OPENED":
    // 6.8 (X-8): under evaluation and evaluated follow the opening.
    case "UNDER_EVALUATION":
    case "EVALUATED":
      return false;
    case "CANCELLED":
      return true;
    default: {
      const never: never = status;
      return never;
    }
  }
}

/// The two things a sourcing method can ask an exercise to keep a document for.
export interface ExerciseMethodFlags {
  requiresDossier: boolean;
  requiresCoordinationRecord: boolean;
}

/// What a method asks an exercise to keep: dossier evidence and/or the coordination scope document.
export function exercisePurposes(flags: ExerciseMethodFlags | null): AttachmentPurpose[] {
  return [...(flags?.requiresDossier ? (["DOSSIER_EVIDENCE"] as const) : []), ...(flags?.requiresCoordinationRecord ? (["COORDINATION_SCOPE"] as const) : [])];
}

/**
 * Whether the owner's method keeps this purpose. Only an exercise has a method: it keeps
 * dossier evidence only where its method takes a dossier, and a coordination scope
 * document only where its method records a coordination meeting. Every other owner keeps
 * whatever `purposeFits` allows. Judged on attach only: what an exercise already holds can
 * still be taken off or re-pinned after its draft method changes.
 */
export function methodKeeps(purpose: AttachmentPurpose, owner: OwnerFacts): boolean {
  // 6.5: the window's purposes are kept by the window (`purposeFits`), never by the method.
  if (owner.kind !== "exercise" || !METHOD_PURPOSES.includes(purpose)) return true;
  return exercisePurposes(owner.method).includes(purpose);
}

/// The exercise purposes its sourcing method decides.
const METHOD_PURPOSES: readonly AttachmentPurpose[] = ["DOSSIER_EVIDENCE", "COORDINATION_SCOPE"];

/// The return scans each instrument comes back with (FR-AWD-003, 008).
export const RETURN_PURPOSES: Readonly<Record<InstrumentKind, readonly AttachmentPurpose[]>> = {
  LETTER_OF_ACCEPTANCE: ["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"],
  WORK_INDENT: ["ACCEPTANCE_PAGE"],
};

/// What to do instead, for a frozen or not-yet-ready owner. Rendered by labels.ts.
export type OwnerExit =
  | "MINUTE_FIRST"
  | "START_FIRST"
  | "SITTING_CANCELLED"
  | "EXERCISE_CANCELLED"
  | "ROUTE_OPEN"
  | "AWARD_APPROVED"
  | "AWARD_NOT_ISSUED"
  | "AWARD_CANCELLED"
  | "ONLINE_RETURN_WAITING"
  | "DELEGATION_ENDED"
  | "DELEGATION_ZONE_UNSET"
  | "BQ_FINALISED"
  /// SR-08, SR-09: the exercise is pinned not to use a panel, or not to build its bill on screen, or the pin is not set.
  | "PANEL_NOT_USED"
  | "BILL_NOT_ON_SCREEN"
  | "SWITCH_NOT_SET"
  | "PACK_FROZEN"
  | "NOT_APPROVED_FOR_TENDERING"
  | "WINDOW_NOT_PUBLISHED"
  | "ADDENDUM_ISSUED"
  | "ADDENDUM_VOID"
  | "EXTENSION_APPLIED"
  | "OPENING_NOT_FINALISED"
  | "EVALUATION_CLOSED"
  | "REPORT_ISSUED"
  | "REPORT_NOT_ISSUED"
  | "PROPOSAL_NOT_SIGNED"
  | "MEETING_CLOSED"
  | "DOCUMENT_RENEWED"
  | "APPLICATION_DECIDED"
  | "CONTRACT_CANCELLED"
  | "CONTRACT_NOT_IN_PREPARATION"
  | "LEGAL_REVIEW_PENDING"
  | "LEGALLY_ENDORSED"
  | "LEGAL_NOT_SUBMITTED"
  | "CONTRACT_NOT_EXECUTED"
  | "POSSESSION_NOT_RECORDED"
  /// BD-613-115: the owning family's ACT_STATUS row refuses in the contract's state; said in the table's words (exitWords).
  | "CONTRACT_STATE"
  | "CONTRACT_EXECUTED"
  | "INSTRUCTION_VOID"
  | "VARIATION_CLOSED"
  | "CANCELLATION_WITHDRAWN"
  /// 6.13 Part B run 1b: an EOT claim determined or closed keeps what it was determined with; only a weather claim keeps
  /// meteorological records.
  | "EOT_CLAIM_DETERMINED"
  | "EOT_NOT_WEATHER"
  /// Go-live R4: the schedule of tenders is published only for an advertised exercise that is not confidential, once its opening is finalised and an award is issued.
  | "SCHEDULE_NOT_ADVERTISED"
  | "SCHEDULE_CONFIDENTIAL"
  | "SCHEDULE_OPENING_NOT_FINALISED"
  | "SCHEDULE_AWARD_NOT_ISSUED";

export type AttachFault =
  | "PURPOSE_NOT_FOR_OWNER"
  | "PURPOSE_NOT_FOR_METHOD"
  | "OWNER_NOT_READY"
  | "OWNER_FROZEN"
  | "VERSION_WITHDRAWN"
  | "CLASS_NOT_SET"
  | "CLASSIFICATION_NOT_SET"
  | "CLASSIFICATION_BELOW_PURPOSE"
  | "ATTACHED_BY_OWNER_ACT"
  | "BILL_IS_ONE_FILE"
  /// Go-live R4: the published schedule is one document, replaced by a new version, never a second one beside it.
  | "SCHEDULE_IS_ONE_FILE"
  /// Go-live R4: a purpose that must be held PUBLIC meets a document held at another classification, or none. Its own words, not the "below" ones: a class is never lowered to fit.
  | "NOT_PUBLIC"
  /// FR-AWD-006: the acceptance page of an indent received after it expired.
  | "INDENT_EXPIRED"
  | "ALREADY_ATTACHED";

/// Whether the purpose belongs on this owner at all.
export function purposeFits(purpose: AttachmentPurpose, owner: OwnerFacts): boolean {
  if (PURPOSE_OWNER[purpose] !== owner.kind) return false;
  if (owner.kind === "award") return RETURN_PURPOSES[owner.instrumentKind].includes(purpose);
  // 6.4: a part keeps a file only where its content is uploaded; a template, the bill or the
  // Appendix is frozen from its own source (FR-DOC-003).
  // SR-11 (ADR 0035): and a merged-text part takes a file that replaces its merged text, and (SR-09) the bill part where the bill is not on screen.
  if (owner.kind === "tenderPackPart") return owner.source === "UPLOAD" || owner.source === "TEMPLATE" || (owner.source === "BQ_UNPRICED" && owner.billOnScreen === false);
  // 6.5: a publication's proof belongs to an advertised window; an attendance sheet to any window.
  if (owner.kind === "exercise" && purpose === "PUBLICATION_PROOF") return owner.window?.path === "ADVERTISED";
  if (owner.kind === "exercise" && purpose === "ATTENDANCE_SHEET") return owner.window != null;
  // 615-C2: of the standing events, only a registration cancelled takes the body's notice.
  if (owner.kind === "standingEvent") return owner.cancellation;
  return true;
}

/**
 * Where the owner stands for this purpose: open, not ready yet, or frozen — with the
 * way out. Shared by attach, detach and re-pin.
 */
export type OwnerState = { state: "OPEN" } | { state: "NOT_READY" | "FROZEN"; exit: OwnerExit; act?: ContractAct; status?: ContractStatus };

/// The award's return purposes, which an online return also holds (WV-4 freezes them on the award while one waits).
const ONLINE_RETURN_PURPOSES: readonly AttachmentPurpose[] = SECOND_OWNER_PURPOSES.awardOnlineReturn ?? [];

export function ownerState(purpose: AttachmentPurpose, owner: OwnerFacts): OwnerState {
  switch (owner.kind) {
    case "meeting":
      if (owner.status === "CANCELLED") return { state: "FROZEN", exit: "SITTING_CANCELLED" };
      // The minutes are written from the sitting, so they are uploaded once it has started and
      // stay correctable (as a new version) once minuted; the signed copy follows minuting.
      if (purpose === "SITTING_MINUTES") return owner.status === "SCHEDULED" ? { state: "NOT_READY", exit: "START_FIRST" } : { state: "OPEN" };
      if (owner.status !== "MINUTED") return { state: "NOT_READY", exit: "MINUTE_FIRST" };
      return { state: "OPEN" };
    case "exercise":
      if (exerciseFrozen(owner.status)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      if (purpose === "DOSSIER_EVIDENCE") {
        if (owner.awardApproved) return { state: "FROZEN", exit: "AWARD_APPROVED" };
        if (owner.appointmentRouteOpen) return { state: "FROZEN", exit: "ROUTE_OPEN" };
      }
      // 6.5: a publication is recorded from approval for tendering on; an event is held once published.
      // 6.7 (X-8): opening and opened follow publication, so both stay open then.
      if (purpose === "PUBLICATION_PROOF" && owner.status !== "APPROVED_FOR_TENDERING" && owner.status !== "ADVERTISED" && !afterOpening(owner.status)) return { state: "NOT_READY", exit: "NOT_APPROVED_FOR_TENDERING" };
      if (purpose === "ATTENDANCE_SHEET" && owner.status !== "ADVERTISED" && owner.status !== "INVITED" && !afterOpening(owner.status)) return { state: "NOT_READY", exit: "WINDOW_NOT_PUBLISHED" };
      // Go-live R4: the schedule is public, so each of these is asked in turn and none is assumed. NOT_READY (never FROZEN) so that taking one off stays possible
      // when the exercise has since become confidential: a published file must always have a way off.
      if (purpose === "PUBLISHED_SCHEDULE") return publishedScheduleState(owner);
      return { state: "OPEN" };
    case "award":
      if (owner.status === "CANCELLED") return { state: "FROZEN", exit: "AWARD_CANCELLED" };
      if (owner.status !== "ISSUED" && owner.status !== "ACCEPTED") return { state: "NOT_READY", exit: "AWARD_NOT_ISSUED" };
      if (owner.onlineReturnWaiting && ONLINE_RETURN_PURPOSES.includes(purpose)) return { state: "FROZEN", exit: "ONLINE_RETURN_WAITING" };
      return { state: "OPEN" };
    case "delegation":
      // 66-C2: with no time zone, whether it has ended is not judged, and nothing is attached,
      // taken off or re-pinned on a guess (never the UTC day).
      if (owner.ended === null) return { state: "FROZEN", exit: "DELEGATION_ZONE_UNSET" };
      return owner.ended ? { state: "FROZEN", exit: "DELEGATION_ENDED" } : { state: "OPEN" };
    case "specificationPanel": {
      // 6.4 (BD-64-4, ADR 0013): the tender pack froze on this panel, so its signed form is
      // neither attached, taken off nor re-pinned while the pack is with approval or approved;
      // the panel's own rule (`exerciseAllowsPanel`) decides, so the two never disagree.
      // SR-08: an exercise pinned not to use a panel keeps none; one whose pin is not set is not ready for one.
      if (owner.used === false) return { state: "FROZEN", exit: "PANEL_NOT_USED" };
      if (owner.used == null) return { state: "NOT_READY", exit: "SWITCH_NOT_SET" };
      const allows = exerciseAllowsPanel(owner.exerciseStatus);
      return allows === "OPEN" ? { state: "OPEN" } : { state: "FROZEN", exit: allows };
    }
    case "bqVersion":
      // SR-09: an exercise pinned not to build its bill on screen keeps none; one whose pin is not set is not ready for one.
      if (owner.onScreen === false) return { state: "FROZEN", exit: "BILL_NOT_ON_SCREEN" };
      if (owner.onScreen == null) return { state: "NOT_READY", exit: "SWITCH_NOT_SET" };
      // A finalised or superseded bill keeps the file it was imported from, as it stands.
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      return owner.status === "DRAFT" ? { state: "OPEN" } : { state: "FROZEN", exit: "BQ_FINALISED" };
    case "tenderPackPart":
      // 6.4 (ADR 0013): a pack's parts change only while it is a draft. Submitted, approved or
      // returned, it stands as frozen; a return opens a new draft, where the file is replaced.
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      return owner.packStatus === "DRAFT" ? { state: "OPEN" } : { state: "FROZEN", exit: "PACK_FROZEN" };
    case "addendum":
      // 6.5: an issued addendum stands as issued, with the signed copy it was issued on.
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      if (owner.status === "DRAFT") return { state: "OPEN" };
      return { state: "FROZEN", exit: owner.status === "ISSUED" ? "ADDENDUM_ISSUED" : "ADDENDUM_VOID" };
    case "bidWithdrawal":
      // 6.6: the letter is kept with the withdrawal it records, whenever its scan arrives.
      return exerciseFrozen(owner.exerciseStatus) ? { state: "FROZEN", exit: "EXERCISE_CANCELLED" } : { state: "OPEN" };
    case "validityExtension":
      // 6.6: an applied extension stands on the consent it was applied on.
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      return owner.applied ? { state: "FROZEN", exit: "EXTENSION_APPLIED" } : { state: "OPEN" };
    case "opening":
      // 6.7 (C-5, 6.2 Q-2): the signed paper carries the estimate's row, so its scan enters the store
      // only after the finalising disclosed the estimate. A cancelled exercise's opening keeps what it has.
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      return owner.finalised ? { state: "OPEN" } : { state: "NOT_READY", exit: "OPENING_NOT_FINALISED" };
    case "evaluation":
      // 6.8: a superseded or cancelled version keeps what it has (FR-CTE-009: never edited).
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      if (owner.state === "SUPERSEDED" || owner.state === "CANCELLED") return { state: "FROZEN", exit: "EVALUATION_CLOSED" };
      if (purpose === "REPORT_DRAWINGS") return owner.state === "OPEN" ? { state: "OPEN" } : { state: "FROZEN", exit: "REPORT_ISSUED" };
      if (owner.state !== "ISSUED") return { state: "NOT_READY", exit: "REPORT_NOT_ISSUED" };
      if (purpose === "SIGNED_PROPOSAL_PAPER" && !owner.proposalSigned) return { state: "NOT_READY", exit: "PROPOSAL_NOT_SIGNED" };
      return { state: "OPEN" };
    case "evaluationMeeting":
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      if (owner.evaluationState !== "OPEN") return { state: "FROZEN", exit: "EVALUATION_CLOSED" };
      return owner.closed ? { state: "FROZEN", exit: "MEETING_CLOSED" } : { state: "OPEN" };
    case "evaluationBidder":
      if (exerciseFrozen(owner.exerciseStatus)) return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      return owner.evaluationState === "OPEN" ? { state: "OPEN" } : { state: "FROZEN", exit: "EVALUATION_CLOSED" };
    case "supplierDocument":
      // 6.15: a renewed document keeps the scan it was lodged with; the renewal carries its own.
      return owner.renewed ? { state: "FROZEN", exit: "DOCUMENT_RENEWED" } : { state: "OPEN" };
    case "supplierApplication":
      // 6.15: a decided application keeps what it was decided on.
      return owner.open ? { state: "OPEN" } : { state: "FROZEN", exit: "APPLICATION_DECIDED" };
    case "contract":
      return contractTableState(purpose, owner.status) ?? contractOwnerState(purpose, owner);
    case "variationInstruction": {
      // BD-613-115: the variation family's row first (a cancelled contract keeps what it has).
      const table = contractTableState(purpose, owner.contractStatus);
      if (table) return table;
      // 6.13 (FR-VAR-015): open while the instruction stands, drafted, at signing or issued (the plans may follow
      // its issue); a void instruction and a closed variation keep what they have.
      if (owner.certificateStatus === "VOID") return { state: "FROZEN", exit: "INSTRUCTION_VOID" };
      return owner.variationClosed ? { state: "FROZEN", exit: "VARIATION_CLOSED" } : { state: "OPEN" };
    }
    case "standingEvent":
      // 615-C2: open while the record stands; withdrawn as recorded in error, it keeps what it has.
      return owner.withdrawn ? { state: "FROZEN", exit: "CANCELLATION_WITHDRAWN" } : { state: "OPEN" };
    case "delayNotice":
      // BD-613-115: the EOT family's row first; then the notice keeps its scan whenever it arrives (FR-EOT-001).
      return contractTableState(purpose, owner.contractStatus) ?? { state: "OPEN" };
    case "eotClaim": {
      // BD-613-115: the EOT family's row first; then the claim's own rule (6.13 Part B run 1b, FR-EOT-005, 006).
      const table = contractTableState(purpose, owner.contractStatus);
      if (table) return table;
      if (owner.determined || owner.closed) return { state: "FROZEN", exit: "EOT_CLAIM_DETERMINED" };
      if (purpose === "METEOROLOGICAL_RECORD" && !owner.isWeather) return { state: "FROZEN", exit: "EOT_NOT_WEATHER" };
      return { state: "OPEN" };
    }
    case "projectDocumentVersion":
      // ADR 0042 D11: the PROJECT_WORKSPACE row first; then a version keeps the files it was made with (it is append-only).
      return contractTableState(purpose, owner.contractStatus) ?? { state: "OPEN" };
  }
}

/**
 * BD-613-115 (as ruled, brought forward into the Run 1a fix round, review S6): the family whose ACT_STATUS row each of a
 * contract's purposes reads first (one table, BD-613-99). The formation papers read FORMATION; the programme and the
 * site records read SUPERVISION; the instruction's plans or sketches read VARIATION. Kept exhaustive by
 * contract-act-status.test.ts (every purpose a contract or its instruction keeps).
 */
export const CONTRACT_PURPOSE_FAMILY = {
  COMPANY_RESOLUTION: "FORMATION",
  LEGAL_SUBMISSION: "FORMATION",
  LEGAL_COMMENTS: "FORMATION",
  RECONCILIATION: "FORMATION",
  SIGNED_CONTRACT: "FORMATION",
  STAMPING_CERTIFICATE: "FORMATION",
  PROGRAMME: "SUPERVISION",
  PIPE_LOG: "SUPERVISION",
  AS_BUILT: "SUPERVISION",
  DIARY_PHOTO: "SUPERVISION",
  INSTRUCTION_SKETCH: "VARIATION",
  // 6.13 Part B run 1b: the delay notice and the EOT claim's papers read EOT.
  DELAY_NOTICE: "EOT",
  METEOROLOGICAL_RECORD: "EOT",
  EOT_CALCULATION: "EOT",
  // ADR 0042 D11: a Project workspace version's files read the workspace's row.
  PROJECT_DOCUMENT_FILE: "PROJECT_WORKSPACE",
  // ADR 0045 D6: so do a supply claim's delivery order and invoice.
  DELIVERY_ORDER: "PROJECT_WORKSPACE",
  SUPPLY_INVOICE: "PROJECT_WORKSPACE",
} as const satisfies Partial<Record<AttachmentPurpose, ContractAct>>;

/**
 * The table's answer for a contract's purpose: null where its family is recorded in the state, so the purpose's own rule
 * judges it. Cancelled keeps its own words (it keeps what it has); before execution a purpose is not ready yet; any other
 * refusal freezes it, said in the table's words (CLOSED freezes every purpose, FR-FIN-014).
 */
function contractTableState(purpose: AttachmentPurpose, status: ContractStatus): OwnerState | null {
  const act: ContractAct | undefined = (CONTRACT_PURPOSE_FAMILY as Partial<Record<AttachmentPurpose, ContractAct>>)[purpose];
  // A purpose with no family named here fails closed (the test keeps the map exhaustive, so this is never reached).
  if (!act) return { state: "FROZEN", exit: "CONTRACT_STATE", status };
  const f = actStatusFault(act, status);
  if (!f) return null;
  if (f.code === "CONTRACT_CANCELLED") return { state: "FROZEN", exit: "CONTRACT_CANCELLED" };
  // 6.13 Part B run 1b: a family not recorded before execution (EOT) says so in the table's words (exitWords); no family
  // before Part B reached this, each being allowed before execution.
  if (f.code === "NOT_EXECUTED") return { state: "NOT_READY", exit: "CONTRACT_NOT_EXECUTED", act, status };
  return { state: "FROZEN", exit: "CONTRACT_STATE", act, status };
}

/**
 * 6.12: where a contract stands for each of its papers. Nothing is kept before preparation starts, and a
 * cancelled contract keeps what it has. What goes to legal review changes only while the contract is being
 * prepared or has come back for amendment (each submission pins what was live); the legal office's
 * comments arrive once it has been sent. The resolution and the reconciliation's scan are kept until the
 * contract is executed; the signed contract and the stamping certificate only after.
 */
function contractOwnerState(purpose: AttachmentPurpose, owner: Extract<OwnerFacts, { kind: "contract" }>): OwnerState {
  const s = owner.status;
  if (s === "CANCELLED") return { state: "FROZEN", exit: "CONTRACT_CANCELLED" };
  if (s === "NUMBER_ALLOCATED") return { state: "NOT_READY", exit: "CONTRACT_NOT_IN_PREPARATION" };
  // 6.13 Part B run 1a: the contract's own rule, so every state after Active counts as executed (ADR 0031).
  const executed = isExecuted(s as ContractStatus);
  switch (purpose) {
    case "LEGAL_SUBMISSION":
      if (s === "IN_PREPARATION" || s === "RETURNED_FOR_AMENDMENT") return { state: "OPEN" };
      return { state: "FROZEN", exit: s === "PENDING_LEGAL_ENDORSEMENT" ? "LEGAL_REVIEW_PENDING" : "LEGALLY_ENDORSED" };
    case "LEGAL_COMMENTS":
      if (!owner.legalSubmitted) return { state: "NOT_READY", exit: "LEGAL_NOT_SUBMITTED" };
      return executed ? { state: "FROZEN", exit: "CONTRACT_EXECUTED" } : { state: "OPEN" };
    case "COMPANY_RESOLUTION":
    case "RECONCILIATION":
      return executed ? { state: "FROZEN", exit: "CONTRACT_EXECUTED" } : { state: "OPEN" };
    case "SIGNED_CONTRACT":
    case "STAMPING_CERTIFICATE":
      return executed ? { state: "OPEN" } : { state: "NOT_READY", exit: "CONTRACT_NOT_EXECUTED" };
    // 6.13 (FR-SUP-006): the programme is submitted once the contract is executed.
    case "PROGRAMME":
      return executed ? { state: "OPEN" } : { state: "NOT_READY", exit: "CONTRACT_NOT_EXECUTED" };
    // 6.13 (FR-SUP-007, 009): the site's records are kept from possession of site. BD-613-115: from possession, not only
    // while Active, so as-built evidence is attached at practical completion (FR-PAY-021); the SUPERVISION row above
    // ends them (after making good, terminated, closed). Which diary days take photographs is run 2's carry.
    case "PIPE_LOG":
    case "AS_BUILT":
    case "DIARY_PHOTO":
      return possessionTaken(s as ContractStatus) ? { state: "OPEN" } : { state: "NOT_READY", exit: "POSSESSION_NOT_RECORDED" };
    default:
      return { state: "OPEN" };
  }
}

/// Where an exercise stands for the published schedule of tenders. Absent facts read as not met.
function publishedScheduleState(owner: Extract<OwnerFacts, { kind: "exercise" }>): OwnerState {
  if (owner.window?.path !== "ADVERTISED") return { state: "NOT_READY", exit: "SCHEDULE_NOT_ADVERTISED" };
  if (owner.restricted !== false) return { state: "NOT_READY", exit: "SCHEDULE_CONFIDENTIAL" };
  if (owner.openingFinalised !== true) return { state: "NOT_READY", exit: "SCHEDULE_OPENING_NOT_FINALISED" };
  if (owner.awardIssued !== true) return { state: "NOT_READY", exit: "SCHEDULE_AWARD_NOT_ISSUED" };
  return { state: "OPEN" };
}

/// 6.7: the two states that follow publication (an exercise opened keeps a published one's documents);
/// 6.8 (X-8): and the evaluation's two.
const afterOpening = (s: ExerciseStatus) => s === "OPENING_IN_PROGRESS" || s === "OPENED" || s === "UNDER_EVALUATION" || s === "EVALUATED";

/// The finding's data for a refused owner state: its exit, and the family and state where the table refused (exitWords).
const exitData = (st: Exclude<OwnerState, { state: "OPEN" }>) => ({ exit: st.exit, ...(st.act ? { act: st.act } : {}), ...(st.status ? { status: st.status } : {}) });

export interface AttachInput {
  purpose: AttachmentPurpose;
  owner: OwnerFacts;
  version: { withdrawnAt: Date | null };
  /// The document's class, or null where none was chosen or none is configured.
  documentClass: { classification: SecurityClass | null } | null;
  /// The document's own classification (snapshotted from its class, possibly set since).
  documentClassification?: SecurityClass | null;
  /// The same document is already attached, live, to this owner for this purpose.
  alreadyAttached?: boolean;
  /// How many live attachments of this purpose the owner already holds (read under its lock). Asked only of the purposes that hold one document.
  liveOfPurpose?: number;
  /// True when the owner's own act attaches it (the bill's import); a purpose in
  /// OWNER_ACT_PURPOSES is refused from anywhere else.
  byOwnerAct?: boolean;
}

export function attachFault(i: AttachInput): Finding<AttachFault>[] {
  const out: Finding<AttachFault>[] = [];
  if (!purposeFits(i.purpose, i.owner)) return [{ code: "PURPOSE_NOT_FOR_OWNER", level: "block", data: { purpose: i.purpose, owner: i.owner.kind } }];
  if (OWNER_ACT_PURPOSES.includes(i.purpose) && !i.byOwnerAct) return [{ code: "ATTACHED_BY_OWNER_ACT", level: "block", data: { purpose: i.purpose } }];
  if (!methodKeeps(i.purpose, i.owner)) return [{ code: "PURPOSE_NOT_FOR_METHOD", level: "block", data: { purpose: i.purpose, reason: i.owner.kind === "exercise" && i.owner.method == null ? "METHOD_NOT_CONFIGURED" : "METHOD_DOES_NOT_ASK" } }];
  const st = ownerState(i.purpose, i.owner);
  if (st.state === "NOT_READY") out.push({ code: "OWNER_NOT_READY", level: "block", data: exitData(st) });
  if (st.state === "FROZEN") out.push({ code: "OWNER_FROZEN", level: "block", data: exitData(st) });
  // Attach only, not ownerState: taking a scan off or re-pinning it stays as it was.
  if (i.owner.kind === "award" && i.owner.indentLate && RETURN_PURPOSES.WORK_INDENT.includes(i.purpose)) out.push({ code: "INDENT_EXPIRED", level: "block", data: { ...i.owner.indentLate } });
  if (i.version.withdrawnAt != null) out.push({ code: "VERSION_WITHDRAWN", level: "block" });
  const classification = i.documentClass ? (i.documentClassification === undefined ? i.documentClass.classification : i.documentClassification) : null;
  if (!i.documentClass) out.push({ code: "CLASS_NOT_SET", level: "block" });
  else if (classification == null) out.push({ code: "CLASSIFICATION_NOT_SET", level: "warn" });
  // 6.2 Q-1: a purpose that must be held at a classification is refused below it (or unset).
  const required = PURPOSE_CLASSIFICATION[i.purpose];
  if (i.documentClass && required === "PUBLIC" && classification !== "PUBLIC") out.push({ code: "NOT_PUBLIC", level: "block", data: { purpose: i.purpose, classification } });
  else if (i.documentClass && required && classification !== required) out.push({ code: "CLASSIFICATION_BELOW_PURPOSE", level: "block", data: { purpose: i.purpose, required, classification } });
  if (i.alreadyAttached) out.push({ code: "ALREADY_ATTACHED", level: "block" });
  // Go-live R4: one schedule at a time. A corrected one replaces it (a new version of the same document).
  if (i.purpose === "PUBLISHED_SCHEDULE" && (i.liveOfPurpose ?? 0) > 0 && !i.alreadyAttached) out.push({ code: "SCHEDULE_IS_ONE_FILE", level: "block" });
  // SR-09: the bill, where it is a file, is one file; a corrected one replaces it (a new version), it is not added beside it.
  if (i.owner.kind === "tenderPackPart" && i.owner.source === "BQ_UNPRICED" && i.owner.billOnScreen === false && i.owner.liveFiles > 0 && !i.alreadyAttached) out.push({ code: "BILL_IS_ONE_FILE", level: "block" });
  return out;
}

/// Why an attachment cannot simply be taken off: something was judged on it.
export type Reliance =
  /// An award accepted on its return scans (OD-5): the scan is part of what it was accepted on.
  | "ACCEPTED_ON_IT"
  /// A delegation standing on the absent holder's attached recommendation, its last live one (OD-6).
  | "GRANTED_ON_IT"
  /// 6.2 Q-1: a verified specification panel standing on its signed form's scan, its last live one.
  | "VERIFIED_ON_IT"
  /// 6.2 Q-3: a bill's lines were imported from this file.
  | "IMPORTED_FROM_IT"
  /// 6.6 (X-11): a withdrawal recorded on this letter, its last live one.
  | "WITHDRAWN_ON_IT"
  /// 6.7 (FR-OPN-006): the finalised opening's signed schedule, its last live scan (6.8 and the award read it).
  | "SCHEDULE_ON_IT"
  /// 6.8 (FR-EVL-012, OD-4): a CPR percentage entered from this report, its last live one.
  | "CPR_ON_IT"
  /// 6.15 (FR-VND-004): a document verified on this scan, its last live one.
  | "DOCUMENT_VERIFIED_ON_IT"
  /// 6.15 (FR-VND-006): an application sent for decision on this signed declaration, its last live one.
  | "SENT_ON_IT"
  /// 6.12 (FR-CON-007): the contractor's signature recorded on this company resolution, its last live one.
  | "RESOLUTION_ON_IT"
  /// 6.12 review (FR-CON-006): a legal review returned on these comments (by version, not only the last live one).
  | "RETURNED_ON_IT";

export type DetachFault = "REASON_REQUIRED" | "RELIED_ON" | "OWNER_FROZEN" | "ALREADY_DETACHED";

/**
 * Taking an attachment off its owner, with a reason. Never on a frozen owner; never
 * where a judged record relied on it — attach a new version instead, which keeps the
 * record's history and moves the pin in one audited act. After acceptance an award's
 * scan comes off only as a correction (BD-24): allowed for an award accepted before
 * scans were required, refused where its acceptance relied on the scan.
 */
export function detachFault(i: { purpose: AttachmentPurpose; owner: OwnerFacts; reason: string; reliedOn: Reliance | null; detachedAt?: Date | null }): Finding<DetachFault>[] {
  if (i.detachedAt != null) return [{ code: "ALREADY_DETACHED", level: "block" }];
  const out: Finding<DetachFault>[] = [];
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  const st = ownerState(i.purpose, i.owner);
  if (st.state === "FROZEN") out.push({ code: "OWNER_FROZEN", level: "block", data: exitData(st) });
  if (i.reliedOn) out.push({ code: "RELIED_ON", level: "block", data: { by: i.reliedOn } });
  return out;
}

/**
 * Whether a judged record relies on an attachment of this purpose, given how many live
 * attachments of the purpose the owner holds (this one included) and the version this
 * attachment pins. Only the last live one is relied on; a duplicate may come off. The one
 * definition: the owner acts refuse by it and the screens disable Detach by it, so the two
 * give the same reason.
 */
export function reliedOn(purpose: AttachmentPurpose, owner: OwnerFacts, liveOfPurpose: number, versionId?: string): Reliance | null {
  // Q-3: each imported file is what some of the bill's lines came from, so none is a
  // duplicate: a wrong one is replaced by a new version, never simply taken off.
  if (owner.kind === "bqVersion") return purpose === "BQ_IMPORT_SOURCE" ? "IMPORTED_FROM_IT" : null;
  // Q-1, BD-62-26: a verified panel stands only on the scans its snapshot names. The last of
  // those live is replaced by a new version, never simply taken off; any other scan (another
  // document, or a later version of the same one) was never verified on and may come off; and
  // where none it names is live (SCAN_GONE) nothing is relied on.
  // Asked without the attachment's version, it cannot tell which scan this is, so it fails safe:
  // relied on while any scan the snapshot names is live.
  if (owner.kind === "specificationPanel") {
    if (purpose !== "SPEC_PANEL_FORM" || owner.status !== "VERIFIED") return null;
    const liveNamed = owner.liveScanVersionIds.filter((v) => owner.verifiedScanVersionIds.includes(v)).length;
    if (versionId === undefined) return liveNamed > 0 ? "VERIFIED_ON_IT" : null;
    if (!owner.verifiedScanVersionIds.includes(versionId)) return null;
    return liveNamed > 1 ? null : "VERIFIED_ON_IT";
  }
  // 6.12 review: a return stands on the comments document attached while its review was open, and on any
  // later version of it (a replacement descends from it: attachNewVersion keeps the document). As everywhere
  // here, only the last live one is relied on: a second live copy of the same document may come off, the
  // last may not (attach a new version instead). Asked without the version, it fails safe while any is live.
  if (owner.kind === "contract" && purpose === "LEGAL_COMMENTS") {
    const named = owner.returnComments ?? [];
    if (versionId === undefined) return named.some((x) => x.live) ? "RETURNED_ON_IT" : null;
    const doc = named.find((x) => x.versionId === versionId)?.documentId;
    if (!doc) return null;
    return named.filter((x) => x.documentId === doc && x.live).length > 1 ? null : "RETURNED_ON_IT";
  }
  if (liveOfPurpose > 1) return null;
  if (owner.kind === "award") return awardReliance(purpose, owner);
  // OD-6: a delegation stands on its attached recommendation; the last live one is
  // replaced by a new version, never simply taken off.
  if (owner.kind === "delegation") return purpose === "HOLDER_RECOMMENDATION" ? "GRANTED_ON_IT" : null;
  // 6.6: a withdrawal is recorded on its letter; the last live one is replaced by a new version.
  if (owner.kind === "bidWithdrawal") return purpose === "WITHDRAWAL_LETTER" ? "WITHDRAWN_ON_IT" : null;
  // 6.7: evaluation and the award stand on the signed schedule; the last live scan is replaced, never taken off.
  if (owner.kind === "opening") return purpose === "SIGNED_SCHEDULE" ? "SCHEDULE_ON_IT" : null;
  // 6.8: a CPR entered stands on the report it was entered from; the last live one is replaced, never taken off.
  if (owner.kind === "evaluationBidder") return purpose === "CPR_REPORT" && owner.cprEntered ? "CPR_ON_IT" : null;
  // 6.15: a verified document stands on its scan; an application sent for decision on its signed declaration.
  if (owner.kind === "supplierDocument") return purpose === "SUPPLIER_DOCUMENT" && owner.verified ? "DOCUMENT_VERIFIED_ON_IT" : null;
  if (owner.kind === "supplierApplication") return purpose === "SUPPLIER_DECLARATION" && owner.sent ? "SENT_ON_IT" : null;
  // 6.12: the contractor signed on the company resolution; the last live one is replaced, never taken off.
  if (owner.kind === "contract") return purpose === "COMPANY_RESOLUTION" && owner.contractorSigned ? "RESOLUTION_ON_IT" : null;
  return null;
}

/**
 * Whether this attachment itself is relied on. Only a live one can be: a pin whose version
 * was withdrawn, or one already off the record, is not what a judged record stands on
 * now, so taking it off is never refused for reliance — even where it is the owner's
 * only attachment of the purpose and `reliedOn` would count it as the last (review carry
 * 5). `relied` is the owner's rule (`reliedOn`), asked only for a live attachment.
 */
export function reliedOnAttachment(a: { detachedAt: Date | null; version: { withdrawnAt: Date | null } }, relied: () => Reliance | null): Reliance | null {
  return isLive(a) ? relied() : null;
}

/// Whether an award's acceptance relied on a scan of this purpose (OD-5).
export function awardReliance(purpose: AttachmentPurpose, owner: OwnerFacts): Reliance | null {
  if (owner.kind !== "award" || owner.status !== "ACCEPTED" || !owner.scansRequired) return null;
  return RETURN_PURPOSES[owner.instrumentKind].includes(purpose) ? "ACCEPTED_ON_IT" : null;
}

export type RepinFault = "ATTACHED_BY_OWNER_ACT" | "REASON_REQUIRED" | "OWNER_FROZEN" | "OWNER_NOT_READY" | "VERSION_WITHDRAWN" | "NOT_SAME_DOCUMENT" | "ALREADY_PINNED" | "ALREADY_DETACHED";

/**
 * Moving an attachment's pin to another version of the same document (OD-8): one
 * audited act with a reason, refused while the owner is frozen. Judged records keep the
 * versions they were judged on in their own snapshots, so the move never rewrites them.
 */
export function repinFault(i: {
  purpose: AttachmentPurpose;
  owner: OwnerFacts;
  reason: string;
  attachment: { detachedAt: Date | null; versionId: string; documentId: string };
  to: { id: string; documentId: string; withdrawnAt: Date | null };
}): Finding<RepinFault>[] {
  if (i.attachment.detachedAt != null) return [{ code: "ALREADY_DETACHED", level: "block" }];
  // Q-3: a bill's imported file is what its lines came from; another version of it would
  // not be. The bill is corrected by importing again, which replaces the file with the lines.
  if (OWNER_ACT_PURPOSES.includes(i.purpose)) return [{ code: "ATTACHED_BY_OWNER_ACT", level: "block", data: { purpose: i.purpose } }];
  const out: Finding<RepinFault>[] = [];
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  const st = ownerState(i.purpose, i.owner);
  if (st.state === "FROZEN") out.push({ code: "OWNER_FROZEN", level: "block", data: exitData(st) });
  if (st.state === "NOT_READY") out.push({ code: "OWNER_NOT_READY", level: "block", data: exitData(st) });
  if (i.to.documentId !== i.attachment.documentId) out.push({ code: "NOT_SAME_DOCUMENT", level: "block" });
  else if (i.to.id === i.attachment.versionId) out.push({ code: "ALREADY_PINNED", level: "block" });
  if (i.to.withdrawnAt != null) out.push({ code: "VERSION_WITHDRAWN", level: "block" });
  return out;
}
