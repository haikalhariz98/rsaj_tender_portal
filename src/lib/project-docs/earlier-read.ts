/**
 * The earlier contractor submissions (`ContractorSubmission`, Phase 4e) as the one Documents list reads them (PW-11; plan step 6 §7): the read of the table, newest first in the
 * database's order, as one source of the merged list (`merge.ts`), and each row in the staff's and in the contractor's shape. A reader, not pure; it writes nothing and takes no
 * lock. The rows are read-only and are not migrated; what each says of itself is `earlier.ts`'s.
 *
 * What a row carries is its stored fields and its stored answer, as the earlier review queue showed them. Its due day is the one stored on it, as a plain date: no live service
 * level, no "not set" prompt (PW-27) and no overdue (PW-4). The contractor's shape names the organisation, never the officer who answered.
 */

import type { Tx } from "@/lib/audit/record";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import type { SubmissionKind, SubmissionOutcome } from "@/lib/portal/projects/types";

import { earlierReading, storedDueWords } from "./earlier";
import { kindWords, outcomeWords, stateWords } from "./labels";
import { prismaAfter, type MergeLoader, type SourceAfter } from "./merge";
import type { DocumentState } from "./state";
import type { Side } from "./types";

export const EARLIER_SELECT = {
  id: true,
  contractId: true,
  kind: true,
  title: true,
  body: true,
  amount: true,
  aboutDay: true,
  submittedAt: true,
  submittedOn: true,
  signedAt: true,
  routedToRoleLabel: true,
  dueOn: true,
  outcome: true,
  outcomeNote: true,
  decidedOn: true,
  decidedBy: { select: { name: true } },
  lines: { orderBy: { sortOrder: "asc" as const }, select: { description: true, quantity: true, location: true, value: true } },
  contract: { select: { number: true, status: true, award: { select: { awardeeName: true } } } },
} as const;

export interface EarlierRow {
  at: Date;
  id: string;
  contractId: string;
  kind: SubmissionKind;
  title: string;
  body: string;
  amount: { toString(): string } | null;
  aboutDay: Date | null;
  submittedOn: Date;
  signedAt: Date | null;
  routedToRoleLabel: string | null;
  dueOn: Date | null;
  outcome: SubmissionOutcome | null;
  outcomeNote: string;
  decidedOn: Date | null;
  decidedBy: { name: string } | null;
  lines: { description: string; quantity: string; location: string; value: { toString(): string } }[];
  contract: { number: string; status: string; award: { awardeeName: string } };
}

/// One source of the merged list: the earlier records under `where` (an organisation, a contract, a supplier, unanswered), newest first, by the database's own order.
export function earlierLoader(client: Tx, where: Record<string, unknown>): MergeLoader<EarlierRow> {
  return {
    source: "EARLIER",
    async load(after: SourceAfter | null, take: number) {
      const rows = await client.contractorSubmission.findMany({ where: { ...where, AND: [prismaAfter("submittedAt", after)] }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take, select: EARLIER_SELECT });
      return rows.map((r) => ({ ...r, at: r.submittedAt, kind: r.kind as SubmissionKind, outcome: r.outcome as SubmissionOutcome | null }));
    },
  };
}

const dayText = (d: Date | null) => (d ? formatDate(storedDay(d)) : null);

/// What an earlier record holds, for its read-only view (the staff's and the contractor's alike). Words and plain dates only.
export interface EarlierFields {
  id: string;
  kindLabel: string;
  title: string;
  body: string;
  /// The amount claimed, as it was sent, or null.
  amount: string | null;
  /// The day it was about (a claim made up to, a delay arose), as sent, or null.
  aboutDay: string | null;
  sentOn: string;
  /// A statutory declaration's notice, signed with the password.
  signed: boolean;
  /// The S.O. office it was routed to, by name, or null (none was assigned).
  routedTo: string | null;
  /// "Due 19 Oct 2026" or "No due day": the due day stored on it, never judged against today.
  dueText: string;
  /// "Taken up", "Noted", "Returned", or null while unanswered.
  answerLabel: string | null;
  answerNote: string;
  answeredOn: string | null;
  lines: { description: string; quantity: string; location: string; value: string }[];
}

function fieldsOf(r: EarlierRow): EarlierFields {
  return {
    id: r.id,
    kindLabel: kindWords(r.kind),
    title: r.title,
    body: r.body,
    amount: r.amount == null ? null : formatMoney(senFromDecimal(r.amount)),
    aboutDay: dayText(r.aboutDay),
    sentOn: formatDate(storedDay(r.submittedOn)),
    signed: r.signedAt != null,
    routedTo: r.routedToRoleLabel,
    dueText: storedDueWords(r.dueOn ? storedDay(r.dueOn) : null),
    answerLabel: r.outcome ? outcomeWords(r.outcome, r.kind) : null,
    answerNote: r.outcomeNote,
    answeredOn: dayText(r.decidedOn),
    lines: r.lines.map((l) => ({ description: l.description, quantity: l.quantity, location: l.location, value: formatMoney(senFromDecimal(l.value)) })),
  };
}

/// The staff's earlier record: its fields, who answered it, and whether it may still be answered (unanswered, and the contract's supervision open: the answer's own act asks both again).
export interface StaffEarlier extends EarlierFields {
  contractor: string;
  answeredBy: string | null;
  answerable: boolean;
  /// Why it cannot be answered now, where the contract's state shuts the answer; null otherwise.
  answerShut: string | null;
}

export function staffEarlier(r: EarlierRow): StaffEarlier {
  const shut = actStatusFault("SUPERVISION", r.contract.status as ContractStatus);
  return { ...fieldsOf(r), contractor: r.contract.award.awardeeName, answeredBy: r.decidedBy?.name ?? null, answerable: r.outcome === null, answerShut: r.outcome === null && shut ? actStatusText(shut) : null };
}

/// The contractor's earlier record: its fields, answered by the organisation (never an officer by name).
export type PortalEarlier = EarlierFields;
export const portalEarlier = (r: EarlierRow): PortalEarlier => fieldsOf(r);

/// The row-level reading of an earlier record, for a list: its state, in words, and who it waits on.
export function earlierRowReading(r: Pick<EarlierRow, "outcome" | "kind">): { state: DocumentState; stateLabel: string; waitsOn: Side | null } {
  const e = earlierReading(r.outcome);
  return { state: e.state, stateLabel: stateWords(e.state, r.kind), waitsOn: e.waitsOn };
}

/// One earlier record of a contract for the staff's read-only view (`earlier=` in the Documents tab's address), or null where there is none under that id on this contract of this
/// organisation. Read by id, not from the list's page: the list is paged and filtered, and a link to an older record must still open it.
export async function loadStaffEarlier(client: Tx, i: { organisationId: string; contractId: string; id: string }): Promise<StaffEarlier | null> {
  const [row] = await earlierLoader(client, { id: i.id, organisationId: i.organisationId, contractId: i.contractId }).load(null, 1);
  return row ? staffEarlier(row) : null;
}

/// The contractor's twin of `loadStaffEarlier`: its own supplier's record only. The caller has already established that the supplier holds the contract (`loadProjectContext`).
export async function loadPortalEarlier(client: Tx, i: { organisationId: string; contractId: string; supplierId: string; id: string }): Promise<PortalEarlier | null> {
  const [row] = await earlierLoader(client, { id: i.id, organisationId: i.organisationId, contractId: i.contractId, supplierId: i.supplierId }).load(null, 1);
  return row ? portalEarlier(row) : null;
}
