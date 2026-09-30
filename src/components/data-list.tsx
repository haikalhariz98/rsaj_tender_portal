"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import {
  ChevronDown,
  ChevronRight,
  DownloadIcon,
  RowsTightIcon,
  RowsWideIcon,
  SearchIcon,
} from "@/components/icons";
import { AvatarStack, Avatar } from "@/components/ui/avatar";
import { Badge, Chip } from "@/components/ui/badge";
import { iconButtonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState, Meter } from "@/components/ui/feedback";
import { formatRM } from "@/lib/format";

/**
 * The list chrome around every table: a view selector, search, sort, row selection,
 * a density switch and CSV export.
 *
 * Cells are described as data rather than passed as rendered nodes, so a server
 * component can hand rows straight over and the client can still sort and search
 * them. Adding a cell kind here is how a new column type arrives.
 */
export type Cell =
  | { kind: "stack"; title: string; sub?: string; monoSub?: boolean }
  | { kind: "text"; text: string; dim?: boolean }
  | { kind: "money"; value: number | null }
  | { kind: "badge"; text: string; tone?: "ok" | "warn" | "err" | "info" | "brand" }
  | { kind: "chip"; text: string; tone?: "ok" | "warn" | "err" | "info" | "brand" }
  | { kind: "person"; name: string; sub?: string }
  | { kind: "link"; text: string; href: string; sub?: string }
  /// An overlapping stack of avatars with a +N overflow, as the prototype shows for
  /// who holds a role or who reviews a document.
  | { kind: "avatars"; names: string[]; max?: number }
  /// Several small badges in one cell, overflowing to +N.
  | { kind: "badges"; items: string[]; max?: number }
  /// A filled bar with the figure beside it, and a marker at the configured warning
  /// threshold. Null percent renders as not set — a code with no allocation has not
  /// used none of its budget, and a bar drawn at zero says it has.
  | { kind: "meter"; percent: number | null; threshold: number | null };

export interface Column {
  key: string;
  label: string;
  width?: string;
  numeric?: boolean;
  sortable?: boolean;
}

export interface Row {
  id: string;
  cells: Record<string, Cell>;
  /// Values sorting compares. Absent keys fall back to the cell's own text.
  sortKeys?: Record<string, string | number>;
  /// Everything search should match against, already flattened.
  search: string;
  /// Named views this row belongs to, beyond "all".
  views?: string[];
}

export interface View {
  id: string;
  label: string;
}

/// A chip in the toolbar that narrows the list by one column's values.
export interface Filter {
  key: string;
  label: string;
}

/// An action offered on hover at the end of each row.
export interface RowAction {
  label: string;
  /// `{id}` in the template is replaced with the row's id.
  hrefTemplate: string;
}

function cellText(cell: Cell | undefined): string {
  if (!cell) return "";
  switch (cell.kind) {
    case "stack":
      return cell.sub ? `${cell.title} ${cell.sub}` : cell.title;
    case "text":
    case "badge":
    case "chip":
      return cell.text;
    case "money":
      return cell.value == null ? "" : String(cell.value);
    case "person":
      return cell.name;
    case "link":
      return cell.text;
    case "avatars":
      return cell.names.join(" ");
    case "badges":
      return cell.items.join(" ");
    case "meter":
      return cell.percent == null ? "" : `${cell.percent}%`;
  }
}


const dash = <span className="text-ink-4">—</span>;

function CellView({ cell }: { cell: Cell | undefined }) {
  if (!cell) return dash;
  switch (cell.kind) {
    case "stack":
      return (
        <div className="min-w-0">
          <div className="truncate font-semibold text-ink" title={cell.title}>
            {cell.title}
          </div>
          {cell.sub && (
            <div
              className={cx(
                "truncate text-[12.5px] text-ink-3",
                cell.monoSub && "font-mono text-[12px]",
              )}
            >
              {cell.sub}
            </div>
          )}
        </div>
      );
    case "text":
      return (
        <span className={cx("block truncate", cell.dim ? "text-ink-3" : "text-ink")} title={cell.text}>
          {cell.text}
        </span>
      );
    case "money":
      return cell.value == null ? (
        dash
      ) : (
        <span className="font-semibold tabular-nums">{formatRM(cell.value)}</span>
      );
    case "badge":
      return (
        <Badge tone={cell.tone} title={cell.text}>
          {cell.text}
        </Badge>
      );
    case "chip":
      return (
        <Chip tone={cell.tone} title={cell.text}>
          {cell.text}
        </Chip>
      );
    case "person":
      return (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={cell.name} size="xs" />
          <span className="truncate">{cell.name}</span>
        </span>
      );
    case "link":
      return (
        <div className="min-w-0">
          <Link
            href={cell.href}
            className="block truncate font-semibold text-brand-700 no-underline hover:text-brand-800 hover:underline"
          >
            {cell.text}
          </Link>
          {cell.sub && <div className="truncate text-[12.5px] text-ink-3">{cell.sub}</div>}
        </div>
      );
    case "avatars":
      return cell.names.length === 0 ? dash : <AvatarStack names={cell.names} max={cell.max ?? 4} />;
    case "meter":
      return <Meter percent={cell.percent} threshold={cell.threshold} />;
    case "badges": {
      if (cell.items.length === 0) return dash;
      const shown = cell.items.slice(0, cell.max ?? 3);
      const rest = cell.items.length - shown.length;
      return (
        <span className="flex flex-wrap gap-1">
          {shown.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
          {rest > 0 && <Badge outline>+{rest}</Badge>}
        </span>
      );
    }
  }
}

const smallControl =
  "h-9 rounded-full border border-line-2 bg-surface px-3.5 text-[13px] text-ink transition hover:border-ink-4";

export function DataList({
  columns,
  rows,
  views = [],
  filters = [],
  rowAction,
  actions,
  rowOpens = false,
  selectable = true,
  searchPlaceholder = "Search…",
  searchable = true,
  flat = false,
  emptyTitle = "Nothing here",
  emptyBody,
  exportName = "export",
}: {
  columns: Column[];
  rows: Row[];
  views?: View[];
  filters?: Filter[];
  rowAction?: RowAction;
  /// Arbitrary per-row controls, for screens whose row action opens an editor rather
  /// than navigating. Renders under an "Actions" header.
  actions?: (id: string) => ReactNode;
  /// Clicking anywhere in a row presses its first action. Only for a list whose
  /// first action opens the record — never one that leads with a destructive one.
  rowOpens?: boolean;
  /// Configuration lists carry no selection column. Opt out rather than always
  /// rendering one.
  selectable?: boolean;
  searchPlaceholder?: string;
  /// A short list a reader takes in at a glance needs no search box. Set false
  /// rather than passing an unused placeholder.
  searchable?: boolean;
  /// True when the list sits inside a card that already provides the border.
  flat?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  exportName?: string;
}) {
  const [compact, setCompact] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  /// Distinct values a filter can offer, taken from the rows themselves.
  const optionsFor = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      map[f.key] = [...new Set(rows.map((r) => cellText(r.cells[f.key])).filter(Boolean))].sort();
    }
    return map;
  }, [filters, rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let out = rows.filter(
      (r) =>
        (view === "all" || r.views?.includes(view)) &&
        (needle === "" || r.search.toLowerCase().includes(needle)) &&
        Object.entries(chosen).every(([key, value]) => cellText(r.cells[key]) === value),
    );

    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const av = a.sortKeys?.[key] ?? cellText(a.cells[key]);
        const bv = b.sortKeys?.[key] ?? cellText(b.cells[key]);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, view, query, sort, chosen]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const paged = visible.slice(start, start + pageSize);

  const allSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));

  // Filtering an empty list is noise. The tools appear once there is something to use
  // them on, or once a filter is what emptied it.
  const narrowed = view !== "all" || query !== "" || Object.keys(chosen).length > 0;
  const showTools = rows.length > 0 || narrowed;

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }

  function exportCsv() {
    const header = columns.map((c) => c.label);
    // The whole filtered list, not just the page being looked at.
    const lines = visible.map((r) => columns.map((c) => cellText(r.cells[c.key])));
    const csv = [header, ...lines]
      .map((cells) => cells.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const openRow = (tr: HTMLElement) =>
    tr.querySelector<HTMLElement>("[data-rowactions] button, [data-rowactions] a")?.click();

  const cellPad = compact ? "px-4 py-2" : "px-4 py-3.5";

  return (
    <div
      className={cx(
        "min-w-0",
        !flat && "overflow-hidden rounded-card border border-line/70 bg-surface shadow-card",
      )}
    >
      {showTools && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          {views.length > 0 && (
            <select
              className={cx(smallControl, "cursor-pointer font-semibold")}
              value={view}
              onChange={(e) => setView(e.target.value)}
              aria-label="View"
            >
              <option value="all">All records</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}

          {searchable && (
            <div className="relative min-w-40 flex-1 sm:max-w-80">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4"
              />
              <input
                className={cx(
                  smallControl,
                  "w-full pl-9 outline-none placeholder:text-ink-4 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15",
                )}
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search this list"
              />
            </div>
          )}

          {filters.map((f) => {
            const options: { value: string | null; label: string }[] = [
              { value: null, label: `Any ${f.label.toLowerCase()}` },
              ...(optionsFor[f.key] ?? []).map((v) => ({ value: v, label: v })),
            ];
            return (
              <div key={f.key} className="relative">
                <button
                  type="button"
                  aria-expanded={openFilter === f.key}
                  onClick={() => setOpenFilter((o) => (o === f.key ? null : f.key))}
                  className={cx(
                    smallControl,
                    "inline-flex items-center gap-1.5 font-medium",
                    chosen[f.key] && "border-brand-300 bg-brand-50 text-brand-800",
                  )}
                >
                  <span>{f.label}</span>
                  {chosen[f.key] && (
                    <span className="max-w-32 truncate font-semibold">{chosen[f.key]}</span>
                  )}
                  <ChevronDown size={14} className="text-ink-3" />
                </button>
                {openFilter === f.key && (
                  <div className="absolute top-[calc(100%+6px)] left-0 z-20 max-h-72 min-w-52 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
                    {options.map((opt) => {
                      const on = opt.value === null ? !chosen[f.key] : chosen[f.key] === opt.value;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            setChosen((c) => {
                              const next = { ...c };
                              if (opt.value === null) delete next[f.key];
                              else next[f.key] = opt.value;
                              return next;
                            });
                            setOpenFilter(null);
                          }}
                          className={cx(
                            "block w-full truncate rounded-xl px-3 py-2 text-left text-[13.5px] hover:bg-sunken",
                            on ? "font-semibold text-brand-800" : "text-ink",
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="ml-auto flex items-center gap-1.5">
            {/* Icon-only with the label in a title. Words here would widen the bar and
                read as two more filters. */}
            <div
              className="flex rounded-full bg-ink/[0.05] p-0.5"
              role="group"
              aria-label="Row density"
            >
              {(
                [
                  [false, "Comfortable rows", RowsWideIcon],
                  [true, "Compact rows", RowsTightIcon],
                ] as const
              ).map(([value, label, Ico]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={compact === value}
                  aria-label={label}
                  title={label}
                  onClick={() => setCompact(value)}
                  className="grid size-8 place-items-center rounded-full text-ink-3 transition aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-[0_1px_2px_rgb(15_23_42/0.1)]"
                >
                  <Ico size={14} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Download this view as CSV"
              title="Download this view as CSV"
              className={iconButtonClass("sm", true, "size-9")}
            >
              <DownloadIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-2 text-[13px] font-semibold text-brand-800 sm:mx-5">
          <span>{selected.size} selected</span>
          <button
            type="button"
            className="ml-auto rounded-full px-3 py-1 text-[12.5px] hover:bg-brand-100"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          size="sm"
          title={emptyTitle}
          className={cx(showTools && "border-t border-line")}
        >
          {emptyBody}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-[13.5px]">
            <colgroup>
              {selectable && <col style={{ width: 48 }} />}
              {columns.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
              {(rowAction || actions) && <col style={{ width: actions ? 128 : 56 }} />}
            </colgroup>
            <thead>
              <tr className="border-y border-line bg-sunken">
                {selectable && (
                  <th className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer accent-brand-600"
                      checked={allSelected}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(paged.map((r) => r.id)) : new Set())
                      }
                      aria-label="Select all rows"
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    aria-sort={
                      sort?.key === c.key
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cx(
                      "px-4 py-2.5 text-[12px] font-semibold whitespace-nowrap text-ink-3",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cx(
                          "inline-flex items-center gap-1 rounded-md hover:text-ink",
                          sort?.key === c.key && "text-ink",
                        )}
                      >
                        {c.label}
                        <span
                          aria-hidden="true"
                          className={cx("text-[9px]", sort?.key !== c.key && "opacity-40")}
                        >
                          {sort?.key === c.key && sort.dir === "desc" ? "▼" : "▲"}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                {(rowAction || actions) && (
                  <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-ink-3">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={rowOpens ? 0 : undefined}
                  className={cx(
                    "group border-b border-line/70 transition last:border-b-0 hover:bg-brand-50/40",
                    selected.has(row.id) && "bg-brand-50/60",
                    rowOpens && "cursor-pointer",
                  )}
                  // A row that opens a record defers to its own first action rather than
                  // holding a second copy of when a record is open — which is why that
                  // action must be the one that opens it.
                  onClick={
                    rowOpens
                      ? (e) => {
                          if ((e.target as HTMLElement).closest("button,a,input,label")) return;
                          openRow(e.currentTarget);
                        }
                      : undefined
                  }
                  onKeyDown={
                    rowOpens
                      ? (e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          if (e.target !== e.currentTarget) return;
                          e.preventDefault();
                          openRow(e.currentTarget);
                        }
                      : undefined
                  }
                >
                  {selectable && (
                    <td className={cellPad}>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-brand-600"
                        checked={selected.has(row.id)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${cellText(row.cells[columns[0].key])}`}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cx(cellPad, "align-middle", c.numeric && "text-right tabular-nums")}
                    >
                      <CellView cell={row.cells[c.key]} />
                    </td>
                  ))}
                  {actions && (
                    <td className={cellPad}>
                      <div data-rowactions className="flex items-center justify-end gap-1">
                        {actions(row.id)}
                      </div>
                    </td>
                  )}
                  {rowAction && !actions && (
                    <td className={cellPad}>
                      <div data-rowactions className="flex justify-end">
                        <Link
                          href={rowAction.hrefTemplate.replace("{id}", row.id)}
                          className={iconButtonClass(
                            "sm",
                            false,
                            "text-ink-4 group-hover:bg-brand-100 group-hover:text-brand-700",
                          )}
                          aria-label={rowAction.label}
                          title={rowAction.label}
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-3 sm:px-5">
          <span className="tabular-nums">
            {`Showing ${start + 1}-${Math.min(start + pageSize, visible.length)} of ${visible.length}`}
          </span>
          <label className="ml-auto flex items-center gap-2">
            <span className="text-[12.5px]">Rows</span>
            <select
              className={cx(smallControl, "h-8 cursor-pointer px-2.5")}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {pageCount > 1 && (
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <button
                type="button"
                className={iconButtonClass("sm")}
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Previous page"
              >
                <ChevronRight size={14} className="rotate-180" />
              </button>
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-current={i === current ? "page" : undefined}
                  onClick={() => setPage(i)}
                  className="grid size-8 place-items-center rounded-full text-[13px] font-semibold text-ink-2 hover:bg-ink/5 aria-[current=page]:bg-brand-700 aria-[current=page]:text-white"
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                className={iconButtonClass("sm")}
                disabled={current === pageCount - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
