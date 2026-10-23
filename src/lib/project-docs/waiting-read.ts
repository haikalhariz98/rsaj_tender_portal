/**
 * "Documents waiting" (plan step 6 §7; PW-11): across the organisation, what waits on the organisation, from both sources: the Project workspace's documents waiting on it
 * (received kinds, versions waiting for approval, requests to it) and the earlier contractor submissions not yet answered. With the "Waiting for me" filter (`waiting.ts`).
 * A reader, not pure; it writes nothing and takes no lock. One list, newest first, paged by a cursor (`merge.ts`), and one count for the Contracts list's view picker.
 *
 * Every reader of contractors' submissions reads both sources: this one, `reviewCounts` (`review-store.ts`), the contract's Documents list (`register.ts`) and the portal's
 * readers (`portal-read.ts`, the overview in `workspace-store.ts`). `readers-scan.test.ts` holds that list.
 *
 * Which rows: a document on a contract whose workspace is open (an act on one that is shut is refused, so listing it would ask for what cannot be done), and every earlier
 * record not yet answered, as the earlier queue listed them. Not filtered by restricted exercise (AC-18, AC-19): a contract stays visible after issue, and the officer who
 * acts is often not named on the exercise. A document can wait on the organisation only if it has a kind, a live approver, or an open request to the organisation, so only
 * those are read; the state is then judged on each, as everywhere (`documentState`).
 */

import type { Tx } from "@/lib/audit/record";
import { loadOfficePeople, officeHoldersFrom, type OfficePeople } from "@/lib/certificate/repo";
import { actStatusFault } from "@/lib/contract/act-status";
import { CONTRACT_STATUSES, type ContractStatus } from "@/lib/contract/types";
import { storedDay } from "@/lib/dates";
import { soOn } from "@/lib/supervision/so";

import { EARLIER_RECORD } from "./earlier";
import { earlierLoader, earlierRowReading, staffEarlier, type StaffEarlier } from "./earlier-read";
import { kindWords, stateWords, waitsOnWords } from "./labels";
import { walkMerged, type SourceAfter } from "./merge";
import { documentLoader, earlierHref, REGISTER_BATCH } from "./register";
import { documentState, latestVersion, type DocumentState } from "./state";
import type { DocKind } from "./types";
import { waitingForMe } from "./waiting";

export const WAITING_FILTERS = ["ALL", "MINE"] as const;
export type WaitingFilter = (typeof WAITING_FILTERS)[number];
export const isWaitingFilter = (s: unknown): s is WaitingFilter => typeof s === "string" && (WAITING_FILTERS as readonly string[]).includes(s);
export const waitingFilterWords = (f: WaitingFilter): string => (f === "ALL" ? "All waiting" : "Waiting for me");

export const DOCUMENTS_WAITING_PAGE = 50;

export interface DocumentsWaitingRow {
  id: string;
  contractId: string;
  /// "Contract {number}", and the contractor's name.
  contractNumber: string;
  contractor: string;
  title: string;
  kindLabel: string | null;
  /// The day of the latest version, or an earlier record's day sent (YYYY-MM-DD; format it with `formatDate`); null while only asked for.
  latestOn: string | null;
  stateLabel: string;
  /// For a badge's tone only; never print it.
  state: DocumentState;
  /// `Waiting on {organisation}`.
  waitsOnLabel: string | null;
  href: string;
  /// Present only on an earlier record (PW-11).
  earlier?: { label: string; record: StaffEarlier };
}

/// The contract states in which the workspace is open.
const OPEN: readonly ContractStatus[] = CONTRACT_STATUSES.filter((s) => actStatusFault("PROJECT_WORKSPACE", s) === null);

/// A document that may wait on the organisation, on a contract whose workspace is open, in the organisation (and on one contract, where scoped).
const candidateWhere = (organisationId: string, contractId?: string) => ({
  organisationId,
  ...(contractId ? { contractId } : {}),
  contract: { organisationId, status: { in: [...OPEN] } },
  OR: [{ kind: { not: null } }, { approvers: { some: { removedAt: null } } }, { requests: { some: { toSide: "ORGANISATION" as const, answeredBy: { is: null } } } }],
});

const unansweredWhere = (organisationId: string, contractId?: string) => ({ organisationId, ...(contractId ? { contractId } : {}), outcome: null });

/**
 * Whether a person holds or acts in each contract's S.O. office today, read once per contract and kept for the page: the S.O. assignment in force today and the office's holders
 * for the contract's requisition unit, with the live delegates of the whole office (`officeHoldersFrom`, as `soOfficeOn` reads it). The organisation's roster is read once.
 */
function soMembership(client: Tx, org: { id: string; code: string }, personId: string, today: string | null) {
  const seen = new Map<string, Promise<boolean>>();
  let people: Promise<OfficePeople> | null = null;
  const judge = async (contractId: string): Promise<boolean> => {
    if (!today) return false;
    const c = await client.contract.findFirst({
      where: { id: contractId, organisationId: org.id },
      select: { soAssignments: { select: { id: true, roleCode: true, roleLabel: true, effectiveOn: true, recordedAt: true } }, award: { select: { exercise: { select: { requisition: { select: { sectionUnitCode: true, requestingUnitCode: true } } } } } } },
    });
    if (!c) return false;
    const a = soOn(c.soAssignments.map((x) => ({ ...x, effectiveOn: storedDay(x.effectiveOn) })), today);
    if (!a) return false;
    people ??= loadOfficePeople(org, client);
    const req = c.award.exercise.requisition;
    const h = officeHoldersFrom(await people, a.roleCode, req.sectionUnitCode || req.requestingUnitCode, today);
    return h.holderIds.includes(personId) || h.delegates.some((d) => d.personId === personId);
  };
  return (contractId: string) => {
    let p = seen.get(contractId);
    if (!p) {
      p = judge(contractId);
      seen.set(contractId, p);
    }
    return p;
  };
}

/**
 * One page of "Documents waiting", newest first: documents waiting on the organisation and earlier records not yet answered, interleaved. Under "Waiting for me" (MINE), only
 * those the viewer is the one to act on today (`waitingForMe`). `next` is the cursor of the page after it, or null at the end.
 */
export async function loadDocumentsWaiting(
  client: Tx,
  i: { org: { id: string; code: string; name: string }; viewerPersonId: string; today: string | null; filter?: WaitingFilter; after?: string | null; take?: number },
): Promise<{ rows: DocumentsWaitingRow[]; next: string | null }> {
  const filter = i.filter ?? "ALL";
  const take = Math.min(Math.max(i.take ?? DOCUMENTS_WAITING_PAGE, 1), 200);
  const inSo = soMembership(client, i.org, i.viewerPersonId, i.today);
  const docs = documentLoader(client, candidateWhere(i.org.id));
  // The contract's number and contractor, for each document kept: read with the batch.
  const heads = {
    source: "DOCUMENT" as const,
    async load(after: SourceAfter | null, n: number) {
      const rows = await docs.load(after, n);
      const contracts = await client.projectDocument.findMany({ where: { id: { in: rows.map((r) => r.id) }, organisationId: i.org.id }, select: { id: true, contractId: true, contract: { select: { number: true, award: { select: { awardeeName: true } } } } } });
      const by = new Map(contracts.map((c) => [c.id, c]));
      return rows.map((r) => ({ ...r, head: by.get(r.id) }));
    },
  };
  return walkMerged(heads, earlierLoader(client, unansweredWhere(i.org.id)), {
    cursor: i.after ?? null,
    take,
    batch: REGISTER_BATCH,
    keep: async (m): Promise<DocumentsWaitingRow | null> => {
      if (m.source === "EARLIER") {
        const r = m.row;
        const reading = earlierRowReading(r);
        if (reading.waitsOn !== "ORGANISATION") return null;
        if (filter === "MINE" && !waitingForMe({ waitsOn: reading.waitsOn, pendingApproverPersonIds: [], ownVersionApproverPersonIds: [] }, { personId: i.viewerPersonId, holdsOrActsInSo: await inSo(r.contractId) })) return null;
        return {
          id: r.id,
          contractId: r.contractId,
          contractNumber: r.contract.number,
          contractor: r.contract.award.awardeeName,
          title: r.title,
          kindLabel: kindWords(r.kind),
          latestOn: storedDay(r.submittedOn),
          stateLabel: reading.stateLabel,
          state: reading.state,
          waitsOnLabel: waitsOnWords(reading, i.org.name),
          href: earlierHref(r.contractId, r.id),
          earlier: { label: EARLIER_RECORD, record: staffEarlier(r) },
        };
      }
      const d = m.row;
      const f = d.facts;
      if (!f || !d.head) return null;
      const reading = documentState(f);
      if (reading.waitsOn !== "ORGANISATION") return null;
      if (filter === "MINE" && !waitingForMe(reading, { personId: i.viewerPersonId, holdsOrActsInSo: await inSo(d.head.contractId) })) return null;
      return {
        id: d.id,
        contractId: d.head.contractId,
        contractNumber: d.head.contract.number,
        contractor: d.head.contract.award.awardeeName,
        title: d.title,
        kindLabel: f.kind ? kindWords(f.kind as DocKind) : null,
        latestOn: latestVersion(f)?.uploadedOn ?? null,
        stateLabel: stateWords(reading.state, f.kind),
        state: reading.state,
        waitsOnLabel: waitsOnWords(reading, i.org.name),
        href: `/projects/${d.head.contractId}/documents/${d.id}`,
      };
    },
  });
}

/**
 * How many wait on the organisation, from both sources (the Contracts list's "Documents waiting" button, and `reviewCounts`): the earlier records not yet answered, by a count
 * query, and the documents waiting on it, judged on each candidate, read in batches. One contract's where `contractId` is given.
 */
export async function documentsWaitingCount(client: Tx, organisationId: string, contractId?: string): Promise<number> {
  const earlier = await client.contractorSubmission.count({ where: unansweredWhere(organisationId, contractId) });
  const docs = documentLoader(client, candidateWhere(organisationId, contractId));
  let n = 0;
  let after: SourceAfter | null = null;
  for (;;) {
    const batch = await docs.load(after, REGISTER_BATCH);
    for (const d of batch) if (d.facts && documentState(d.facts).waitsOn === "ORGANISATION") n++;
    const last = batch[batch.length - 1];
    if (!last || batch.length < REGISTER_BATCH) return earlier + n;
    after = { kind: "KEYSET", at: last.at, id: last.id };
  }
}
