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
import { exerciseAllowsPanel } from "@/lib/scope/panel";
import type { PartSource, TenderPackStatus } from "@/lib/tender-docs/types";

import { OWNER_ACT_PURPOSES, PURPOSE_CLASSIFICATION, PURPOSE_OWNER, type AttachmentPurpose, type Finding, type SecurityClass } from "./types";

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
    }
  | {
      kind: "award";
      status: AwardStatus;
      instrumentKind: InstrumentKind;
      /// False only for an award accepted before return scans were required (OD-5).
      scansRequired: boolean;
    }
  /// `ended` null: today cannot be told (no time zone set), so whether it has ended is not judged (66-C2).
  | { kind: "delegation"; ended: boolean | null }
  /// 6.2: a specification panel, judged with its exercise's status. BD-62-26: the scan
  /// versions its `verifiedSnapshot` names, and the version of each live attachment of the
  /// signed form (one entry per attachment), so reliance falls only on a scan it was verified on.
  | { kind: "specificationPanel"; exerciseStatus: ExerciseStatus; status: "DRAFT" | "VERIFIED"; verifiedScanVersionIds: readonly string[]; liveScanVersionIds: readonly string[] }
  /// 6.2 Q-3: a bill of quantities version, judged with its exercise's status.
  | { kind: "bqVersion"; exerciseStatus: ExerciseStatus; status: "DRAFT" | "FINALISED" | "SUPERSEDED" }
  /// 6.4: a tender pack's part, judged with its pack's and exercise's status. Only a part whose
  /// content is uploaded (source UPLOAD) keeps a file.
  | { kind: "tenderPackPart"; exerciseStatus: ExerciseStatus; packStatus: TenderPackStatus; source: PartSource }
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
  | { kind: "supplierApplication"; open: boolean; sent: boolean };

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
  | "SITTING_CANCELLED"
  | "EXERCISE_CANCELLED"
  | "ROUTE_OPEN"
  | "AWARD_APPROVED"
  | "AWARD_NOT_ISSUED"
  | "AWARD_CANCELLED"
  | "DELEGATION_ENDED"
  | "DELEGATION_ZONE_UNSET"
  | "BQ_FINALISED"
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
  | "APPLICATION_DECIDED";

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
  | "ALREADY_ATTACHED";

/// Whether the purpose belongs on this owner at all.
export function purposeFits(purpose: AttachmentPurpose, owner: OwnerFacts): boolean {
  if (PURPOSE_OWNER[purpose] !== owner.kind) return false;
  if (owner.kind === "award") return RETURN_PURPOSES[owner.instrumentKind].includes(purpose);
  // 6.4: a part keeps a file only where its content is uploaded; a template, the bill or the
  // Appendix is frozen from its own source (FR-DOC-003).
  if (owner.kind === "tenderPackPart") return owner.source === "UPLOAD";
  // 6.5: a publication's proof belongs to an advertised window; an attendance sheet to any window.
  if (owner.kind === "exercise" && purpose === "PUBLICATION_PROOF") return owner.window?.path === "ADVERTISED";
  if (owner.kind === "exercise" && purpose === "ATTENDANCE_SHEET") return owner.window != null;
  return true;
}

/**
 * Where the owner stands for this purpose: open, not ready yet, or frozen — with the
 * way out. Shared by attach, detach and re-pin.
 */
export function ownerState(purpose: AttachmentPurpose, owner: OwnerFacts): { state: "OPEN" } | { state: "NOT_READY" | "FROZEN"; exit: OwnerExit } {
  switch (owner.kind) {
    case "meeting":
      if (owner.status === "CANCELLED") return { state: "FROZEN", exit: "SITTING_CANCELLED" };
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
      return { state: "OPEN" };
    case "award":
      if (owner.status === "CANCELLED") return { state: "FROZEN", exit: "AWARD_CANCELLED" };
      if (owner.status !== "ISSUED" && owner.status !== "ACCEPTED") return { state: "NOT_READY", exit: "AWARD_NOT_ISSUED" };
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
      const allows = exerciseAllowsPanel(owner.exerciseStatus);
      return allows === "OPEN" ? { state: "OPEN" } : { state: "FROZEN", exit: allows };
    }
    case "bqVersion":
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
  }
}

/// 6.7: the two states that follow publication (an exercise opened keeps a published one's documents);
/// 6.8 (X-8): and the evaluation's two.
const afterOpening = (s: ExerciseStatus) => s === "OPENING_IN_PROGRESS" || s === "OPENED" || s === "UNDER_EVALUATION" || s === "EVALUATED";

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
  if (st.state === "NOT_READY") out.push({ code: "OWNER_NOT_READY", level: "block", data: { exit: st.exit } });
  if (st.state === "FROZEN") out.push({ code: "OWNER_FROZEN", level: "block", data: { exit: st.exit } });
  if (i.version.withdrawnAt != null) out.push({ code: "VERSION_WITHDRAWN", level: "block" });
  const classification = i.documentClass ? (i.documentClassification === undefined ? i.documentClass.classification : i.documentClassification) : null;
  if (!i.documentClass) out.push({ code: "CLASS_NOT_SET", level: "block" });
  else if (classification == null) out.push({ code: "CLASSIFICATION_NOT_SET", level: "warn" });
  // 6.2 Q-1: a purpose that must be held at a classification is refused below it (or unset).
  const required = PURPOSE_CLASSIFICATION[i.purpose];
  if (i.documentClass && required && classification !== required) out.push({ code: "CLASSIFICATION_BELOW_PURPOSE", level: "block", data: { purpose: i.purpose, required, classification } });
  if (i.alreadyAttached) out.push({ code: "ALREADY_ATTACHED", level: "block" });
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
  | "SENT_ON_IT";

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
  if (st.state === "FROZEN") out.push({ code: "OWNER_FROZEN", level: "block", data: { exit: st.exit } });
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
  if (st.state === "FROZEN") out.push({ code: "OWNER_FROZEN", level: "block", data: { exit: st.exit } });
  if (st.state === "NOT_READY") out.push({ code: "OWNER_NOT_READY", level: "block", data: { exit: st.exit } });
  if (i.to.documentId !== i.attachment.documentId) out.push({ code: "NOT_SAME_DOCUMENT", level: "block" });
  else if (i.to.id === i.attachment.versionId) out.push({ code: "ALREADY_PINNED", level: "block" });
  if (i.to.withdrawnAt != null) out.push({ code: "VERSION_WITHDRAWN", level: "block" });
  return out;
}
