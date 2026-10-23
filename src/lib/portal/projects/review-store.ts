import type { Tx } from "@/lib/audit/record";
import { pageOf } from "@/lib/certificate/library";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { Language } from "@/lib/i18n/language";
import { formatMoney, senFromDecimal } from "@/lib/money";

import { documentsWaitingCount } from "@/lib/project-docs/waiting-read";

import { serviceState, type ServiceState } from "./submission";
import type { SubmissionKind, SubmissionOutcome } from "./types";
import { inOrder } from "@/lib/series";

/**
 * The review queue of contractors' submissions, as the officers read it on the Contracts list's "Submissions waiting" view and each contract's Submissions tab (AC-16; first the Documents register, 6.14 OD-6, BD-614-31; Phase 4e): every submission of the organisation, the ones
 * waiting (the longest waiting at the top) and the ones answered, each list paged in the database, each against its service level. Reads only, in the caller's client, for one organisation. The amount claimed is the contractor's own
 * figure on its own claim, shown to the officers who answer it; nothing here is a SULIT estimate.
 */

export interface ReviewRow {
  id: string;
  contractId: string;
  contractNumber: string;
  contractor: string;
  kind: SubmissionKind;
  title: string;
  body: string;
  amount: string | null;
  aboutDay: string | null;
  sentOn: string;
  sentDay: string;
  signed: boolean;
  routedTo: string | null;
  service: ServiceState;
  outcome: SubmissionOutcome | null;
  outcomeNote: string;
  decidedBy: string | null;
  decidedOn: string | null;
  lines: { description: string; quantity: string; location: string; value: string }[];
}

/// How many submissions each of the queue's two lists shows on a page.
export const REVIEW_PAGE = 50;

/// Which submissions a read covers (AC-16): one contract's, or the whole organisation's. There is no restricted-exercise filter: a submission is on an issued contract, contract stages stay
/// visible after issue (AC-18, AC-19), and the Superintending Officer who must answer it (FR-SUP-006, 009) is often not named on the exercise (FR-MTD-007 hides the exercise, not its contract).
export interface ReviewScope {
  contractId?: string;
}

const scopeWhere = (organisationId: string, scope: ReviewScope) => ({
  organisationId,
  ...(scope.contractId ? { contractId: scope.contractId } : {}),
});

/**
 * The queue's counts, from the whole register (never from a page).
 * - `waiting` reads BOTH sources (plan step 6; PW-11): the earlier submissions not yet answered, and the Project workspace's documents waiting on the organisation
 *   (`documentsWaitingCount`), so "Documents waiting" and every counter of it agree.
 * - `overdue` and `answered` are the earlier records' own, by count queries: overdue is one still unanswered past the due day STORED on it when it was sent (due on the day is
 *   not overdue; no day, the time zone not set, judges nothing overdue). The new documents have no due day and no overdue (PW-4), and the service-level editor is gone (PW-27).
 */
export async function reviewCounts(client: Tx, organisationId: string, today: string | null, scope: ReviewScope = {}): Promise<{ waiting: number; overdue: number; answered: number }> {
  const base = scopeWhere(organisationId, scope);
  const [waiting, overdue, answered] = await inOrder(
    () => documentsWaitingCount(client, organisationId, scope.contractId),
    () => today ? client.contractorSubmission.count({ where: { ...base, outcome: null, dueOn: { lt: dayToDate(today) } } }) : Promise.resolve(0),
    () => client.contractorSubmission.count({ where: { ...base, outcome: { not: null } } }));
  return { waiting, overdue, answered };
}

export interface ReviewQueue {
  /// Waiting for an answer, the longest waiting first, one page.
  waiting: { rows: ReviewRow[]; total: number; page: number };
  /// Answered, the latest sent first, one page.
  answered: { rows: ReviewRow[]; total: number; page: number };
  overdue: number;
}

/// The queue as the officers read it: each list paged in the database (4e review fix: it was one capped read, and the counts came from the cap).
export async function loadReviewQueue(client: Tx, organisationId: string, today: string | null, pages: { waiting?: string; answered?: string } = {}, scope: ReviewScope = {}, lang: Language = "en"): Promise<ReviewQueue> {
  // The earlier queue pages the earlier records alone: its waiting list is theirs, counted here (the shared `reviewCounts.waiting` reads both sources).
  const counts = { ...(await reviewCounts(client, organisationId, today, scope)), waiting: await client.contractorSubmission.count({ where: { ...scopeWhere(organisationId, scope), outcome: null } }) };
  const waitingPage = pageOf(pages.waiting, counts.waiting, REVIEW_PAGE);
  const answeredPage = pageOf(pages.answered, counts.answered, REVIEW_PAGE);
  const base = scopeWhere(organisationId, scope);
  const include = { contract: { select: { number: true, award: { select: { awardeeName: true } } } }, decidedBy: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" as const } } };
  const [waitingRows, answeredRows] = await inOrder(
    () => client.contractorSubmission.findMany({ where: { ...base, outcome: null }, orderBy: [{ submittedAt: "asc" }, { id: "asc" }], skip: waitingPage * REVIEW_PAGE, take: REVIEW_PAGE, include }),
    () => client.contractorSubmission.findMany({ where: { ...base, outcome: { not: null } }, orderBy: [{ submittedAt: "desc" }, { id: "asc" }], skip: answeredPage * REVIEW_PAGE, take: REVIEW_PAGE, include }));
  const view = (r: (typeof waitingRows)[number]): ReviewRow => {
    const sentDay = storedDay(r.submittedOn);
    return {
      id: r.id,
      contractId: r.contractId,
      contractNumber: r.contract.number,
      contractor: r.contract.award.awardeeName,
      kind: r.kind as SubmissionKind,
      title: r.title,
      body: r.body,
      amount: r.amount == null ? null : formatMoney(senFromDecimal(r.amount)),
      aboutDay: r.aboutDay ? formatDate(storedDay(r.aboutDay), lang) : null,
      sentOn: formatDate(sentDay, lang),
      sentDay,
      signed: r.signedAt != null,
      routedTo: r.routedToRoleLabel,
      service: serviceState({ dueOn: r.dueOn ? storedDay(r.dueOn) : null, decidedOn: r.decidedOn ? storedDay(r.decidedOn) : null, today: today ?? sentDay }),
      outcome: r.outcome as SubmissionOutcome | null,
      outcomeNote: r.outcomeNote,
      decidedBy: r.decidedBy?.name ?? null,
      decidedOn: r.decidedOn ? formatDate(storedDay(r.decidedOn), lang) : null,
      lines: r.lines.map((l) => ({ description: l.description, quantity: l.quantity, location: l.location, value: formatMoney(senFromDecimal(l.value)) })),
    };
  };
  return {
    waiting: { rows: waitingRows.map(view), total: counts.waiting, page: waitingPage },
    answered: { rows: answeredRows.map(view), total: counts.answered, page: answeredPage },
    overdue: counts.overdue,
  };
}
