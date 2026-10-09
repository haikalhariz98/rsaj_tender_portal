/**
 * What the staff inbox can hold (Phase 3c). Product vocabulary, not policy: the closed list of events a notice is raised for. `StaffNotice.kind` is checked
 * against this list in the database (migration 20261009090000, widened by 20261017090000 for the contractor's submission and by 20261018110000 for a back-dated signature to confirm), and a source test holds the two together.
 *
 * Email is not connected (INT-09), so a notice is delivered in the portal and nowhere else. That is a fact about the product, not a per-notice setting, and it is
 * said where a notice is shown, in these words.
 */

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
] as const;

export type StaffNoticeKind = (typeof STAFF_NOTICE_KINDS)[number];

/// What a notice is called on a screen. Never the key.
export const STAFF_NOTICE_KIND_LABEL: Readonly<Record<StaffNoticeKind, string>> = {
  STEP_ESCALATED: "Step escalated to you",
  STEP_MOVED_ON_ABSENCE: "Step moved to you on an absence",
  HOLDER_MARKED_ABSENT: "Someone who reports to you is away",
  ROUTE_RECALLED: "Approval recalled",
  DELEGATION_RECEIVED: "Delegation given to you",
  MATTER_NOT_CARRIED_MEMO: "Memo: matter not carried",
  CONTRACTOR_SUBMISSION: "Contractor's submission to answer",
  BACKDATE_TO_CONFIRM: "A back-dated signature to confirm",
};

/// Said on every screen that shows a notice. The delivery is a fact of the product: there is no outbound email.
export const NOTICE_DELIVERY_STATEMENT = "Shown in the portal; not sent — email is not connected (INT-09).";
