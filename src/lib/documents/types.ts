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
  | "SITTING_MINUTES"
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
  | "ACCEPTANCE_PAGE"
  | "COMPANY_RESOLUTION"
  | "LEGAL_SUBMISSION"
  | "LEGAL_COMMENTS"
  | "RECONCILIATION"
  | "SIGNED_CONTRACT"
  | "STAMPING_CERTIFICATE"
  | "PIPE_LOG"
  | "AS_BUILT"
  | "PROGRAMME"
  | "DIARY_PHOTO"
  | "INSTRUCTION_SKETCH"
  | "REGISTRATION_CANCELLATION_NOTICE"
  | "DELAY_NOTICE"
  | "METEOROLOGICAL_RECORD"
  | "EOT_CALCULATION"
  | "SUPPLIER_DRAFT_DOCUMENT"
  | "SUPPLIER_BANK_STATEMENT"
  | "ONLINE_BID_FILE"
  | "PUBLISHED_SCHEDULE"
  | "PORTAL_APPLICATION_DOCUMENT"
  | "PORTAL_APPLICATION_BANK_STATEMENT"
  | "PROJECT_DOCUMENT_FILE"
  | "DELIVERY_ORDER"
  | "SUPPLY_INVOICE";

export const ATTACHMENT_PURPOSES: readonly AttachmentPurpose[] = [
  "SIGNED_MINUTES",
  "SITTING_MINUTES",
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
  "COMPANY_RESOLUTION",
  "LEGAL_SUBMISSION",
  "LEGAL_COMMENTS",
  "RECONCILIATION",
  "SIGNED_CONTRACT",
  "STAMPING_CERTIFICATE",
  "PIPE_LOG",
  "AS_BUILT",
  "PROGRAMME",
  "DIARY_PHOTO",
  "INSTRUCTION_SKETCH",
  "REGISTRATION_CANCELLATION_NOTICE",
  "DELAY_NOTICE",
  "METEOROLOGICAL_RECORD",
  "EOT_CALCULATION",
  "SUPPLIER_DRAFT_DOCUMENT",
  "SUPPLIER_BANK_STATEMENT",
  "ONLINE_BID_FILE",
  "PUBLISHED_SCHEDULE",
  "PORTAL_APPLICATION_DOCUMENT",
  "PORTAL_APPLICATION_BANK_STATEMENT",
  "PROJECT_DOCUMENT_FILE",
  "DELIVERY_ORDER",
  "SUPPLY_INVOICE",
];

/// The owners a document can be attached to. New owners arrive by migration with their
/// module (MatterKind precedent); each is a typed key on DocumentAttachment.
export type OwnerKind = "meeting" | "exercise" | "award" | "delegation" | "specificationPanel" | "bqVersion" | "tenderPackPart" | "addendum" | "bidWithdrawal" | "validityExtension" | "opening" | "evaluation" | "evaluationMeeting" | "evaluationBidder" | "supplierDocument" | "supplierApplication" | "contract" | "variationInstruction" | "standingEvent" | "delayNotice" | "eotClaim" | "registrationDraftDocument" | "creditorProfile" | "onlineBidFile" | "portalApplicationDocument" | "portalApplicationCreditor" | "projectDocumentVersion" | "awardOnlineReturn";
export const OWNER_KINDS: readonly OwnerKind[] = ["meeting", "exercise", "award", "delegation", "specificationPanel", "bqVersion", "tenderPackPart", "addendum", "bidWithdrawal", "validityExtension", "opening", "evaluation", "evaluationMeeting", "evaluationBidder", "supplierDocument", "supplierApplication", "contract", "variationInstruction", "standingEvent", "delayNotice", "eotClaim", "registrationDraftDocument", "creditorProfile", "onlineBidFile", "portalApplicationDocument", "portalApplicationCreditor", "projectDocumentVersion", "awardOnlineReturn"];

/// Which owner each purpose belongs to. The migration's CHECK says the same.
export const PURPOSE_OWNER: Readonly<Record<AttachmentPurpose, OwnerKind>> = {
  SIGNED_MINUTES: "meeting",
  SITTING_MINUTES: "meeting",
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
  // 6.12: the contract's formation papers.
  COMPANY_RESOLUTION: "contract",
  LEGAL_SUBMISSION: "contract",
  LEGAL_COMMENTS: "contract",
  RECONCILIATION: "contract",
  SIGNED_CONTRACT: "contract",
  STAMPING_CERTIFICATE: "contract",
  // 6.13 Part A (4b): the contract's site records.
  PIPE_LOG: "contract",
  AS_BUILT: "contract",
  PROGRAMME: "contract",
  DIARY_PHOTO: "contract",
  // 6.13 Part A acceptance S-2 (FR-VAR-015): the S.O.'s Instruction's plans or sketches.
  INSTRUCTION_SKETCH: "variationInstruction",
  // 6.15 (615-C2): a registration body's notice of cancellation, on the record of the cancellation.
  REGISTRATION_CANCELLATION_NOTICE: "standingEvent",
  // 6.13 Part B run 1b (FR-EOT-001, 005, 006): the delay notice's scan; the EOT claim's meteorological records and the
  // calculation of its proposed period.
  DELAY_NOTICE: "delayNotice",
  METEOROLOGICAL_RECORD: "eotClaim",
  EOT_CALCULATION: "eotClaim",
  // 6.15 Phase 4b: a certificate a signed-in supplier uploaded to its registration draft, and the bank statement of its creditor profile.
  SUPPLIER_DRAFT_DOCUMENT: "registrationDraftDocument",
  SUPPLIER_BANK_STATEMENT: "creditorProfile",
  // Wave 3b step 15: an online bid file moved into the store once its opening is finalised, on the file it came from.
  ONLINE_BID_FILE: "onlineBidFile",
  // Go-live R4: the schedule of tenders the office publishes on the public Results page, on the exercise.
  PUBLISHED_SCHEDULE: "exercise",
  // ADR 0041 D2: a certificate and the bank statement an applicant sent with an online application, held on the application until it is decided.
  PORTAL_APPLICATION_DOCUMENT: "portalApplicationDocument",
  PORTAL_APPLICATION_BANK_STATEMENT: "portalApplicationCreditor",
  // ADR 0042 D1: a file of a Project workspace document's version, on the version.
  PROJECT_DOCUMENT_FILE: "projectDocumentVersion",
  // ADR 0045 D6 (WV-11): a supply claim's delivery order and invoice, files of the claim's version.
  DELIVERY_ORDER: "projectDocumentVersion",
  SUPPLY_INVOICE: "projectDocumentVersion",
};

/// ADR 0045 D1: an owner that also takes purposes another owner holds (PURPOSE_OWNER keeps each purpose's own). A contractor's online award return holds
/// the award's return scans until an officer verifies them onto the award. The migration's CHECK pairs each of these purposes with both owners.
export const SECOND_OWNER_PURPOSES: Readonly<Partial<Record<OwnerKind, readonly AttachmentPurpose[]>>> = {
  awardOnlineReturn: ["SIGNED_LETTER", "DECLARATION", "AUTHORISATION", "ACCEPTANCE_PAGE"],
};

/// Every owner a purpose may be attached to: its own, then any owner that also takes it.
export const purposeOwners = (p: AttachmentPurpose): OwnerKind[] => [PURPOSE_OWNER[p], ...OWNER_KINDS.filter((k) => SECOND_OWNER_PURPOSES[k]?.includes(p))];

/// The column on DocumentAttachment that names each owner.
export type OwnerColumn = "meetingId" | "exerciseId" | "awardId" | "delegationId" | "specificationPanelId" | "bqVersionId" | "tenderPackPartId" | "addendumId" | "bidWithdrawalId" | "validityExtensionId" | "openingId" | "evaluationId" | "evaluationMeetingId" | "evaluationBidderId" | "supplierDocumentId" | "supplierApplicationId" | "contractId" | "variationInstructionId" | "standingEventId" | "delayNoticeId" | "eotClaimId" | "registrationDraftDocumentId" | "creditorProfileId" | "onlineBidFileId" | "portalApplicationDocumentId" | "portalApplicationCreditorId" | "projectDocumentVersionId" | "awardOnlineReturnId";
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
  contract: "contractId",
  variationInstruction: "variationInstructionId",
  standingEvent: "standingEventId",
  delayNotice: "delayNoticeId",
  eotClaim: "eotClaimId",
  registrationDraftDocument: "registrationDraftDocumentId",
  creditorProfile: "creditorProfileId",
  onlineBidFile: "onlineBidFileId",
  portalApplicationDocument: "portalApplicationDocumentId",
  portalApplicationCreditor: "portalApplicationCreditorId",
  projectDocumentVersion: "projectDocumentVersionId",
  awardOnlineReturn: "awardOnlineReturnId",
};

/// Purposes attached only by their owner's own act, never from the shared attach choice: a
/// bill's imported CSV is attached by the import that reads it, in the same transaction (6.2
/// Q-3), so the file on a bill is always the one its lines came from.
// Phase 4b: the supplier's own uploads are attached by the upload route in the same transaction as the file, never from the staff's shared choice.
// ADR 0042 D8: a project document's files are pinned by the workspace act that makes the version, under the contract's and the document's locks. ADR 0045 D6: a supply claim's two as well.
export const OWNER_ACT_PURPOSES: readonly AttachmentPurpose[] = ["BQ_IMPORT_SOURCE", "SUPPLIER_DRAFT_DOCUMENT", "SUPPLIER_BANK_STATEMENT", "ONLINE_BID_FILE", "PORTAL_APPLICATION_DOCUMENT", "PORTAL_APPLICATION_BANK_STATEMENT", "PROJECT_DOCUMENT_FILE", "DELIVERY_ORDER", "SUPPLY_INVOICE"];

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
  // 6.15 Phase 4b (FR-VND-005): the bank statement carries the account's number and the holder's name, SULIT from upload.
  SUPPLIER_BANK_STATEMENT: "SULIT",
  // Wave 3b step 15: a bid file was sealed until the opening, and is read only by those entitled to a SULIT record of the exercise.
  ONLINE_BID_FILE: "SULIT",
  // Go-live R4: the schedule is read by the public. Exactly PUBLIC, never higher: a document held higher is refused, in its own words (`NOT_PUBLIC`).
  PUBLISHED_SCHEDULE: "PUBLIC",
  // ADR 0041 D2 (REG-1): the bank statement an applicant sent is SULIT from receipt.
  PORTAL_APPLICATION_BANK_STATEMENT: "SULIT",
};

/// The types the product can tell from a file's own bytes. A bare ZIP is not among them,
/// and neither is anything with macros: a ZIP signature alone cannot tell a workbook from
/// any other archive. HTML and SVG never. CSV (6.2 Q-3, a bill of quantities as received) is
/// told by its bytes being clean UTF-8 text whose first line has a comma (`sniffMediaType`).
/// A workbook (.xlsx) and a Word document (.docx) are told by the names their archive lists
/// (`ooxmlTypeOf`, SR-09 and SR-11: the bill of quantities and the template files are Office files).
export const KNOWN_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export type KnownMediaType = (typeof KNOWN_MEDIA_TYPES)[number];
export const isKnownMediaType = (t: string): t is KnownMediaType => (KNOWN_MEDIA_TYPES as readonly string[]).includes(t);

/// The organisation's upload rules (OD-3). Unset is refusal, never a default.
export interface StorePolicy {
  /// Empty: not set.
  allowedMediaTypes: readonly string[];
  /// Null: not set.
  maxBytes: bigint | null;
}

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
