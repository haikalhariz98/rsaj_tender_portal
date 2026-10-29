/**
 * The Work tab's address (W-12; plan §4): one address holds the view, the filters, the search, List or Board, the page, the sort and the open item. Pure.
 *
 * `/projects/{id}?tab=work&view=&type=&assignee=&priority=&q=&mode=&page=&sort=&dir=&size=&item=` (+ `stage`, which keeps the step bar where it was). Defaults are left out, so an
 * address with nothing in it is the Open view as a List. Every value is read defensively: one no control offers is dropped. Nothing is remembered between visits (WS-16).
 */

import type { ServerMode } from "@/components/data-list";
import { PAGE_SIZES } from "@/lib/paging";

import { parseItemRef } from "./number";
import { parseWorkFilters, parseWorkView } from "./views";
import type { WorkItemType, WorkPriority, WorkView } from "./types";

export type WorkMode = "list" | "board";

export interface WorkQuery {
  view: WorkView;
  type: WorkItemType | null;
  assignee: string | null;
  priority: WorkPriority | null;
  q: string;
  mode: WorkMode;
  /// From 0.
  page: number;
  size: number;
  sort: string | null;
  dir: "asc" | "desc";
  /// The open item, as the address writes it ("RFI-12"); null when none, or when the word is not a reference.
  item: string | null;
  stage: string | null;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseWorkQuery(sp: Params, sorts: readonly string[]): WorkQuery {
  const f = parseWorkFilters({ type: one(sp.type), assignee: one(sp.assignee), priority: one(sp.priority), q: one(sp.q) });
  const pageText = one(sp.page) ?? "";
  const size = (PAGE_SIZES as readonly number[]).find((n) => String(n) === one(sp.size));
  const sort = one(sp.sort);
  const item = one(sp.item) ?? "";
  return {
    view: parseWorkView(one(sp.view)),
    type: f.type ?? null,
    assignee: f.assignee ?? null,
    priority: f.priority ?? null,
    q: (f.q ?? "").slice(0, 100),
    mode: one(sp.mode) === "board" ? "board" : "list",
    page: /^\d{1,6}$/.test(pageText) ? Number(pageText) : 0,
    size: size ?? 25,
    sort: sort && sorts.includes(sort) ? sort : null,
    dir: one(sp.dir) === "asc" ? "asc" : "desc",
    item: parseItemRef(item) ? item : null,
    stage: one(sp.stage) ?? null,
  };
}

/// The filters the loaders take.
export const filtersOf = (q: WorkQuery) => ({ type: q.type, assignee: q.assignee, priority: q.priority, q: q.q });

/// The address of a query with changes. A change to the view, a filter, the search, the mode or the sort starts at the first page and closes the panel unless the change says otherwise.
export function workHref(contractId: string, q: WorkQuery, change: Partial<WorkQuery> = {}): string {
  const n = { ...q, ...change };
  const p = new URLSearchParams();
  if (n.stage) p.set("stage", n.stage);
  p.set("tab", "work");
  if (n.view !== "open") p.set("view", n.view);
  if (n.type) p.set("type", n.type);
  if (n.assignee) p.set("assignee", n.assignee);
  if (n.priority) p.set("priority", n.priority);
  if (n.q) p.set("q", n.q);
  if (n.mode === "board") p.set("mode", "board");
  if (n.sort) {
    p.set("sort", n.sort);
    if (n.dir === "asc") p.set("dir", "asc");
  }
  if (n.page) p.set("page", String(n.page));
  if (n.size !== 25) p.set("size", String(n.size));
  if (n.item) p.set("item", n.item);
  return `/projects/${encodeURIComponent(contractId)}?${p.toString()}`;
}

/// A change that narrows or reorders: back to the first page, panel closed.
export const reset: Partial<WorkQuery> = { page: 0, item: null };

/// The list's `server` prop. `columns` maps a column key to its sort key; a column not there is not sortable.
export function workServerMode(contractId: string, q: WorkQuery, o: { total: number; page: number; columns: Record<string, string> }): ServerMode {
  const sortHrefs: Record<string, string> = {};
  for (const [column, key] of Object.entries(o.columns)) {
    const next: Partial<WorkQuery> = q.sort !== key ? { sort: key, dir: "asc" } : q.dir === "asc" ? { sort: key, dir: "desc" } : { sort: null, dir: "desc" };
    sortHrefs[column] = workHref(contractId, q, { ...next, ...reset });
  }
  const sortedColumn = Object.entries(o.columns).find(([, key]) => key === q.sort)?.[0];
  const keep: Record<string, string> = { tab: "work" };
  if (q.stage) keep.stage = q.stage;
  if (q.view !== "open") keep.view = q.view;
  if (q.type) keep.type = q.type;
  if (q.assignee) keep.assignee = q.assignee;
  if (q.priority) keep.priority = q.priority;
  if (q.mode === "board") keep.mode = "board";
  if (q.sort) keep.sort = q.sort;
  if (q.sort && q.dir === "asc") keep.dir = "asc";
  if (q.size !== 25) keep.size = String(q.size);
  return {
    q: q.q || null,
    action: `/projects/${encodeURIComponent(contractId)}`,
    keep,
    total: o.total,
    page: o.page,
    size: q.size,
    prevHref: o.page > 0 ? workHref(contractId, q, { page: o.page - 1, item: null }) : null,
    nextHref: (o.page + 1) * q.size < o.total ? workHref(contractId, q, { page: o.page + 1, item: null }) : null,
    sizeHrefs: Object.fromEntries(PAGE_SIZES.map((n) => [n, workHref(contractId, q, { size: n, ...reset })])) as ServerMode["sizeHrefs"],
    sortHrefs,
    sorted: sortedColumn ? { key: sortedColumn, dir: q.dir } : null,
    // No export route for work items in 3a: the list keeps its own client export of the page shown.
    clearHref: q.q || q.type || q.assignee || q.priority || q.view !== "open" ? workHref(contractId, q, { q: "", type: null, assignee: null, priority: null, view: "open", ...reset }) : null,
  };
}
