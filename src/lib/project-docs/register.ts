/**
 * A contract's Documents list (PW-12; ADR 0042 D4; plan step 4 §5.3, step 6 §7): title, kind, the day of the latest version, the state in words, and who it waits on. A
 * reader, not pure; it writes nothing and takes no lock. No figure, no count, no days waiting (PW-4): the rows carry words and a day, and nothing else about how many or how long.
 *
 * Two sources, one list (PW-11): the Project workspace's documents, and the contract's earlier contractor submissions (`ContractorSubmission`, read-only, not migrated), each
 * marked "Earlier record" and carrying its stored fields and answer (`earlier`). They are interleaved newest first by `walkMerged` (`merge.ts`), each table read in bounded
 * batches in its own order, so a contract with a great many rows still costs one page.
 *
 * The state is never stored (`documentState`), so the filters are applied to it here, not in SQL. The words are `labels.ts`'s: the state is kind-aware (`stateWords`, "Noted"
 * on defects rectified), the organisation is named by its configured name, and a code never reaches a screen. Reading follows `caseVisibility`: the caller (the page) judges
 * who may open the contract before it asks.
 */

import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";

import { EARLIER_RECORD } from "./earlier";
import { earlierLoader, earlierRowReading, staffEarlier, type StaffEarlier } from "./earlier-read";
import { loadDocumentFactsMany } from "./facts";
import { kindWords, stateWords, waitsOnWords } from "./labels";
import { prismaAfter, walkMerged, type MergeLoader, type SourceAfter } from "./merge";
import { documentState, latestVersion, type DocumentState } from "./state";
import type { DocKind, DocumentFacts, Side } from "./types";

/// The list's filters (PW-12): everything; what waits on the contractor; what waits on the organisation; what is approved.
export const REGISTER_FILTERS = ["ALL", "CONTRACTOR", "ORGANISATION", "APPROVED"] as const;
export type RegisterFilter = (typeof REGISTER_FILTERS)[number];
export const isRegisterFilter = (s: unknown): s is RegisterFilter => typeof s === "string" && (REGISTER_FILTERS as readonly string[]).includes(s);

/// The filters in words, the organisation by its configured name.
export const registerFilterWords = (f: RegisterFilter, orgName: string): string => (f === "ALL" ? "All" : f === "CONTRACTOR" ? "Waiting on the contractor" : f === "ORGANISATION" ? `Waiting on ${orgName}` : "Approved");

export interface RegisterRow {
  id: string;
  title: string;
  /// The kind's name, or null for an ordinary document.
  kindLabel: string | null;
  /// The day of the latest version (YYYY-MM-DD, the organisation's day; format it with `formatDate`), or null while the document is only asked for. An earlier record's: the day it was sent.
  latestOn: string | null;
  /// The state in words, kind-aware. `state` is for a badge's tone only; never print it.
  stateLabel: string;
  state: DocumentState;
  /// "Waiting on the contractor", "Waiting on {organisation}", or null where it waits on nobody.
  waitsOnLabel: string | null;
  waitsOn: Side | null;
  /// The document's own page. An earlier record has no page: its link is the contract's Documents tab naming it (`earlier=`), where its read-only view and, while unanswered,
  /// its answer open.
  href: string;
  /// Present only on an earlier record (PW-11): "Earlier record", and its stored fields and answer.
  earlier?: { label: string; record: StaffEarlier };
}

/// Where the next page starts: opaque to the caller.
export type RegisterCursor = string;

export const REGISTER_PAGE = 50;
const BATCH = 100;

const keeps = (f: RegisterFilter, r: { state: DocumentState; waitsOn: Side | null }) => f === "ALL" || (f === "APPROVED" ? r.state === "APPROVED" : r.waitsOn === f);

/// The contract's Documents tab naming one earlier record: the list's own address for it.
export const earlierHref = (contractId: string, id: string) => `/projects/${encodeURIComponent(contractId)}?${new URLSearchParams({ stage: "project", tab: "submissions", earlier: id }).toString()}`;

/// One document of the merged list, with its facts (read for the whole batch at once).
export interface DocHead {
  at: Date;
  id: string;
  title: string;
  facts: DocumentFacts | undefined;
}

/// One source of the merged list: the documents under `where`, newest first, each with its facts, read for the whole batch at once.
export function documentLoader(client: Tx, where: Record<string, unknown>): MergeLoader<DocHead> {
  return {
    source: "DOCUMENT",
    async load(after: SourceAfter | null, take: number) {
      const batch = await client.projectDocument.findMany({ where: { ...where, AND: [prismaAfter("createdAt", after)] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take, select: { id: true, title: true, createdAt: true } });
      const facts = await loadDocumentFactsMany(client, batch.map((d) => d.id));
      return batch.map((d) => ({ at: d.createdAt, id: d.id, title: d.title, facts: facts.get(d.id) }));
    },
  };
}

/**
 * One page of a contract's documents and earlier records, newest first, under a filter. `next` is the cursor of the page after it, or null at the end. The contract is judged to be
 * the organisation's by the caller (it loaded it); the rows are filtered by both ids all the same.
 */
export async function loadRegister(
  client: Tx,
  i: { organisationId: string; contractId: string; orgName: string; filter?: RegisterFilter; after?: RegisterCursor | null; take?: number },
): Promise<{ rows: RegisterRow[]; next: RegisterCursor | null }> {
  const filter = i.filter ?? "ALL";
  const take = Math.min(Math.max(i.take ?? REGISTER_PAGE, 1), 200);
  const scope = { organisationId: i.organisationId, contractId: i.contractId };
  return walkMerged(documentLoader(client, scope), earlierLoader(client, scope), {
    cursor: i.after ?? null,
    take,
    batch: BATCH,
    keep: (m): RegisterRow | null => {
      if (m.source === "EARLIER") {
        const r = m.row;
        const reading = earlierRowReading(r);
        if (!keeps(filter, reading)) return null;
        return {
          id: r.id,
          title: r.title,
          kindLabel: kindWords(r.kind),
          latestOn: storedDay(r.submittedOn),
          stateLabel: reading.stateLabel,
          state: reading.state,
          waitsOnLabel: waitsOnWords(reading, i.orgName),
          waitsOn: reading.waitsOn,
          href: earlierHref(i.contractId, r.id),
          earlier: { label: EARLIER_RECORD, record: staffEarlier(r) },
        };
      }
      const d = m.row;
      const f = d.facts;
      if (!f) return null;
      const reading = documentState(f);
      if (!keeps(filter, reading)) return null;
      return {
        id: d.id,
        title: d.title,
        kindLabel: f.kind ? kindWords(f.kind as DocKind) : null,
        latestOn: latestVersion(f)?.uploadedOn ?? null,
        stateLabel: stateWords(reading.state, f.kind),
        state: reading.state,
        waitsOnLabel: waitsOnWords(reading, i.orgName),
        waitsOn: reading.waitsOn,
        href: `/projects/${i.contractId}/documents/${d.id}`,
      };
    },
  });
}

/// The batch the readers of this list page with.
export { BATCH as REGISTER_BATCH };
