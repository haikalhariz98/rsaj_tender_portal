/**
 * The vocabulary of the simple Project workspace (ADR 0042, plan step 2 §3): the sides, the kinds, the outcomes, who acts, and the facts of one document
 * as the rules read them. No rule is here: the state is in `state.ts`, the faults of each act in `faults.ts`, what the contractor sees in `visibility.ts`,
 * the upload bounds in `bounds.ts`. The store (plan step 4) reads the rows under the document's lock and hands them over in these shapes. Pure.
 */

import type { SubmissionKind } from "@/lib/portal/projects/types";

export type { Finding, Level } from "@/lib/contract/types";

/// The schema's `ProjectSide`, mirrored so the rules stay free of the client (`types-schema.test.ts` holds the two equal).
export const SIDES = ["CONTRACTOR", "ORGANISATION"] as const;
export type Side = (typeof SIDES)[number];
export const otherSide = (s: Side): Side => (s === "CONTRACTOR" ? "ORGANISATION" : "CONTRACTOR");

/// ADR 0045 D5: the schema's `PaymentRoute`, mirrored so the rules stay free of the client (`types.test.ts` holds the two equal): how a contract type is paid. Null is not set.
export const PAYMENT_ROUTES = ["CERTIFIED_CLAIM", "DELIVERY_ORDER_INVOICE"] as const;
export type PaymentRoute = (typeof PAYMENT_ROUTES)[number];

/// The six kinds (PW-9): the legacy submission's kinds, reused, as the schema reuses `ContractorSubmissionKind`.
export type DocKind = SubmissionKind;

/// The schema's `ProjectDocumentOutcome`: an approver's answer (APPROVED, REJECTED; PW-6, PW-7) or the mark on a version of a kind (TAKEN_UP, RETURNED; PW-9).
/// TAKEN_UP is stored the same on every kind; on defects rectified its words are "Noted" (PW-24, `labels.ts`).
export const OUTCOMES = ["APPROVED", "REJECTED", "TAKEN_UP", "RETURNED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/**
 * Who does an act.
 * - ORGANISATION: a staff person. `authorityToday` is PW-5 on the organisation's today: they hold or act in the contract's S.O. office, or are a representative
 *   in force whose letter lists contractor communication. It is `mayActForOrganisation` (`side.ts`), which is `capacityFor`. It is NOT `recorderFaultToday`
 *   alone: that lets a person with no office and no delegation through (it judges only representatives), and PW-5 says other staff read only.
 * - CONTRACTOR: a portal account of the awardee, for a contract it holds (`inHeldContract` passed).
 */
export type Actor = { side: "ORGANISATION"; personId: string; authorityToday: boolean } | { side: "CONTRACTOR"; accountId: string };

/// One version of a document, as stored. `uploadedOn` is the organisation's day (YYYY-MM-DD).
export interface VersionFacts {
  id: string;
  number: number;
  uploaderPersonId: string | null;
  uploaderAccountId: string | null;
  noApproversAtUpload: boolean;
  requestId: string | null;
  uploadedOn: string;
}

/// A named approver (PW-6). `removed`: removed with a reason; a removed approver's decisions no longer count.
export interface ApproverFacts {
  id: string;
  personId: string;
  removed: boolean;
}

/// A decision on a version: an approver's (`approverId` set) or the mark on a kind (`approverId` null).
export interface DecisionFacts {
  versionId: string;
  approverId: string | null;
  outcome: Outcome;
  remarks: string;
}

/**
 * A request for a document. `toSide` is always the document's side and the asker is always the other side (trigger PA042, PW-30), so who asked is derived,
 * never stored twice: `askedBy(r)` in `state.ts`. `answered`: a version names it.
 */
export interface RequestFacts {
  id: string;
  toSide: Side;
  answered: boolean;
}

/// One document and everything the rules read of it, under its lock.
export interface DocumentFacts {
  side: Side;
  kind: DocKind | null;
  versions: readonly VersionFacts[];
  approvers: readonly ApproverFacts[];
  decisions: readonly DecisionFacts[];
  requests: readonly RequestFacts[];
}
