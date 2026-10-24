import type { Prisma } from "@/generated/prisma/client";
import { isDay } from "@/lib/dates";
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

/**
 * I-6 (design note 0007, DB-4): the dashboard's drill-down filters, kept in the address so a tile and the list it opens hold the same records.
 * Each is read by shape only (a configuration code or a day); what it means is the list's own where, built from `insightsWhere`, so a list that
 * does not take a facet ignores it. `from` and `to` come as a pair (`to` is exclusive, as a financial year's is), or not at all.
 */
export interface ListFacets {
  /// A department's unit code: the requesting unit.
  unit: string | null;
  route: string | null;
  method: string | null;
  /// A list's own stage word (sourcing: open, preparing, in_market, evaluating; requisitions: approved).
  stage: string | null;
  from: string | null;
  to: string | null;
}
export const FACET_KEYS = ["unit", "route", "method", "stage", "from", "to"] as const satisfies readonly (keyof ListFacets)[];
export const NO_FACETS: ListFacets = { unit: null, route: null, method: null, stage: null, from: null, to: null };
/// Whether any facet narrows the list.
export const hasFacets = (q: ListFacets): boolean => FACET_KEYS.some((k) => q[k] != null);

export interface ListQuery<V extends string = string, S extends string = string> extends ListFacets {
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

const CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const code = (v: string | undefined): string | null => (v !== undefined && CODE.test(v) ? v : null);

export function parseListQuery<V extends string, S extends string = never>(sp: Params, views: readonly V[], sorts: readonly S[] = []): ListQuery<V, S> {
  const text = (one(sp.q) ?? "").trim().replace(/\s+/g, " ");
  const q = text.length >= Q_MIN && text.length <= Q_MAX ? text : null;
  const pageText = one(sp.page) ?? "";
  const page = /^\d+$/.test(pageText) && Number.isSafeInteger(Number(pageText)) ? Number(pageText) : 0;
  const size = (PAGE_SIZES as readonly number[]).find((n) => String(n) === one(sp.size)) as PageSize | undefined;
  const from = one(sp.from);
  const to = one(sp.to);
  const range = from !== undefined && to !== undefined && isDay(from) && isDay(to) && from < to;
  return {
    unit: code(one(sp.unit)),
    route: code(one(sp.route)),
    method: code(one(sp.method)),
    stage: code(one(sp.stage)),
    from: range ? from : null,
    to: range ? to : null,
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
export function listHref(base: string, q: Partial<Pick<ListQuery, "q" | "view" | "sort" | "dir" | "page" | "size"> & ListFacets>): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.view) p.set("view", q.view);
  for (const k of FACET_KEYS) if (q[k]) p.set(k, q[k]);
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
  // The open applications: by the applicant's name and the day the paper arrived.
  application: { keys: { name: "supplier.registeredName", date: "receivedOn" }, date: "receivedOn" },
} as const satisfies Record<SearchEntity, { keys: Record<string, string>; date: string }>;

export type SortKey<E extends SearchEntity> = keyof (typeof LIST_SORTS)[E]["keys"] & string;

/// A list's sort keys, for `parseListQuery`.
export const sortKeys = <E extends SearchEntity>(entity: E): SortKey<E>[] => Object.keys(LIST_SORTS[entity].keys) as SortKey<E>[];

const ordered = (path: string, dir: SortDir): object => path.split(".").reduceRight<object | SortDir>((inner, key) => ({ [key]: inner }), dir) as object;

/// A work queue is worked in arrival order, so the open applications default to oldest first: the one exception to ST-7's newest first (orchestrator, 2026-10-24).
const DEFAULT_DIR: Partial<Record<SearchEntity, SortDir>> = { application: "asc" };

/// The orderBy input of each entity's model.
export interface ListOrderBy {
  requisition: Prisma.RequisitionOrderByWithRelationInput[];
  exercise: Prisma.SourcingExerciseOrderByWithRelationInput[];
  project: Prisma.AwardOrderByWithRelationInput[];
  supplier: Prisma.SupplierOrderByWithRelationInput[];
  sitting: Prisma.MeetingOrderByWithRelationInput[];
  application: Prisma.SupplierApplicationOrderByWithRelationInput[];
}

/// The Prisma orderBy for a query: the chosen column, then id, both in `dir`; or the main date and id, newest first (oldest first for the applications queue). The id makes
/// the order total, so a page boundary never repeats or drops a row. A key outside the set (even "constructor") is the default.
export function listOrderBy<E extends SearchEntity>(entity: E, q: Pick<ListQuery<string, string>, "sort" | "dir">): ListOrderBy[E] {
  const keys: Readonly<Record<string, string>> = LIST_SORTS[entity].keys;
  const path = q.sort && Object.hasOwn(keys, q.sort) ? keys[q.sort] : null;
  return (path ? [ordered(path, q.dir), { id: q.dir }] : [ordered(LIST_SORTS[entity].date, DEFAULT_DIR[entity] ?? "desc"), { id: DEFAULT_DIR[entity] ?? "desc" }]) as ListOrderBy[E];
}
