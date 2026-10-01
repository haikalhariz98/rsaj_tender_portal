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
import { PURPOSE_OWNER, type AttachmentPurpose, type Finding, type SecurityClass } from "./types";

export type MeetingStatus = "SCHEDULED" | "IN_PROGRESS" | "MINUTED" | "CANCELLED";
export type ExerciseStatus = "DRAFT" | "DOCUMENTS_IN_PREPARATION" | "CANCELLED";
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
    }
  | {
      kind: "award";
      status: AwardStatus;
      instrumentKind: InstrumentKind;
      /// False only for an award accepted before return scans were required (OD-5).
      scansRequired: boolean;
    }
  | { kind: "delegation"; ended: boolean };

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
  return owner.kind !== "exercise" || exercisePurposes(owner.method).includes(purpose);
}

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
  | "DELEGATION_ENDED";

export type AttachFault =
  | "PURPOSE_NOT_FOR_OWNER"
  | "PURPOSE_NOT_FOR_METHOD"
  | "OWNER_NOT_READY"
  | "OWNER_FROZEN"
  | "VERSION_WITHDRAWN"
  | "CLASS_NOT_SET"
  | "CLASSIFICATION_NOT_SET"
  | "ALREADY_ATTACHED";

/// Whether the purpose belongs on this owner at all.
export function purposeFits(purpose: AttachmentPurpose, owner: OwnerFacts): boolean {
  if (PURPOSE_OWNER[purpose] !== owner.kind) return false;
  if (owner.kind === "award") return RETURN_PURPOSES[owner.instrumentKind].includes(purpose);
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
      if (owner.status === "CANCELLED") return { state: "FROZEN", exit: "EXERCISE_CANCELLED" };
      if (purpose === "DOSSIER_EVIDENCE") {
        if (owner.awardApproved) return { state: "FROZEN", exit: "AWARD_APPROVED" };
        if (owner.appointmentRouteOpen) return { state: "FROZEN", exit: "ROUTE_OPEN" };
      }
      return { state: "OPEN" };
    case "award":
      if (owner.status === "CANCELLED") return { state: "FROZEN", exit: "AWARD_CANCELLED" };
      if (owner.status !== "ISSUED" && owner.status !== "ACCEPTED") return { state: "NOT_READY", exit: "AWARD_NOT_ISSUED" };
      return { state: "OPEN" };
    case "delegation":
      return owner.ended ? { state: "FROZEN", exit: "DELEGATION_ENDED" } : { state: "OPEN" };
  }
}

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
}

export function attachFault(i: AttachInput): Finding<AttachFault>[] {
  const out: Finding<AttachFault>[] = [];
  if (!purposeFits(i.purpose, i.owner)) return [{ code: "PURPOSE_NOT_FOR_OWNER", level: "block", data: { purpose: i.purpose, owner: i.owner.kind } }];
  if (!methodKeeps(i.purpose, i.owner)) return [{ code: "PURPOSE_NOT_FOR_METHOD", level: "block", data: { purpose: i.purpose, reason: i.owner.kind === "exercise" && i.owner.method == null ? "METHOD_NOT_CONFIGURED" : "METHOD_DOES_NOT_ASK" } }];
  const st = ownerState(i.purpose, i.owner);
  if (st.state === "NOT_READY") out.push({ code: "OWNER_NOT_READY", level: "block", data: { exit: st.exit } });
  if (st.state === "FROZEN") out.push({ code: "OWNER_FROZEN", level: "block", data: { exit: st.exit } });
  if (i.version.withdrawnAt != null) out.push({ code: "VERSION_WITHDRAWN", level: "block" });
  if (!i.documentClass) out.push({ code: "CLASS_NOT_SET", level: "block" });
  else if ((i.documentClassification === undefined ? i.documentClass.classification : i.documentClassification) == null) out.push({ code: "CLASSIFICATION_NOT_SET", level: "warn" });
  if (i.alreadyAttached) out.push({ code: "ALREADY_ATTACHED", level: "block" });
  return out;
}

/// Why an attachment cannot simply be taken off: something was judged on it.
export type Reliance =
  /// An award accepted on its return scans (OD-5): the scan is part of what it was accepted on.
  | "ACCEPTED_ON_IT"
  /// A delegation standing on the absent holder's attached recommendation, its last live one (OD-6).
  | "GRANTED_ON_IT";

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
 * attachments of the purpose the owner holds (this one included). Only the last live one
 * is relied on; a duplicate may come off. The one definition: the owner acts refuse by it
 * and the screens disable Detach by it, so the two give the same reason.
 */
export function reliedOn(purpose: AttachmentPurpose, owner: OwnerFacts, liveOfPurpose: number): Reliance | null {
  if (liveOfPurpose > 1) return null;
  if (owner.kind === "award") return awardReliance(purpose, owner);
  // OD-6: a delegation stands on its attached recommendation; the last live one is
  // replaced by a new version, never simply taken off.
  if (owner.kind === "delegation") return purpose === "HOLDER_RECOMMENDATION" ? "GRANTED_ON_IT" : null;
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

export type RepinFault = "REASON_REQUIRED" | "OWNER_FROZEN" | "OWNER_NOT_READY" | "VERSION_WITHDRAWN" | "NOT_SAME_DOCUMENT" | "ALREADY_PINNED" | "ALREADY_DETACHED";

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
