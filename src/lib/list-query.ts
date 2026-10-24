import type { Prisma } from "@/generated/prisma/client";
import { PAGE_SIZES } from "@/lib/paging";
import type { SearchEntity } from "@/lib/search/fields";

/**
 * A server list's query from its address (ADR 0044 D5, plan step 7 §2): the search text, the view, the sort, the page and the page
 * size, each read defensively, so a hand-edited address can only ever ask for one of the list's own views and sort columns. Pure.
 */

export const Q_MIN = 2;
export const Q_MAX = 100;
const DEFAULT_SIZE = 25;

export type PageSize = (typeof PAGE_SIZES)[number];
export type SortDir = "asc" | "desc";

export interface ListQuery<V extends string = string, S extends string = string> {
  /// Trimmed, inner whitespace collapsed; null when shorter than Q_MIN or longer than Q_MAX.
  q: string | null;
  /// q split on spaces, each kept literal (no wildcard meaning: `words.ts` escapes them).
  words: string[];
  /// Only one of the list's own view keys; anything else is null.
  view: V | null;
  /// From 0; a bad value is 0. A page beyond the last is clamped by the caller, who knows the total.
  page: number;
  size: PageSize;
  /// ST-7: only one of the list's own sort keys; null is the list's default, its main date newest first.
  sort: S | null;
  dir: SortDir;
}

/// The most rows one export writes: a technical ceiling, not customer policy (ST-10). A repo's full-set read takes one more, to tell "over".
export const LIST_EXPORT_MAX_ROWS = 5000;

type Params = Record<string, string | string[] | undefined>;
/// A repeated parameter reads as its first value.
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | null => (v !== undefined && (allowed as readonly string[]).includes(v) ? (v as T) : null);

export function parseListQuery<V extends string, S extends string = never>(sp: Params, views: readonly V[], sorts: readonly S[] = []): ListQuery<V, S> {
  const text = (one(sp.q) ?? "").trim().replace(/\s+/g, " ");
  const q = text.length >= Q_MIN && text.length <= Q_MAX ? text : null;
  const pageText = one(sp.page) ?? "";
  const page = /^\d+$/.test(pageText) && Number.isSafeInteger(Number(pageText)) ? Number(pageText) : 0;
  const size = (PAGE_SIZES as readonly number[]).find((n) => String(n) === one(sp.size)) as PageSize | undefined;
  return {
    q,
    words: q ? q.split(" ") : [],
    view: pick(one(sp.view), views),
    page,
    size: size ?? DEFAULT_SIZE,
    sort: pick(one(sp.sort), sorts),
    dir: one(sp.dir) === "asc" ? "asc" : "desc",
  };
}

/// The list's own address with q, view, sort, dir, page and size; empty and default parts left out, so `parseListQuery` reads back
/// the same query. A base that already holds a query (`?tab=`, `?sv=`) keeps it.
export function listHref(base: string, q: Partial<Pick<ListQuery, "q" | "view" | "sort" | "dir" | "page" | "size">>): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.view) p.set("view", q.view);
  if (q.sort) {
    p.set("sort", q.sort);
    if (q.dir === "asc") p.set("dir", "asc");
  }
  if (q.page) p.set("page", String(q.page));
  if (q.size && q.size !== DEFAULT_SIZE) p.set("size", String(q.size));
  const s = p.toString();
  return s ? `${base}${base.includes("?") ? "&" : "?"}${s}` : base;
}

/**
 * ST-7: each server list's sort set, a stable URL key to a stored column (reference, title or name, main date), and the main date
 * its default sorts on, newest first. No SULIT, money or AC-18-withheld column is in a set, because an order discloses the value
 * (NFR-SEC-001, FR-EVL-014): `list-sort.scan.test.ts` walks every path through the schema and holds the sets to that. A project has
 * no title of its own (its exercise's is withheld from a contract-stages reader, AC-18), so it sorts by reference and date only.
 */
export const LIST_SORTS = {
  requisition: { keys: { reference: "reference", title: "title", date: "raisedOn" }, date: "raisedOn" },
  exercise: { keys: { reference: "reference", title: "title", date: "createdAt" }, date: "createdAt" },
  project: { keys: { reference: "reference", date: "createdAt" }, date: "createdAt" },
  supplier: { keys: { reference: "reference", name: "registeredName", date: "createdAt" }, date: "createdAt" },
  sitting: { keys: { reference: "reference", name: "committee.nameEn", date: "meetingDate" }, date: "meetingDate" },
} as const satisfies Record<SearchEntity, { keys: Record<string, string>; date: string }>;

export type SortKey<E extends SearchEntity> = keyof (typeof LIST_SORTS)[E]["keys"] & string;

/// A list's sort keys, for `parseListQuery`.
export const sortKeys = <E extends SearchEntity>(entity: E): SortKey<E>[] => Object.keys(LIST_SORTS[entity].keys) as SortKey<E>[];

const ordered = (path: string, dir: SortDir): object => path.split(".").reduceRight<object | SortDir>((inner, key) => ({ [key]: inner }), dir) as object;

/// The orderBy input of each entity's model.
export interface ListOrderBy {
  requisition: Prisma.RequisitionOrderByWithRelationInput[];
  exercise: Prisma.SourcingExerciseOrderByWithRelationInput[];
  project: Prisma.AwardOrderByWithRelationInput[];
  supplier: Prisma.SupplierOrderByWithRelationInput[];
  sitting: Prisma.MeetingOrderByWithRelationInput[];
}

/// The Prisma orderBy for a query: the chosen column, then id, both in `dir`; or the main date and id, newest first. The id makes
/// the order total, so a page boundary never repeats or drops a row. A key outside the set (even "constructor") is the default.
export function listOrderBy<E extends SearchEntity>(entity: E, q: Pick<ListQuery<string, string>, "sort" | "dir">): ListOrderBy[E] {
  const keys: Readonly<Record<string, string>> = LIST_SORTS[entity].keys;
  const path = q.sort && Object.hasOwn(keys, q.sort) ? keys[q.sort] : null;
  return (path ? [ordered(path, q.dir), { id: q.dir }] : [ordered(LIST_SORTS[entity].date, "desc"), { id: "desc" }]) as ListOrderBy[E];
}
