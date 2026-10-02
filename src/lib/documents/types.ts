/**
 * The document store's vocabulary (plan platform-document-store.md, ADR 0011).
 *
 * Contracts first: every pure rule in this directory, the store façade, the route
 * handlers and the owner modules' seams speak these types. Nothing here reads the
 * database, the clock or the environment.
 */

/// NFR-SEC-002. One vocabulary, shared with 6.2 (scope ruling, BD-DS-1).
export type SecurityClass = "PUBLIC" | "INTERNAL" | "SULIT";
export const SECURITY_CLASSES: readonly SecurityClass[] = ["PUBLIC", "INTERNAL", "SULIT"];

export type RetentionTrigger = "RECEIVED" | "OWNER_CLOSED" | "CONTRACT_FINAL_ACCOUNT";
export const RETENTION_TRIGGERS: readonly RetentionTrigger[] = ["RECEIVED", "OWNER_CLOSED", "CONTRACT_FINAL_ACCOUNT"];

export type DisposalMethod = "DESTROY" | "TRANSFER_TO_ARCHIVES" | "REVIEW";
export const DISPOSAL_METHODS: readonly DisposalMethod[] = ["DESTROY", "TRANSFER_TO_ARCHIVES", "REVIEW"];

export type DocumentStatus = "STAGED" | "FILED";
export type ScanState = "NOT_SCANNED" | "CLEAN" | "THREAT";
export type AccessKind = "DOWNLOADED" | "REFUSED" | "VERIFIED" | "INTEGRITY_FAILED";

export type AttachmentPurpose =
  | "SIGNED_MINUTES"
  | "SPEC_PANEL_FORM"
  | "BQ_IMPORT_SOURCE"
  | "TENDER_PART"
  | "ADDENDUM_SIGNED"
  | "DOSSIER_EVIDENCE"
  | "COORDINATION_SCOPE"
  | "PUBLICATION_PROOF"
  | "ATTENDANCE_SHEET"
  | "WITHDRAWAL_LETTER"
  | "VALIDITY_CONSENT"
  | "SIGNED_SCHEDULE"
  | "CPR_REPORT"
  | "COMMUNICATION"
  | "MEETING_MINUTES"
  | "TENDERER_CONFIRMATION"
  | "REPORT_DRAWINGS"
  | "SIGNED_REPORT"
  | "SIGNED_PROPOSAL_PAPER"
  | "SUPPLIER_DOCUMENT"
  | "SUPPLIER_DECLARATION"
  | "SUPPLIER_EPAYMENT_FORM"
  | "HOLDER_RECOMMENDATION"
  | "SIGNED_LETTER"
  | "DECLARATION"
  | "AUTHORISATION"
  | "ACCEPTANCE_PAGE";

export const ATTACHMENT_PURPOSES: readonly AttachmentPurpose[] = [
  "SIGNED_MINUTES",
  "SPEC_PANEL_FORM",
  "BQ_IMPORT_SOURCE",
  "TENDER_PART",
  "ADDENDUM_SIGNED",
  "DOSSIER_EVIDENCE",
  "COORDINATION_SCOPE",
  "PUBLICATION_PROOF",
  "ATTENDANCE_SHEET",
  "WITHDRAWAL_LETTER",
  "VALIDITY_CONSENT",
  "SIGNED_SCHEDULE",
  "CPR_REPORT",
  "COMMUNICATION",
  "MEETING_MINUTES",
  "TENDERER_CONFIRMATION",
  "REPORT_DRAWINGS",
  "SIGNED_REPORT",
  "SIGNED_PROPOSAL_PAPER",
  "SUPPLIER_DOCUMENT",
  "SUPPLIER_DECLARATION",
  "SUPPLIER_EPAYMENT_FORM",
  "HOLDER_RECOMMENDATION",
  "SIGNED_LETTER",
  "DECLARATION",
  "AUTHORISATION",
  "ACCEPTANCE_PAGE",
];

/// The owners a document can be attached to. New owners arrive by migration with their
/// module (MatterKind precedent); each is a typed key on DocumentAttachment.
export type OwnerKind = "meeting" | "exercise" | "award" | "delegation" | "specificationPanel" | "bqVersion" | "tenderPackPart" | "addendum" | "bidWithdrawal" | "validityExtension" | "opening" | "evaluation" | "evaluationMeeting" | "evaluationBidder" | "supplierDocument" | "supplierApplication";
export const OWNER_KINDS: readonly OwnerKind[] = ["meeting", "exercise", "award", "delegation", "specificationPanel", "bqVersion", "tenderPackPart", "addendum", "bidWithdrawal", "validityExtension", "opening", "evaluation", "evaluationMeeting", "evaluationBidder", "supplierDocument", "supplierApplication"];

/// Which owner each purpose belongs to. The migration's CHECK says the same.
export const PURPOSE_OWNER: Readonly<Record<AttachmentPurpose, OwnerKind>> = {
  SIGNED_MINUTES: "meeting",
  SPEC_PANEL_FORM: "specificationPanel",
  BQ_IMPORT_SOURCE: "bqVersion",
  TENDER_PART: "tenderPackPart",
  ADDENDUM_SIGNED: "addendum",
  DOSSIER_EVIDENCE: "exercise",
  COORDINATION_SCOPE: "exercise",
  PUBLICATION_PROOF: "exercise",
  ATTENDANCE_SHEET: "exercise",
  WITHDRAWAL_LETTER: "bidWithdrawal",
  VALIDITY_CONSENT: "validityExtension",
  SIGNED_SCHEDULE: "opening",
  // 6.8: the evaluation's own papers, its meetings', and what is kept on each bidder.
  CPR_REPORT: "evaluationBidder",
  COMMUNICATION: "evaluationBidder",
  MEETING_MINUTES: "evaluationMeeting",
  TENDERER_CONFIRMATION: "evaluationMeeting",
  REPORT_DRAWINGS: "evaluation",
  SIGNED_REPORT: "evaluation",
  SIGNED_PROPOSAL_PAPER: "evaluation",
  // 6.15: a supplier's document's scan; its application's signed declaration and E-Payment form.
  SUPPLIER_DOCUMENT: "supplierDocument",
  SUPPLIER_DECLARATION: "supplierApplication",
  SUPPLIER_EPAYMENT_FORM: "supplierApplication",
  HOLDER_RECOMMENDATION: "delegation",
  SIGNED_LETTER: "award",
  DECLARATION: "award",
  AUTHORISATION: "award",
  ACCEPTANCE_PAGE: "award",
};

/// The column on DocumentAttachment that names each owner.
export type OwnerColumn = "meetingId" | "exerciseId" | "awardId" | "delegationId" | "specificationPanelId" | "bqVersionId" | "tenderPackPartId" | "addendumId" | "bidWithdrawalId" | "validityExtensionId" | "openingId" | "evaluationId" | "evaluationMeetingId" | "evaluationBidderId" | "supplierDocumentId" | "supplierApplicationId";
export const OWNER_COLUMN: Readonly<Record<OwnerKind, OwnerColumn>> = {
  meeting: "meetingId",
  exercise: "exerciseId",
  award: "awardId",
  delegation: "delegationId",
  specificationPanel: "specificationPanelId",
  bqVersion: "bqVersionId",
  tenderPackPart: "tenderPackPartId",
  addendum: "addendumId",
  bidWithdrawal: "bidWithdrawalId",
  validityExtension: "validityExtensionId",
  opening: "openingId",
  evaluation: "evaluationId",
  evaluationMeeting: "evaluationMeetingId",
  evaluationBidder: "evaluationBidderId",
  supplierDocument: "supplierDocumentId",
  supplierApplication: "supplierApplicationId",
};

/// Purposes attached only by their owner's own act, never from the shared attach choice: a
/// bill's imported CSV is attached by the import that reads it, in the same transaction (6.2
/// Q-3), so the file on a bill is always the one its lines came from.
export const OWNER_ACT_PURPOSES: readonly AttachmentPurpose[] = ["BQ_IMPORT_SOURCE"];

/// The classification a purpose's document must carry to be attached (6.2 Q-1: the signed
/// specification panel form is SULIT). A purpose not listed takes any classification.
export const PURPOSE_CLASSIFICATION: Readonly<Partial<Record<AttachmentPurpose, SecurityClass>>> = {
  SPEC_PANEL_FORM: "SULIT",
  // 6.6 conditions: a bidder's withdrawal letter identifies a bid before opening.
  WITHDRAWAL_LETTER: "SULIT",
  // 6.7 (FR-OPN-006): the signed schedule carries the prices as read and the company estimate's row.
  SIGNED_SCHEDULE: "SULIT",
  // 6.8 (E-3, NFR-SEC-002): every evaluation record is SULIT at upload, never lowered.
  CPR_REPORT: "SULIT",
  COMMUNICATION: "SULIT",
  MEETING_MINUTES: "SULIT",
  TENDERER_CONFIRMATION: "SULIT",
  REPORT_DRAWINGS: "SULIT",
  SIGNED_REPORT: "SULIT",
  SIGNED_PROPOSAL_PAPER: "SULIT",
  // 6.15 OD-3 B: the paper E-Payment form carries bank details; SULIT at upload, never downloadable before sign-in.
  SUPPLIER_EPAYMENT_FORM: "SULIT",
};

/// The types the product can tell from a file's own bytes. Office files and ZIP are not
/// among them: a ZIP signature cannot tell a DOCX from anything else. HTML and SVG never.
/// CSV (6.2 Q-3, a bill of quantities as received) is told by its bytes being clean UTF-8
/// text whose first line has a comma (`sniffMediaType`).
export const KNOWN_MEDIA_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/tiff", "text/csv"] as const;
export type KnownMediaType = (typeof KNOWN_MEDIA_TYPES)[number];
export const isKnownMediaType = (t: string): t is KnownMediaType => (KNOWN_MEDIA_TYPES as readonly string[]).includes(t);

/// The organisation's upload rules (OD-3). Unset is refusal, never a default.
export interface StorePolicy {
  /// Empty: not set.
  allowedMediaTypes: readonly string[];
  /// Null: not set.
  maxBytes: bigint | null;
}

export const UNSET_STORE_POLICY: StorePolicy = { allowedMediaTypes: [], maxBytes: null };

export type Level = "block" | "warn" | "info";

export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the text is written with (names, numbers, labels; never bytes).
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

/// A version as the rules see it.
export interface VersionFact {
  id: string;
  versionNo: number;
  sha256: string;
  withdrawnAt: Date | null;
}

/// An attachment row as the rules see it, with its pinned version and document title.
export interface AttachmentFact {
  id: string;
  purpose: AttachmentPurpose;
  detachedAt: Date | null;
  /// When it was attached. Read where a screen says what came "since"; the rules never need it.
  attachedAt?: Date;
  version: VersionFact & { documentId: string; title: string };
}
