/**
 * A contract's Project workspace documents, as the Documents list reads them (PW-12; ADR 0042 D4; plan step 4 §5.3): title, kind, the day of the latest version, the
 * state in words, and who it waits on. A reader, not pure; it writes nothing and takes no lock. No figure, no count, no days waiting (PW-4): the rows carry words and
 * a day, and nothing else about how many or how long.
 *
 * The state is never stored (`documentState`), so the filters are applied to it here, not in SQL. The list is read in bounded batches from the newest document down,
 * with a cursor on (createdAt, id), until a page is full: a contract with a great many documents still costs one page.
 *
 * The words are `labels.ts`'s: the state is kind-aware (`stateWords`, "Noted" on defects rectified), the organisation is named by its configured name, and a code never
 * reaches a screen. Reading follows `caseVisibility`: the caller (the page) judges who may open the contract before it asks.
 */

import type { Tx } from "@/lib/audit/record";

import { loadDocumentFactsMany } from "./facts";
import { kindWords, stateWords, waitsOnWords } from "./labels";
import { documentState, latestVersion, type DocumentState } from "./state";
import type { DocKind, Side } from "./types";

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
  /// The day of the latest version (YYYY-MM-DD, the organisation's day; format it with `formatDate`), or null while the document is only asked for.
  latestOn: string | null;
  /// The state in words, kind-aware. `state` is for a badge's tone only; never print it.
  stateLabel: string;
  state: DocumentState;
  /// "Waiting on the contractor", "Waiting on {organisation}", or null where it waits on nobody.
  waitsOnLabel: string | null;
  waitsOn: Side | null;
  /// The document's own page.
  href: string;
}

/// Where the next page starts: opaque to the caller.
export type RegisterCursor = string;

export const REGISTER_PAGE = 50;
const BATCH = 100;

const encode = (createdAt: Date, id: string): RegisterCursor => `${createdAt.toISOString()}|${id}`;
function decode(c: RegisterCursor | null): { createdAt: Date; id: string } | null {
  if (!c) return null;
  const at = c.indexOf("|");
  const createdAt = new Date(c.slice(0, at));
  return at > 0 && !Number.isNaN(createdAt.getTime()) ? { createdAt, id: c.slice(at + 1) } : null;
}

const keeps = (f: RegisterFilter, r: { state: DocumentState; waitsOn: Side | null }) => f === "ALL" || (f === "APPROVED" ? r.state === "APPROVED" : r.waitsOn === f);

/**
 * One page of a contract's documents, newest first, under a filter. `next` is the cursor of the page after it, or null at the end. The contract is judged to be the
 * organisation's by the caller (it loaded it); the rows are filtered by both ids all the same.
 */
export async function loadRegister(
  client: Tx,
  i: { organisationId: string; contractId: string; orgName: string; filter?: RegisterFilter; after?: RegisterCursor | null; take?: number },
): Promise<{ rows: RegisterRow[]; next: RegisterCursor | null }> {
  const filter = i.filter ?? "ALL";
  const take = Math.min(Math.max(i.take ?? REGISTER_PAGE, 1), 200);
  let from = decode(i.after ?? null);
  const rows: RegisterRow[] = [];
  let last: { createdAt: Date; id: string } | null = null;

  for (;;) {
    const batch = await client.projectDocument.findMany({
      where: {
        organisationId: i.organisationId,
        contractId: i.contractId,
        ...(from ? { OR: [{ createdAt: { lt: from.createdAt } }, { createdAt: from.createdAt, id: { lt: from.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: BATCH,
      select: { id: true, title: true, createdAt: true },
    });
    if (batch.length === 0) return { rows, next: null };
    const facts = await loadDocumentFactsMany(client, batch.map((d) => d.id));
    for (const d of batch) {
      const f = facts.get(d.id);
      last = { createdAt: d.createdAt, id: d.id };
      if (!f) continue;
      const reading = documentState(f);
      if (!keeps(filter, reading)) continue;
      rows.push({
        id: d.id,
        title: d.title,
        kindLabel: f.kind ? kindWords(f.kind as DocKind) : null,
        latestOn: latestVersion(f)?.uploadedOn ?? null,
        stateLabel: stateWords(reading.state, f.kind),
        state: reading.state,
        waitsOnLabel: waitsOnWords(reading, i.orgName),
        waitsOn: reading.waitsOn,
        href: `/projects/${i.contractId}/documents/${d.id}`,
      });
      // A full page: the cursor is where this one stopped, and there may be more (the caller asks for the next page to find out).
      if (rows.length === take) return { rows, next: encode(d.createdAt, d.id) };
    }
    if (batch.length < BATCH) return { rows, next: null };
    from = last;
  }
}

/// The cursor and the batch the contractor's own readers (`portal-read.ts`) page with, so the two lists page the same way.
export { BATCH as REGISTER_BATCH, decode as decodeRegisterCursor, encode as encodeRegisterCursor };
