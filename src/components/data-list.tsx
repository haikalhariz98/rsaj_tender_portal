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
import { avatarTone, formatRM, initials } from "@/lib/format";

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
  | { kind: "badges"; items: string[]; max?: number };

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
  }
}

function CellView({ cell }: { cell: Cell | undefined }) {
  if (!cell) return <span className="dim">—</span>;
  switch (cell.kind) {
    case "stack":
      return (
        <div className="cellstack">
          <span className="cellstack__t">{cell.title}</span>
          {cell.sub && (
            <span className={`cellstack__s${cell.monoSub ? " mono" : ""}`}>{cell.sub}</span>
          )}
        </div>
      );
    case "text":
      return <span className={cell.dim ? "dim" : undefined}>{cell.text}</span>;
    case "money":
      return cell.value == null ? <span className="dim">—</span> : <>{formatRM(cell.value)}</>;
    case "badge":
      return <span className={`badge${cell.tone ? ` badge--${cell.tone}` : ""}`}>{cell.text}</span>;
    case "chip":
      return <span className={`chip${cell.tone ? ` chip--${cell.tone}` : ""}`}>{cell.text}</span>;
    case "person":
      return (
        <span className="row row--nowrap">
          <span className={`avatar avatar--xs ${avatarTone(cell.name)}`}>
            {initials(cell.name)}
          </span>
          <span className="sm trunc">{cell.name}</span>
        </span>
      );
    case "link":
      return (
        <div className="cellstack">
          <Link href={cell.href} className="cellstack__t">
            {cell.text}
          </Link>
          {cell.sub && <span className="cellstack__s">{cell.sub}</span>}
        </div>
      );
    case "avatars": {
      if (cell.names.length === 0) return <span className="dim">-</span>;
      const shownA = cell.names.slice(0, cell.max ?? 4);
      const restA = cell.names.length - shownA.length;
      return (
        <span className="avatars">
          {shownA.map((name) => (
            <span key={name} className={`avatar avatar--xs ${avatarTone(name)}`} title={name}>
              {initials(name)}
            </span>
          ))}
          {restA > 0 && <span className="avatar avatar--xs avatar--muted">+{restA}</span>}
        </span>
      );
    }
    case "badges": {
      if (cell.items.length === 0) return <span className="dim">-</span>;
      const shownB = cell.items.slice(0, cell.max ?? 3);
      const restB = cell.items.length - shownB.length;
      return (
        <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
          {shownB.map((item) => (
            <span key={item} className="badge">
              {item}
            </span>
          ))}
          {restB > 0 && <span className="badge badge--outline">+{restB}</span>}
        </span>
      );
    }
  }
}

export function DataList({
  columns,
  rows,
  views = [],
  filters = [],
  rowAction,
  actions,
  selectable = true,
  searchPlaceholder = "Search…",
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
  /// than navigating. Renders under an "Actions" header, as the prototype does.
  actions?: (id: string) => ReactNode;
  /// The prototype's configuration lists carry no selection column. Opt out rather
  /// than always rendering one.
  selectable?: boolean;
  searchPlaceholder?: string;
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

  /// Distinct values a filter chip can offer, taken from the rows themselves.
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

  return (
    <div className={`dl${flat ? " card--flat" : ""}`}>
      <div className="dl__bar">
        {views.length > 0 && (
          <select
            className="select select--sm"
            value={view}
            onChange={(e) => setView(e.target.value)}
            aria-label="View"
            style={{ width: "auto" }}
          >
            <option value="all">All records</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        )}

        <div className="searchinput">
          <span className="searchinput__ico">
            <SearchIcon size={15} />
          </span>
          <input
            className="input input--sm"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search this list"
          />
        </div>

        {filters.map((f) => (
          <div key={f.key} className="combo" style={{ flex: "none" }}>
            <button
              type="button"
              className="filterchip"
              data-on={chosen[f.key] ? "true" : undefined}
              aria-expanded={openFilter === f.key}
              onClick={() => setOpenFilter((o) => (o === f.key ? null : f.key))}
            >
              <span>{f.label}</span>
              {chosen[f.key] && <span className="filterchip__v">{chosen[f.key]}</span>}
              <ChevronDown size={14} />
            </button>
            {openFilter === f.key && (
              <div className="combo__menu" style={{ minWidth: 200 }}>
                <button
                  type="button"
                  className="combo__opt"
                  aria-pressed={!chosen[f.key]}
                  onClick={() => {
                    setChosen((c) => {
                      const next = { ...c };
                      delete next[f.key];
                      return next;
                    });
                    setOpenFilter(null);
                  }}
                >
                  Any {f.label.toLowerCase()}
                </button>
                {optionsFor[f.key]?.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="combo__opt"
                    aria-pressed={chosen[f.key] === value}
                    onClick={() => {
                      setChosen((c) => ({ ...c, [f.key]: value }));
                      setOpenFilter(null);
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="spacer" />

        <div className="dl__tools">
          {/* Icon-only with the label in a title, as the prototype has it. Words here
              would widen the bar and read as two more filters. */}
          <div className="segmented" role="group" aria-label="Row density">
            <button
              type="button"
              className="segmented__b"
              aria-pressed={!compact}
              aria-label="Comfortable rows"
              title="Comfortable rows"
              onClick={() => setCompact(false)}
            >
              <RowsWideIcon size={14} />
            </button>
            <button
              type="button"
              className="segmented__b"
              aria-pressed={compact}
              aria-label="Compact rows"
              title="Compact rows"
              onClick={() => setCompact(true)}
            >
              <RowsTightIcon size={14} />
            </button>
          </div>
          <button
            type="button"
            className="iconbtn iconbtn--bordered"
            onClick={exportCsv}
            aria-label="Download this view as CSV"
            title="Download this view as CSV"
          >
            <DownloadIcon size={16} />
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="dl__bulk">
          <span>
            {selected.size} selected
          </span>
          <div className="spacer" />
          <button type="button" className="btn btn--sm" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty empty--sm">
          <div className="empty__t">{emptyTitle}</div>
          {emptyBody && <p className="empty__d">{emptyBody}</p>}
        </div>
      ) : (
        <div className="tablewrap dl__scroll">
          <table className={`table${compact ? " table--compact" : ""}`}>
            <colgroup>
              {selectable && <col className="sel" style={{ width: 42 }} />}
              {columns.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
              {(rowAction || actions) && <col style={{ width: 52 }} />}
            </colgroup>
            <thead>
              <tr>
                {selectable && (
                  <th className="sel">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked ? new Set(paged.map((r) => r.id)) : new Set(),
                          )
                        }
                        aria-label="Select all rows"
                      />
                    </label>
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={[c.numeric ? "num" : "", c.sortable ? "is-sortable" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-sort={
                      sort?.key === c.key
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                  >
                    <span className="th__i">
                      <span className="th__t">{c.label}</span>
                      {c.sortable && (
                        <span className="sortmark" aria-hidden="true">
                          {sort?.key === c.key && sort.dir === "desc" ? "▾" : "▴"}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
                {(rowAction || actions) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <tr
                  key={row.id}
                  data-selected={selected.has(row.id) ? "true" : undefined}
                  // The prototype opens a record from anywhere in the row, not only
                  // from the button at the end. The button is the one that owns the
                  // drawer, so the row defers to it rather than holding its own copy
                  // of when a record is open.
                  data-clickable={actions ? "true" : undefined}
                  tabIndex={actions ? 0 : undefined}
                  onClick={
                    actions
                      ? (e) => {
                          if ((e.target as HTMLElement).closest("button,a,input,label")) return;
                          e.currentTarget
                            .querySelector<HTMLButtonElement>(".rowactions button")
                            ?.click();
                        }
                      : undefined
                  }
                  onKeyDown={
                    actions
                      ? (e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          if (e.target !== e.currentTarget) return;
                          e.preventDefault();
                          e.currentTarget
                            .querySelector<HTMLButtonElement>(".rowactions button")
                            ?.click();
                        }
                      : undefined
                  }
                >
                  {selectable && (
                    <td className="sel">
                      <label className="check">
                        <input
                          type="checkbox"
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
                      </label>
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? "num" : undefined}>
                      <CellView cell={row.cells[c.key]} />
                    </td>
                  ))}
                  {actions && (
                    <td>
                      <div className="rowactions">{actions(row.id)}</div>
                    </td>
                  )}
                  {rowAction && !actions && (
                    <td>
                      <div className="rowactions">
                        <Link
                          href={rowAction.hrefTemplate.replace("{id}", row.id)}
                          className="iconbtn iconbtn--sm"
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

      <div className="dl__foot">
        <span className="num">
          {visible.length === 0
            ? "No records"
            : `Showing ${start + 1}-${Math.min(start + pageSize, visible.length)} of ${visible.length}`}
        </span>
        <div className="spacer" />
        <label className="row" style={{ gap: 6 }}>
          <span className="xs dim">Rows</span>
          <select
            className="select select--sm"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            style={{ width: "auto" }}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {visible.length > 0 && (
          <nav className="pager" aria-label="Pagination">
            <button
              type="button"
              className="pager__b"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              aria-label="Previous page"
            >
              <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className="pager__b"
                aria-current={i === current ? "page" : undefined}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              type="button"
              className="pager__b"
              disabled={current === pageCount - 1}
              onClick={() => setPage(current + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
