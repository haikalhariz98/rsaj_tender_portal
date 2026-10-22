/**
 * An owner's rows, mapped to the facts `attachFault`, `detachFault` and `ownerState`
 * judge. Pure, and the one mapping: the owner acts call it on rows read under the owner's
 * lock, and the screens call it on the same rows read for display, so a disabled action
 * and a refused one always give the same reason.
 */

import { dayToDate } from "@/lib/dates";
import { hasEnded } from "@/lib/effective";
import { isClassificationSnapshot } from "@/lib/method/snapshot";
import { verifiedScanVersionIds } from "@/lib/scope/panel";
import type { PartSource, TenderPackStatus } from "@/lib/tender-docs/types";
import type { ContractStatus } from "@/lib/contract/types";

import type { AwardStatus, EvaluationState, ExerciseMethodFlags, ExerciseStatus, InstrumentKind, MeetingStatus, OwnerFacts } from "./attach";
import { isLive } from "./evidence";

export const meetingFacts = (m: { status: MeetingStatus }): OwnerFacts => ({ kind: "meeting", status: m.status });

/**
 * What an exercise's method asks it to keep. A decided exercise keeps what its method
 * asked when it was decided (its classification snapshot), whatever the method says now;
 * a draft keeps what its configured method asks. Null where neither is known.
 */
export function exerciseMethodFlags(classificationSnapshot: unknown, configured: ExerciseMethodFlags | null): ExerciseMethodFlags | null {
  const flags = isClassificationSnapshot(classificationSnapshot) ? classificationSnapshot.method.flags : configured;
  return flags ? { requiresDossier: !!flags.requiresDossier, requiresCoordinationRecord: !!flags.requiresCoordinationRecord } : null;
}

/// `awards`: the exercise's awards, with how many appointment routes each has open.
/// `method`: `exerciseMethodFlags` of the exercise.
/// `window`: 6.5's invitation window, where the exercise has one (its path decides the window's purposes).
export function exerciseFacts(
  ex: { status: ExerciseStatus },
  awards: readonly { status: string; openAppointmentRoutes: number }[],
  method: ExerciseMethodFlags | null,
  window: { path: "ADVERTISED" | "INVITED" } | null = null,
  publication?: PublicationFacts,
): OwnerFacts {
  return {
    kind: "exercise",
    status: ex.status,
    appointmentRouteOpen: awards.some((a) => a.openAppointmentRoutes > 0),
    awardApproved: awards.some((a) => a.status === "APPROVED" || a.status === "ISSUED" || a.status === "ACCEPTED"),
    method,
    window,
    // Go-live R4: what the published schedule of tenders is judged on. Left unread, each reads as not met (the rule fails closed).
    ...(publication ? { restricted: publication.restricted, openingFinalised: publication.openingFinalised } : {}),
    awardIssued: awards.some((a) => a.status === "ISSUED" || a.status === "ACCEPTED"),
  };
}

/// What the published schedule needs of its exercise besides its status: whether it is confidential, and whether its main opening is finalised.
export interface PublicationFacts {
  restricted: boolean;
  openingFinalised: boolean;
}

/// The same two facts from what an exercise read carries (`restricted`, and its main openings' `finalisedAt`).
export const publicationFactsOf = (ex: { restricted: boolean; openings: readonly { finalisedAt: Date | null }[] }): PublicationFacts => ({
  restricted: ex.restricted,
  openingFinalised: ex.openings.some((o) => o.finalisedAt != null),
});

/// The select every exercise read adds for `publicationFactsOf`.
export const PUBLICATION_FACTS_SELECT = { restricted: true, openings: { where: { kind: "MAIN" as const }, select: { finalisedAt: true } } } as const;

/// OD-5: an award accepted with no return-scan snapshot was accepted before scans were required.
export function awardFacts(a: { status: AwardStatus; instrumentKind: InstrumentKind; returnScanSnapshot: unknown }): OwnerFacts {
  return { kind: "award", status: a.status, instrumentKind: a.instrumentKind, scansRequired: !(a.status === "ACCEPTED" && a.returnScanSnapshot == null) };
}

/// 6.2: a specification panel, with its exercise's status, the scans its snapshot names
/// (BD-62-26; a missing or malformed snapshot names none) and its live signed-form attachments.
export const panelFacts = (p: {
  status: "DRAFT" | "VERIFIED";
  exercise: { status: ExerciseStatus; specPanelUsed: boolean | null };
  verifiedSnapshot: unknown;
  attachments: readonly { purpose: string; versionId: string; detachedAt: Date | null; version: { withdrawnAt: Date | null } }[];
}): OwnerFacts => ({
  kind: "specificationPanel",
  exerciseStatus: p.exercise.status,
  status: p.status,
  verifiedScanVersionIds: verifiedScanVersionIds(p.verifiedSnapshot),
  liveScanVersionIds: p.attachments.filter((a) => a.purpose === "SPEC_PANEL_FORM" && isLive(a)).map((a) => a.versionId),
  // SR-08: the exercise's pin.
  used: p.exercise.specPanelUsed,
});

/// What a panel's facts are read from: its snapshot and its signed-form attachments, live or not.
export const PANEL_FACTS_SELECT = {
  status: true,
  verifiedSnapshot: true,
  attachments: { where: { purpose: "SPEC_PANEL_FORM" as const }, select: { purpose: true, versionId: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
} as const;

/// 6.2 Q-3: a bill of quantities version, with its exercise's status.
export const bqVersionFacts = (v: { status: "DRAFT" | "FINALISED" | "SUPERSEDED"; exercise: { status: ExerciseStatus; onScreenBillUsed: boolean | null } }): OwnerFacts => ({ kind: "bqVersion", exerciseStatus: v.exercise.status, status: v.status, onScreen: v.exercise.onScreenBillUsed });

/// 6.4: a tender pack's part, with its pack's and exercise's status and where its content comes from.
export const tenderPackPartFacts = (p: { source: PartSource; pack: { status: TenderPackStatus; exercise: { status: ExerciseStatus; onScreenBillUsed?: boolean | null } }; _count?: { attachments: number } }): OwnerFacts => ({
  kind: "tenderPackPart",
  exerciseStatus: p.pack.exercise.status,
  packStatus: p.pack.status,
  source: p.source,
  // SR-09: the exercise's pin. Absent (a caller that does not read it): not set, which keeps the bill part closed to a file.
  billOnScreen: p.pack.exercise.onScreenBillUsed ?? null,
  liveFiles: p._count?.attachments ?? 0,
});

/// 6.5: an addendum, with its exercise's status.
export const addendumFacts = (a: { status: "DRAFT" | "ISSUED" | "VOID"; window: { exercise: { status: ExerciseStatus } } }): OwnerFacts => ({
  kind: "addendum",
  exerciseStatus: a.window.exercise.status,
  status: a.status,
});

/// 6.6 (X-11): a bid withdrawal, with its exercise's status.
export const withdrawalFacts = (w: { exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "bidWithdrawal", exerciseStatus: w.exercise.status });

/// 6.7 (FR-OPN-006): an opening, with its exercise's status and whether it is finalised.
export const openingFacts = (o: { finalisedAt: Date | null; exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "opening", exerciseStatus: o.exercise.status, finalised: o.finalisedAt != null });

/// 6.8: an evaluation version, with its exercise's status, its state and whether its Kertas Cadangan is signed by both.
export const evaluationFacts = (e: { state: EvaluationState; exercise: { status: ExerciseStatus }; proposalPaper: { checkedByPersonId: string | null; recommendedByPersonId: string | null } | null }): OwnerFacts => ({
  kind: "evaluation",
  exerciseStatus: e.exercise.status,
  state: e.state,
  proposalSigned: !!e.proposalPaper?.checkedByPersonId && !!e.proposalPaper.recommendedByPersonId,
});

/// 6.8: a clarification or negotiation meeting, with its evaluation's state and whether it is closed.
export const evaluationMeetingFacts = (m: { closedAt: Date | null; evaluation: { state: EvaluationState; exercise: { status: ExerciseStatus } } }): OwnerFacts => ({
  kind: "evaluationMeeting",
  exerciseStatus: m.evaluation.exercise.status,
  evaluationState: m.evaluation.state,
  closed: m.closedAt != null,
});

/// 6.8: a bidder under evaluation, with its evaluation's state and whether a CPR is entered on it.
export const evaluationBidderFacts = (b: { cprPercent: unknown; evaluation: { state: EvaluationState; exercise: { status: ExerciseStatus } } }): OwnerFacts => ({
  kind: "evaluationBidder",
  exerciseStatus: b.evaluation.exercise.status,
  evaluationState: b.evaluation.state,
  cprEntered: b.cprPercent != null,
});

/**
 * 6.12: a contract, where it stands, whether it has gone to legal review and whether the contractor has
 * signed; and (6.12 review) the legal office's comments a return stands on: the documents attached as
 * comments from a returned review's sending to its decision (the window the decide act accepts them in),
 * with every attachment of those documents since (a replacement by attachNewVersion is the same document).
 */
export const contractFacts = (c: {
  status: ContractStatus;
  signatures: readonly { party: string }[];
  legalReviews: readonly { decision?: string | null; submittedAt?: Date; decidedAt?: Date | null }[];
  attachments?: readonly { purpose: string; versionId: string; attachedAt: Date; detachedAt: Date | null; version: { documentId: string; withdrawnAt: Date | null } }[];
}): OwnerFacts => {
  const returned = c.legalReviews.filter((r) => r.decision === "RETURNED" && r.submittedAt && r.decidedAt);
  const comments = (c.attachments ?? []).filter((a) => a.purpose === "LEGAL_COMMENTS");
  const docs = new Set(comments.filter((a) => returned.some((r) => a.attachedAt >= r.submittedAt! && a.attachedAt <= r.decidedAt!)).map((a) => a.version.documentId));
  const returnComments = comments.filter((a) => docs.has(a.version.documentId)).map((a) => ({ versionId: a.versionId, documentId: a.version.documentId, live: a.detachedAt == null && a.version.withdrawnAt == null }));
  return {
    kind: "contract",
    status: c.status,
    legalSubmitted: c.legalReviews.length > 0,
    contractorSigned: c.signatures.some((s) => s.party === "CONTRACTOR"),
    // Present only where a return stands on comments, so a contract with none reads as before.
    ...(returnComments.length ? { returnComments } : {}),
  };
};

/// 6.15: a supplier's document, renewed or not, verified or not.
export const supplierDocumentFacts = (d: { verification: string; renewedBy: { id: string } | null }): OwnerFacts => ({ kind: "supplierDocument", renewed: d.renewedBy != null, verified: d.verification === "VERIFIED" });

/// 6.15: a supplier's application, open or decided, and whether it has been sent for decision (a route open or approved).
export const supplierApplicationFacts = (a: { status: string; lapsedRecordedAt: Date | null; routes: readonly { status: string }[] }): OwnerFacts => ({
  kind: "supplierApplication",
  open: (a.status === "RECEIVED" || a.status === "RESUBMISSION_REQUESTED") && a.lapsedRecordedAt == null,
  sent: a.routes.some((r) => r.status === "PENDING" || r.status === "APPROVED"),
});

/// 6.6 (FR-BID-010): a validity extension, with its exercise's status and whether it is applied.
export const extensionFacts = (x: { appliedAt: Date | null; exercise: { status: ExerciseStatus } }): OwnerFacts => ({ kind: "validityExtension", exerciseStatus: x.exercise.status, applied: x.appliedAt != null });

/// Ended once its end day has come, in the organisation's days: the end day is not
/// included, as `inForceOn` reads it (65-C1). `hasEnded` is that rule's end half. With no
/// time zone set (`today` null) it is not judged: `ended` is null, never the UTC day's answer (66-C2).
export function delegationFacts(d: { effectiveTo: Date | null }, today: string | null): OwnerFacts {
  return { kind: "delegation", ended: today ? hasEnded(d, dayToDate(today)) : null };
}

/// 6.13 Part A acceptance S-2 (FR-VAR-015): what an S.O.'s Instruction is judged and named by.
export const VARIATION_INSTRUCTION_FACTS_SELECT = {
  certificate: { select: { status: true, number: true } },
  variation: { select: { id: true, status: true, reference: true, contractId: true, contract: { select: { status: true, number: true, award: { select: { awardeeName: true } } } } } },
} as const;
type InstructionRow = { certificate: { status: string; number: string | null }; variation: { status: string; reference: string | null; contract: { status: ContractStatus; number: string; award: { awardeeName: string } } } };
export const variationInstructionFacts = (i: InstructionRow): OwnerFacts => ({ kind: "variationInstruction", contractStatus: i.variation.contract.status, certificateStatus: i.certificate.status, variationClosed: i.variation.status === "CLOSED" });
/// 6.15 (615-C2): what a standing event (a registration cancelled) is judged and named by.
export const CANCELLATION_OWNER_SELECT = { kind: true, withdrawnAt: true, bodyLabelSnapshot: true, externalReference: true, supplierId: true, supplier: { select: { reference: true } } } as const;
type CancellationRow = { kind: string; withdrawnAt: Date | null; bodyLabelSnapshot: string; externalReference: string; supplierId: string; supplier: { reference: string } };
export const cancellationOwnerFacts = (e: CancellationRow): OwnerFacts => ({ kind: "standingEvent", cancellation: e.kind === "REGISTRATION_CANCELLED", withdrawn: e.withdrawnAt != null });
export const cancellationOwnerLabel = (e: CancellationRow) =>
  e.kind === "REGISTRATION_CANCELLED" ? `${e.supplier.reference} · Registration cancelled by ${e.bodyLabelSnapshot} (${e.externalReference})` : `${e.supplier.reference} · A standing record`;
/// 6.13 Part B run 1b (FR-EOT-001): what a delay notice is judged and named by.
export const DELAY_NOTICE_FACTS_SELECT = { contractId: true, receivedOn: true, path: true, contract: { select: { status: true, number: true, award: { select: { awardeeName: true } } } } } as const;
type DelayNoticeRow = { contractId: string; receivedOn: Date; path: string; contract: { status: ContractStatus; number: string; award: { awardeeName: string } } };
export const delayNoticeFacts = (n: DelayNoticeRow): OwnerFacts => ({ kind: "delayNotice", contractStatus: n.contract.status });
export const delayNoticeLabel = (n: DelayNoticeRow) => `Contract ${n.contract.number} · ${n.path === "SO_DIRECTION" ? "the S.O.'s direction to give reasons" : "notice of delay"} received ${n.receivedOn.toISOString().slice(0, 10)}`;
/// 6.13 Part B run 1b (FR-EOT-005, 006): what an EOT claim is judged and named by.
export const EOT_CLAIM_FACTS_SELECT = { contractId: true, entitlement: true, isWeather: true, matter: { select: { reference: true, closedAt: true } }, contract: { select: { status: true, number: true, award: { select: { awardeeName: true } } } } } as const;
type EotClaimRow = { contractId: string; entitlement: string | null; isWeather: boolean; matter: { reference: string | null; closedAt: Date | null }; contract: { status: ContractStatus; number: string; award: { awardeeName: string } } };
export const eotClaimFacts = (c: EotClaimRow): OwnerFacts => ({ kind: "eotClaim", contractStatus: c.contract.status, determined: c.entitlement != null, closed: c.matter.closedAt != null, isWeather: c.isWeather });
export const eotClaimLabel = (c: EotClaimRow) => `Contract ${c.contract.number} · extension-of-time claim ${c.matter.reference ?? "(not yet numbered)"}`;
/// ADR 0042 D1: what a Project workspace version is judged and named by.
export const PROJECT_DOCUMENT_VERSION_FACTS_SELECT = { number: true, document: { select: { id: true, title: true, contractId: true, contract: { select: { status: true, number: true } } } } } as const;
type ProjectDocumentVersionRow = { number: number; document: { id: string; title: string; contractId: string; contract: { status: ContractStatus; number: string } } };
export const projectDocumentVersionFacts = (v: ProjectDocumentVersionRow): OwnerFacts => ({ kind: "projectDocumentVersion", contractStatus: v.document.contract.status });
export const projectDocumentVersionLabel = (v: ProjectDocumentVersionRow) => `Contract ${v.document.contract.number} · ${v.document.title}, version ${v.number}`;
export const variationInstructionLabel = (i: InstructionRow) =>
  `Contract ${i.variation.contract.number} · variation ${i.variation.reference ?? "(not yet numbered)"} · the S.O.'s instruction ${i.certificate.number ?? "(not yet numbered)"}`;
