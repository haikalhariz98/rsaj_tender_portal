/**
 * Legal review (FR-CON-006): the Conditions of Contract, the contractor-signed Letter of Acceptance and
 * the bill or schedule go to the legal office, which endorses them or returns them with comments. Each
 * submission is an iteration that pins the versions it went with; a returned contract goes back only by
 * being submitted again. No limit on iterations and no timeout: the procedure states neither.
 *
 * The legal office is the one frozen when preparation started (ADR 0021); preparation does not start
 * without one, so a contract never waits on a setting changed after it.
 */

import type { ContractStatus, Finding, LegalDecision } from "./types";

export type SubmitFault = "NOT_IN_PREPARATION" | "LEGAL_OFFICE_NOT_FROZEN" | "NO_SUBMISSION_DOCUMENTS" | "FORMATION_INCOMPLETE" | "REVIEW_OPEN";

export interface ReviewFacts {
  iteration: number;
  decision: LegalDecision | null;
  submittedOn: string;
  decidedOn: string | null;
}

/// The review still with the legal office, if any.
export const openReview = <T extends ReviewFacts>(reviews: readonly T[]): T | null => reviews.find((r) => r.decision == null) ?? null;

/// The next iteration's number: one more than the last, however many came before.
export const nextIteration = (reviews: readonly ReviewFacts[]) => reviews.reduce((m, r) => Math.max(m, r.iteration), 0) + 1;

/// The endorsement in force: the last review, where it endorsed.
export function endorsement<T extends ReviewFacts>(reviews: readonly T[]): T | null {
  const last = [...reviews].sort((a, b) => b.iteration - a.iteration)[0];
  return last?.decision === "ENDORSED" ? last : null;
}

/**
 * Whether the contract may go to the legal office: while it is being prepared or has come back, with
 * the office frozen at the start of preparation, at least one document live to send (each is pinned),
 * nothing still with the office, and the assembly, reconciliation and checks complete (the legal office
 * reviews the document as it will be signed; after endorsement they no longer change).
 */
export function submitFaults(i: { status: ContractStatus; officeCode: string | null; submissionDocuments: number; formationFaults: number; reviews: readonly ReviewFacts[] }): Finding<SubmitFault>[] {
  const out: Finding<SubmitFault>[] = [];
  if (i.status !== "IN_PREPARATION" && i.status !== "RETURNED_FOR_AMENDMENT") out.push({ code: "NOT_IN_PREPARATION", level: "block" });
  if (!i.officeCode) out.push({ code: "LEGAL_OFFICE_NOT_FROZEN", level: "block" });
  if (openReview(i.reviews)) out.push({ code: "REVIEW_OPEN", level: "block" });
  if (i.submissionDocuments === 0) out.push({ code: "NO_SUBMISSION_DOCUMENTS", level: "block" });
  if (i.formationFaults > 0) out.push({ code: "FORMATION_INCOMPLETE", level: "block", data: { count: i.formationFaults } });
  return out;
}

export type DecideFault = "NO_OPEN_REVIEW" | "COMMENTS_REQUIRED" | "FUTURE_DATE" | "BEFORE_SUBMISSION";

/// A decision on the open review: returned needs the comments, and the day is neither future nor before it was sent.
export function decideFaults(i: { open: ReviewFacts | null; decision: LegalDecision; comments: string; commentsAttached: boolean; decidedOn: string; today: string }): Finding<DecideFault>[] {
  if (!i.open) return [{ code: "NO_OPEN_REVIEW", level: "block" }];
  const out: Finding<DecideFault>[] = [];
  if (i.decision === "RETURNED" && !i.comments.trim() && !i.commentsAttached) out.push({ code: "COMMENTS_REQUIRED", level: "block" });
  if (i.decidedOn > i.today) out.push({ code: "FUTURE_DATE", level: "block" });
  if (i.decidedOn < i.open.submittedOn) out.push({ code: "BEFORE_SUBMISSION", level: "block" });
  return out;
}

/// Where a decision moves the contract.
export const statusAfter = (d: LegalDecision): ContractStatus => (d === "ENDORSED" ? "LEGALLY_ENDORSED" : "RETURNED_FOR_AMENDMENT");
