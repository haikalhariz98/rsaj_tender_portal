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
  | "DOSSIER_EVIDENCE"
  | "COORDINATION_SCOPE"
  | "HOLDER_RECOMMENDATION"
  | "SIGNED_LETTER"
  | "DECLARATION"
  | "AUTHORISATION"
  | "ACCEPTANCE_PAGE";

export const ATTACHMENT_PURPOSES: readonly AttachmentPurpose[] = [
  "SIGNED_MINUTES",
  "DOSSIER_EVIDENCE",
  "COORDINATION_SCOPE",
  "HOLDER_RECOMMENDATION",
  "SIGNED_LETTER",
  "DECLARATION",
  "AUTHORISATION",
  "ACCEPTANCE_PAGE",
];

/// The owners a document can be attached to. New owners arrive by migration with their
/// module (MatterKind precedent); each is a typed key on DocumentAttachment.
export type OwnerKind = "meeting" | "exercise" | "award" | "delegation";
export const OWNER_KINDS: readonly OwnerKind[] = ["meeting", "exercise", "award", "delegation"];

/// Which owner each purpose belongs to. The migration's CHECK says the same.
export const PURPOSE_OWNER: Readonly<Record<AttachmentPurpose, OwnerKind>> = {
  SIGNED_MINUTES: "meeting",
  DOSSIER_EVIDENCE: "exercise",
  COORDINATION_SCOPE: "exercise",
  HOLDER_RECOMMENDATION: "delegation",
  SIGNED_LETTER: "award",
  DECLARATION: "award",
  AUTHORISATION: "award",
  ACCEPTANCE_PAGE: "award",
};

/// The column on DocumentAttachment that names each owner.
export const OWNER_COLUMN: Readonly<Record<OwnerKind, "meetingId" | "exerciseId" | "awardId" | "delegationId">> = {
  meeting: "meetingId",
  exercise: "exerciseId",
  award: "awardId",
  delegation: "delegationId",
};

/// The types the product can tell from a file's own bytes. Office files and ZIP are not
/// among them: a ZIP signature cannot tell a DOCX from anything else. HTML and SVG never.
export const KNOWN_MEDIA_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/tiff"] as const;
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
