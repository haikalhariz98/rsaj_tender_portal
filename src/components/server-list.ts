import { FACET_KEYS, hasFacets, listHref, type ListQuery } from "@/lib/list-query";
import { PAGE_SIZES } from "@/lib/paging";

import type { ServerMode } from "./data-list";

/**
 * The `server` prop of a DataList (7.3) from the list's query: every link is made here with `listHref`, because a function cannot cross to a client
 * component. `sortColumns` maps a column key to the list's sort key (ST-7); a column not in it is not drawn sortable. A sort link is: ascending, then
 * descending, then the default order, back on the first page and keeping the search, the view and the size. Pure.
 */
export function serverMode(
  base: string,
  q: ListQuery,
  o: { total: number; page: number; sortColumns: Record<string, string>; exportHref?: string; exportBlocked?: string },
): ServerMode {
  const here = { q: q.q, view: q.view, sort: q.sort, dir: q.dir, size: q.size, unit: q.unit, route: q.route, method: q.method, stage: q.stage, from: q.from, to: q.to };
  const sortHrefs: Record<string, string> = {};
  for (const [column, key] of Object.entries(o.sortColumns)) {
    const next = q.sort !== key ? { sort: key, dir: "asc" as const } : q.dir === "asc" ? { sort: key, dir: "desc" as const } : { sort: null, dir: "desc" as const };
    sortHrefs[column] = listHref(base, { ...here, ...next, page: 0 });
  }
  const sortedColumn = Object.entries(o.sortColumns).find(([, key]) => key === q.sort)?.[0];
  return {
    q: q.q,
    action: base,
    keep: { ...Object.fromEntries(FACET_KEYS.flatMap((k) => (q[k] ? [[k, q[k]!]] : []))), ...(q.view ? { view: q.view } : {}), ...(q.sort ? { sort: q.sort, ...(q.dir === "asc" ? { dir: "asc" } : {}) } : {}), ...(q.size !== 25 ? { size: String(q.size) } : {}) },
    total: o.total,
    page: o.page,
    size: q.size,
    prevHref: o.page > 0 ? listHref(base, { ...here, page: o.page - 1 }) : null,
    nextHref: (o.page + 1) * q.size < o.total ? listHref(base, { ...here, page: o.page + 1 }) : null,
    sizeHrefs: Object.fromEntries(PAGE_SIZES.map((n) => [n, listHref(base, { ...here, size: n, page: 0 })])) as ServerMode["sizeHrefs"],
    sortHrefs,
    sorted: sortedColumn ? { key: sortedColumn, dir: q.dir } : null,
    exportHref: o.exportHref,
    exportBlocked: o.exportBlocked,
    clearHref: q.q || q.view || hasFacets(q) ? listHref(base, { sort: q.sort, dir: q.dir, size: q.size }) : null,
  };
}
