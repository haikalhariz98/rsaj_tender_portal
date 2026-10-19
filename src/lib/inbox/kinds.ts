/**
 * What the staff inbox can hold (Phase 3c). Product vocabulary, not policy: the closed list of events a notice is raised for. `StaffNotice.kind` is checked
 * against this list in the database (migration 20261009090000, widened by 20261017090000 for the contractor's submission by 20261018110000 for a back-dated signature to confirm and by 20261110000000 for the indent-expiry and late-commencement notices), and a source test holds the two together.
 *
 * Email is not connected (INT-09), so a notice is delivered in the portal and nowhere else. That is a fact about the product, not a per-notice setting, and it is
 * said where a notice is shown, in these words.
 */

import { w, type Words } from "@/lib/contract/labels";

export const STAFF_NOTICE_KINDS = [
  /// A pending step was escalated to an office the recipient holds.
  "STEP_ESCALATED",
  /// A pending step moved to an office the recipient holds because its holder was marked absent (FR-APR-012).
  "STEP_MOVED_ON_ABSENCE",
  /// A person who reports to the recipient was marked absent (FR-APR-012).
  "HOLDER_MARKED_ABSENT",
  /// The originator recalled a route a step of which was waiting on the recipient's office (FR-APR-017).
  "ROUTE_RECALLED",
  /// The recipient was given a delegation (FR-APR-011).
  "DELEGATION_RECEIVED",
  /// A committee did not carry a matter: the memo to the implementing department (FR-CTE-009).
  "MATTER_NOT_CARRIED_MEMO",
  /// A contractor sent a submission from its portal account, routed to the S.O. office the recipient holds (Phase 4e; 6.14 OD-6, BD-614-31).
  "CONTRACTOR_SUBMISSION",
  /// A signer named the recipient as authorising a back-dated signature (NFR-AUD-006, Phase 5a): the recipient confirms it, as a signature of their own.
  "BACKDATE_TO_CONFIRM",
  /// An issued award's indent ran past its expiry day with the award not commenced (FR-AWD-006): the requester, the requesting unit's head and the case owner are told (design note 0004 C13, F-4).
  "INDENT_EXPIRED",
  /// An issued award's work has not commenced by the end of the grace period (FR-AWD-009): the same people are told.
  "COMMENCEMENT_LATE",
] as const;

export type StaffNoticeKind = (typeof STAFF_NOTICE_KINDS)[number];

/// What a notice is called on a screen. Never the key.
export const STAFF_NOTICE_KIND_LABEL: Readonly<Record<StaffNoticeKind, Words>> = {
  STEP_ESCALATED: w("Step escalated to you"),
  STEP_MOVED_ON_ABSENCE: w("Step moved to you on an absence"),
  HOLDER_MARKED_ABSENT: w("Someone who reports to you is away"),
  ROUTE_RECALLED: w("Approval recalled"),
  DELEGATION_RECEIVED: w("Delegation given to you"),
  MATTER_NOT_CARRIED_MEMO: w("Memo: matter not carried"),
  CONTRACTOR_SUBMISSION: w("Contractor's submission to answer"),
  BACKDATE_TO_CONFIRM: w("A back-dated signature to confirm"),
  INDENT_EXPIRED: w("An indent has expired"),
  COMMENCEMENT_LATE: w("Work has not commenced"),
};

/// Said on every screen that shows a notice. The delivery is a fact of the product: there is no outbound email.
/**
 * AC-47: opening a notice from the inbox marks it read, as the reader's own act, except for a closed list of one kind: a notice asking its reader to confirm a back-dated signature is
 * not read by opening it, because opening the page is not the act it asks for. It is marked read when the confirmation is recorded. No other kind is exempt. "Mark all as read" clears
 * every kind, that one included: it is the reader's explicit choice.
 */
export const READ_WHEN_ACTED_ON: readonly StaffNoticeKind[] = ["BACKDATE_TO_CONFIRM"];
export const markedReadByOpening = (kind: string): boolean => !(READ_WHEN_ACTED_ON as readonly string[]).includes(kind);

export const NOTICE_DELIVERY_STATEMENT = "Shown here, not emailed";
