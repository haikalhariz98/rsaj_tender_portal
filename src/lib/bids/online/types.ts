/**
 * The domain contract of online sealed bids (wave 3b, ADR 0036 D5 to D9; build plan §1.2, written verbatim).
 */

import type { PeriodUnit } from "@/generated/prisma/enums";

export type SubmissionChannel = "PAPER" | "ONLINE";
export type OnlineSubmissionMode = "DEMONSTRATION" | "LIVE";
export type OnlineBidKind = "BID" | "ALTERNATIVE";
export type OnlineBidStatus = "SUBMITTED" | "REPLACED" | "WITHDRAWN" | "OPENED";
export type OnlineBidFileState = "DRAFT" | "SUBMITTED" | "DISCARDED";
export type GrantUse = "OPENING_CHECK" | "FINALISE";
/// What a stored bid file may read: THREAT and ERROR are refused and never stored (D6). NOT_SCANNED only under DEMONSTRATION with no scanner.
export type StoredScan = "CLEAN" | "NOT_SCANNED";

export interface BidPartRule { packPartId: string; label: string; mandatory: boolean; returnedByBidder: boolean; acceptedMediaTypes: string[]; maxBytes: string; openingCheck: boolean }
export interface OnlineBidRules { v: 1; frozenAt: string; parts: BidPartRule[] }

/// Money is a decimal string, at most 2 places, > 0; never a float (`parseDeclaration`).
export interface Declaration { price: string; completionPeriod: number; completionUnit: PeriodUnit }

/// Sealed at submit. parentOnlineBidId is the parent AT SUBMISSION; the row's current parent may since have moved (ADR 0036 D7).
export interface Manifest {
  v: 1; exerciseId: string; onlineBidId: string; supplierId: string; supplierAccountId: string;
  kind: OnlineBidKind; parentOnlineBidId: string | null; replacesOnlineBidId: string | null;
  files: { fileId: string; packPartId: string; cipherSha256: string }[];
  declarationCipherSha256: string;
}
export interface FileMeta { v: 1; filename: string; mediaType: string; plainSha256: string; plainBytes: string }

/// "Your receipt. It records what the portal told you." Never "signed" or "proof" (20j).
export interface Receipt { exerciseId: string; sequence: number; receivedAt: string; late: boolean; keyFingerprint: string; receiptDigest: string; demonstration: boolean; alternativeNotConsidered: boolean }

export type SubmitFault =
  | "CHANNEL_NOT_ONLINE" | "ONLINE_NOT_SET" | "ONLINE_NOT_ALLOWED" | "NOT_PUBLISHED" | "CANCELLED" | "KEY_NOT_LIVE"
  | "NO_LIVE_SALE"               // saleStands (17c, 20m)
  | "NOT_ON_INVITEE_LIST"        // matches the purchase's check (20m)
  | "LIVE_BID_HELD"              // a second main bid while one stands, or a late bid beside a live in-time one (FR-BID-005)
  | "REPLACE_AFTER_CLOSING" | "NOTHING_TO_REPLACE"
  | "ALTERNATIVES_NOT_STATED"    // defensive only: publication refuses while unset (20h)
  | "PARENT_NOT_YOUR_LIVE_BID"   // a named parent that is not the supplier's own live bid (20h)
  | "LATE_CLOSED"                // late submission ends when the main opening is started (20b)
  | "PRICE_INVALID" | "PERIOD_INVALID" | "UNIT_NOT_SET"
  | "FILE_NOT_YOURS" | "FILE_NOT_DRAFT" | "PART_UNKNOWN" | "NO_FILES"
  | "TOO_MANY_SUBMISSIONS";      // per supplier per exercise (20e)
export type WithdrawFault = "NOT_YOURS" | "NOT_LIVE" | "AFTER_CLOSING" | "CANCELLED" | "ALTERNATIVE_NOT_LINKED";
export type PartUploadFault =
  | "CHANNEL_NOT_ONLINE" | "ONLINE_NOT_ALLOWED" | "NOT_PUBLISHED" | "KEY_NOT_LIVE" | "FINGERPRINT_MISMATCH" | "NO_LIVE_SALE" | "NOT_ON_INVITEE_LIST" | "LATE_CLOSED"
  | "PART_UNKNOWN" | "PART_NOT_RETURNED" | "TYPES_NOT_SET" | "TYPE_NOT_ACCEPTED" | "OFFICE_REFUSED" | "SIZE_NOT_SET" | "TOO_LARGE" | "EMPTY"
  | "BODY_TOO_SLOW" | "HASH_MISMATCH" | "THREAT" | "SCAN_ERROR" | "TOO_MANY_DRAFT_FILES";
export interface SubmissionWarning { code: "MANDATORY_PART_MISSING" | "ALTERNATIVE_NOT_CONSIDERED" | "REPLACE_REUPLOADS_ALL"; packPartId?: string; label?: string }
