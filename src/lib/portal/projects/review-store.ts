import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";

import { serviceState, type ServiceState } from "./submission";
import type { SubmissionKind, SubmissionOutcome } from "./types";

/**
 * The review queue of contractors' submissions, as the officers read it on the Documents register (6.14 OD-6, BD-614-31; Phase 4e): every submission of the organisation, the ones
 * waiting first and the longest waiting at the top, each against its service level. Reads only, in the caller's client, for one organisation. The amount claimed is the contractor's own
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

export async function loadReviewQueue(client: Tx, organisationId: string, today: string | null): Promise<{ rows: ReviewRow[]; waiting: number; overdue: number; unsetKinds: SubmissionKind[] }> {
  const [rows, settings] = await Promise.all([
    client.contractorSubmission.findMany({
      where: { organisationId },
      orderBy: [{ outcome: { sort: "asc", nulls: "first" } }, { submittedAt: "asc" }],
      take: 500,
      include: { contract: { select: { number: true, award: { select: { awardeeName: true } } } }, decidedBy: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" } } },
    }),
    client.contractorSubmissionSetting.findMany({ where: { organisationId }, select: { kind: true, serviceLevelDays: true } }),
  ]);
  const set = new Set(settings.filter((s) => s.serviceLevelDays != null).map((s) => s.kind as SubmissionKind));
  const out: ReviewRow[] = rows.map((r) => {
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
  });
  const kinds: SubmissionKind[] = ["WORK_PROGRAMME", "INTERIM_CLAIM", "MATERIALS_ON_SITE", "DELAY_NOTICE", "DEFECTS_RECTIFIED", "STATUTORY_DECLARATION"];
  return { rows: out, waiting: out.filter((r) => r.outcome == null).length, overdue: out.filter((r) => r.service.state === "OVERDUE").length, unsetKinds: kinds.filter((k) => !set.has(k)) };
}
