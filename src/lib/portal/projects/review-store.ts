import type { Tx } from "@/lib/audit/record";
import { pageOf } from "@/lib/certificate/library";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";

import { serviceState, type ServiceState } from "./submission";
import type { SubmissionKind, SubmissionOutcome } from "./types";

/**
 * The review queue of contractors' submissions, as the officers read it on the Documents register (6.14 OD-6, BD-614-31; Phase 4e): every submission of the organisation, the ones
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

const KINDS: SubmissionKind[] = ["WORK_PROGRAMME", "INTERIM_CLAIM", "MATERIALS_ON_SITE", "DELAY_NOTICE", "DEFECTS_RECTIFIED", "STATUTORY_DECLARATION"];

/// The queue's counts, from the whole register by count queries (never from a page): waiting, and overdue (waiting past its due day, as `serviceState` reads it: due on the day is not
/// overdue). No day (the time zone not set): nothing is judged overdue.
export async function reviewCounts(client: Tx, organisationId: string, today: string | null): Promise<{ waiting: number; overdue: number; answered: number }> {
  const [waiting, overdue, answered] = await Promise.all([
    client.contractorSubmission.count({ where: { organisationId, outcome: null } }),
    today ? client.contractorSubmission.count({ where: { organisationId, outcome: null, dueOn: { lt: dayToDate(today) } } }) : Promise.resolve(0),
    client.contractorSubmission.count({ where: { organisationId, outcome: { not: null } } }),
  ]);
  return { waiting, overdue, answered };
}

export interface ReviewQueue {
  /// Waiting for an answer, the longest waiting first, one page.
  waiting: { rows: ReviewRow[]; total: number; page: number };
  /// Answered, the latest sent first, one page.
  answered: { rows: ReviewRow[]; total: number; page: number };
  overdue: number;
  unsetKinds: SubmissionKind[];
}

/// The queue as the officers read it: each list paged in the database (4e review fix: it was one capped read, and the counts came from the cap).
export async function loadReviewQueue(client: Tx, organisationId: string, today: string | null, pages: { waiting?: string; answered?: string } = {}): Promise<ReviewQueue> {
  const [counts, settings] = await Promise.all([reviewCounts(client, organisationId, today), client.contractorSubmissionSetting.findMany({ where: { organisationId }, select: { kind: true, serviceLevelDays: true } })]);
  const waitingPage = pageOf(pages.waiting, counts.waiting, REVIEW_PAGE);
  const answeredPage = pageOf(pages.answered, counts.answered, REVIEW_PAGE);
  const include = { contract: { select: { number: true, award: { select: { awardeeName: true } } } }, decidedBy: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" as const } } };
  const [waitingRows, answeredRows] = await Promise.all([
    client.contractorSubmission.findMany({ where: { organisationId, outcome: null }, orderBy: [{ submittedAt: "asc" }, { id: "asc" }], skip: waitingPage * REVIEW_PAGE, take: REVIEW_PAGE, include }),
    client.contractorSubmission.findMany({ where: { organisationId, outcome: { not: null } }, orderBy: [{ submittedAt: "desc" }, { id: "asc" }], skip: answeredPage * REVIEW_PAGE, take: REVIEW_PAGE, include }),
  ]);
  const set = new Set(settings.filter((s) => s.serviceLevelDays != null).map((s) => s.kind as SubmissionKind));
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
      aboutDay: r.aboutDay ? formatDate(storedDay(r.aboutDay)) : null,
      sentOn: formatDate(sentDay),
      sentDay,
      signed: r.signedAt != null,
      routedTo: r.routedToRoleLabel,
      service: serviceState({ dueOn: r.dueOn ? storedDay(r.dueOn) : null, decidedOn: r.decidedOn ? storedDay(r.decidedOn) : null, today: today ?? sentDay }),
      outcome: r.outcome as SubmissionOutcome | null,
      outcomeNote: r.outcomeNote,
      decidedBy: r.decidedBy?.name ?? null,
      decidedOn: r.decidedOn ? formatDate(storedDay(r.decidedOn)) : null,
      lines: r.lines.map((l) => ({ description: l.description, quantity: l.quantity, location: l.location, value: formatMoney(senFromDecimal(l.value)) })),
    };
  };
  return {
    waiting: { rows: waitingRows.map(view), total: counts.waiting, page: waitingPage },
    answered: { rows: answeredRows.map(view), total: counts.answered, page: answeredPage },
    overdue: counts.overdue,
    unsetKinds: KINDS.filter((k) => !set.has(k)),
  };
}
