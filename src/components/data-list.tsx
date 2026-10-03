"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";

import {
  ChevronRight,
  DownloadIcon,
  RowsTightIcon,
  RowsWideIcon,
  SearchIcon,
} from "@/components/icons";
import { AvatarStack, Avatar } from "@/components/ui/avatar";
import { Badge, Chip } from "@/components/ui/badge";
import { Button, iconButtonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState, Meter } from "@/components/ui/feedback";
import { provenanceLabel, ProvenanceBadge } from "@/components/ui/provenance";
import { Select } from "@/components/ui/select";
import { VALUE_SULIT_LABEL } from "@/lib/documents/labels";
import { formatRM } from "@/lib/format";
import { needsPaging, PAGE_SIZES } from "@/lib/paging";

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
  /// Toned chips stacked in one cell, for a column that summarises several checks
  /// ("Within budget" over "No split found") rather than spending a column on each.
  /// A chip with `nowrap` keeps to one line from `md` up (its column must be sized to hold
  /// it); on a phone it still wraps.
  /// A chip with `provenance` carries the shared provenance tag beside it (a reading that rests on an assumption,
  /// say), so a list never writes "(assumed)" in its own words.
  | { kind: "chips"; items: { text: string; tone?: "ok" | "warn" | "err" | "info" | "brand"; nowrap?: boolean; provenance?: "STATED" | "OBSERVED" | "ASSUMED" }[] }
  /// A filled bar with the figure beside it, and a marker at the configured warning
  /// threshold. Null percent renders as not set — a code with no allocation has not
  /// used none of its budget, and a bar drawn at zero says it has.
  | { kind: "meter"; percent: number | null; threshold: number | null };

export interface Column {
  key: string;
  label: string;
  /// Any CSS width. Prefer pixels for a column that holds a figure or a control:
  /// a percentage of a narrow card is narrower than the figure it must hold.
  width?: string;
  numeric?: boolean;
  /// The least this column may shrink to, in pixels ("200px"), for the one column a list leaves
  /// without a width (it takes what the fixed columns leave). The table is then never narrower than
  /// the fixed widths plus this, and scrolls inside its card rather than squeezing the column (6.7
  /// review S-1). Only px widths are summed; give the other columns px widths.
  minWidth?: string;
  /// Text in this column never wraps and is never cut: a date, a reference. Size the
  /// column to hold it. Without it text wraps onto a second line rather than being
  /// truncated, so the main column of a list always shows what the row is.
  nowrap?: boolean;
  sortable?: boolean;
  /// Drop this column below the named breakpoint, for a secondary column a narrow
  /// card cannot afford.
  hideBelow?: "md" | "lg" | "xl" | "2xl";
  /// Opt-in stacked layout below `md`. When any column sets this, the table is
  /// replaced on a phone by one card-row per record: the `primary` column is the
  /// title, each `meta` column follows under its label (status, value, date…), and
  /// `hide` columns are left out. A column with no flag counts as `hide`. Desktop is
  /// unchanged. Sorting is a table feature and is not offered in the stacked layout.
  mobile?: "primary" | "meta" | "hide";
  /// The column shows a SULIT figure that nothing yet restricts (6.2 OD-8): its header
  /// carries the SULIT chip, and the list offers no export in any form. Search, filters
  /// and sort stay. Files that must leave are built on the server and recorded, never
  /// downloaded from a list (NFR-SEC-002, NFR-AUD-004). The registry of fields that
  /// require this flag is `src/lib/sulit-fields.ts`; a test scans the screens for it.
  sulit?: boolean;
}

/// Whether a list may offer a client export: never when any column is SULIT.
export function canExport(columns: readonly Column[]): boolean {
  return !columns.some((c) => c.sulit);
}

/// The chip a SULIT column's header carries: "SULIT" to the eye, the whole sentence to a
/// screen reader and in the tooltip, so a narrow column keeps the words.
function SulitMark() {
  return (
    <Chip tone="err" wrap={false} title={VALUE_SULIT_LABEL} className="px-2 py-0 text-[11px] leading-5 font-semibold">
      <span aria-hidden="true">SULIT</span>
      <span className="sr-only">{VALUE_SULIT_LABEL}</span>
    </Chip>
  );
}
// Written out whole for Tailwind (see HIDE_COL_BELOW): the stacked list below the breakpoint, the table from it.
const STACKED_BELOW = { md: "md:hidden", xl: "xl:hidden", "2xl": "2xl:hidden" } as const;
const TABLE_FROM = { md: "hidden md:block", xl: "hidden xl:block", "2xl": "hidden 2xl:block" } as const;

const px = (w: string | undefined) => (w && /^\d+(\.\d+)?px$/.test(w.trim()) ? Number.parseFloat(w) : null);

/**
 * The table's least width where a column sets `minWidth` (6.7 review S-1): the fixed px widths, the
 * column's floor, the selection and actions columns. Null where no column sets one: the list keeps
 * its own 640px floor, so every other list is unchanged.
 */
export function minTableWidth(columns: readonly Pick<Column, "width" | "minWidth" | "hideBelow">[], extra: { selectable: boolean; actions: number }): string | null {
  if (!columns.some((c) => px(c.minWidth) != null)) return null;
  const sum = columns.reduce((n, c) => n + (px(c.width) ?? px(c.minWidth) ?? 0), 0) + (extra.selectable ? 48 : 0) + extra.actions;
  return `${Math.max(640, sum)}px`;
}

const HIDE_BELOW = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
} as const;

// Written out, not derived from the map above: Tailwind only emits classes it can
// read whole from the source.
const HIDE_COL_BELOW = {
  md: "hidden md:table-column",
  lg: "hidden lg:table-column",
  xl: "hidden xl:table-column",
  "2xl": "hidden 2xl:table-column",
} as const;

export interface Row {
  id: string;
  cells: Record<string, Cell>;
  /// Values sorting compares. Absent keys fall back to the cell's own text.
  sortKeys?: Record<string, string | number>;
  /// Everything search should match against, already flattened.
  search: string;
  /// Named views this row belongs to, beyond "all".
  views?: string[];
  /// A sentence about the row that needs the row's full width — why an action beside it is
  /// disabled, say. Shown under the row, never squeezed into the actions column.
  note?: string;
}

export interface View {
  id: string;
  label: string;
  /// What an empty list says when this view is chosen and nothing is in it ("Nothing closes
  /// this week"), rather than the list's own empty state. The way back to all records is always offered.
  emptyTitle?: string;
  emptyBody?: string;
  /// What a heading above the list says about this view (what counts in it), where it needs saying.
  about?: string;
}

/// A chip in the toolbar that narrows the list by one column's values.
export interface Filter {
  key: string;
  label: string;
  /// The values to offer, in this order (a lifecycle, say), whether or not a row holds
  /// them yet. Values the rows hold beyond it follow, sorted. Omitted: the rows'
  /// own values, sorted.
  order?: string[];
}

/// An action offered on hover at the end of each row.
export interface RowAction {
  label: string;
  /// `{id}` in the template is replaced with the row's id.
  hrefTemplate: string;
}

/// Whether a row's rendered actions hold anything: `null`, `undefined`, `false` and an empty
/// array are nothing. A renderer returns nothing for a row with no action, and a list in which
/// no row has one shows no actions column at all rather than an empty one taking room.
export function hasRowAction(node: ReactNode): boolean {
  if (node == null || node === false || node === true || node === "") return false;
  if (Array.isArray(node)) return node.some(hasRowAction);
  return true;
}

/// Where a list's per-row actions go. `column` (the default) is the Actions column at the row's
/// end. `below` puts them on a full-width line under the row, right-aligned beside its note: for
/// a list whose action labels are wider than a column a laptop's card can spare beside the
/// columns that matter, so the data keeps the width and no button is cut at the card's edge.
export type ActionsPlacement = "column" | "below";

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
    case "chips":
      return cell.items.map((i) => (i.provenance ? `${i.text} (${provenanceLabel(i.provenance)})` : i.text)).join(" · ");
    case "meter":
      return cell.percent == null ? "" : `${cell.percent}%`;
  }
}


const dash = <span className="text-ink-4">—</span>;

function CellView({ cell, nowrap = false }: { cell: Cell | undefined; nowrap?: boolean }) {
  if (!cell) return dash;
  // Text wraps by default (a long name goes onto a second line, break-words so a long
  // reference cannot push the column wider); `nowrap` columns keep one line.
  const line = nowrap ? "whitespace-nowrap" : "break-words";
  switch (cell.kind) {
    case "stack":
      return (
        <div className="min-w-0">
          <div className={cx(line, "font-semibold text-ink")}>{cell.title}</div>
          {cell.sub && (
            <div
              className={cx(
                "break-words text-[12.5px] text-ink-3",
                cell.monoSub && "font-mono text-[12px]",
              )}
            >
              {cell.sub}
            </div>
          )}
        </div>
      );
    case "text":
      return <span className={cx("block", line, cell.dim ? "text-ink-3" : "text-ink")}>{cell.text}</span>;
    case "money":
      return cell.value == null ? (
        dash
      ) : (
        <span className="font-semibold tabular-nums">{formatRM(cell.value)}</span>
      );
    case "badge":
      // One line where the column holds it; a status wider than its column wraps inside it rather than
      // running over the next column (6.12 review S-2: "Awaiting conditions precedent" over the Dates column).
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
          <span className="min-w-0 break-words">{cell.name}</span>
        </span>
      );
    case "link":
      return (
        <div className="min-w-0">
          <Link
            href={cell.href}
            className={cx("block font-semibold text-brand-700 no-underline hover:text-brand-800 hover:underline", line)}
          >
            {cell.text}
          </Link>
          {cell.sub && <div className="break-words text-[12.5px] text-ink-3">{cell.sub}</div>}
        </div>
      );
    case "avatars":
      return cell.names.length === 0 ? dash : <AvatarStack names={cell.names} max={cell.max ?? 4} />;
    case "meter":
      return <Meter percent={cell.percent} threshold={cell.threshold} />;
    case "chips":
      return cell.items.length === 0 ? (
        dash
      ) : (
        <span className="flex flex-col items-start gap-1">
          {cell.items.map((item) => {
            const chip = (
              <Chip key={item.text} tone={item.tone} title={item.text} className={item.nowrap ? "md:whitespace-nowrap" : undefined}>
                {item.text}
              </Chip>
            );
            return item.provenance ? (
              <span key={item.text} className="flex flex-wrap items-center gap-1.5">
                {chip}
                <ProvenanceBadge value={item.provenance} />
              </span>
            ) : (
              chip
            );
          })}
        </span>
      );
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
  actionsWidth,
  actionsPlacement = "column",
  rowOpens = false,
  selectable = true,
  searchPlaceholder = "Search…",
  searchable = true,
  flat = false,
  emptyTitle = "Nothing here",
  emptyBody,
  exportName = "export",
  toolbar = true,
  stackBelow = "md",
  onViewChange,
  initialView,
}: {
  columns: Column[];
  rows: Row[];
  views?: View[];
  filters?: Filter[];
  rowAction?: RowAction;
  /// Arbitrary per-row controls, for screens whose row action opens an editor rather
  /// than navigating. Renders under an "Actions" header.
  actions?: (id: string) => ReactNode;
  /// Pixels for the actions column; 128 holds two icon buttons or one labelled one. Give
  /// less when a row has a single icon, so the room goes to the row's main column.
  actionsWidth?: number;
  /// Where `actions` go: the Actions column (default) or a full-width line under the row. See
  /// `ActionsPlacement`. Either way a row whose renderer returns nothing shows nothing, and the
  /// column is left out when no row has an action.
  actionsPlacement?: ActionsPlacement;
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
  /// False for a short read-only list inside a card, where views, search, density and
  /// export would be chrome with nothing to act on.
  toolbar?: boolean;
  /// Where the stacked list gives way to the table. `xl` for a list whose columns need
  /// more than a laptop's card (configuration lists beside the sidebar at 1024); `2xl` for one
  /// whose columns need more than a 1280–1440 laptop's card beside the sidebar (6.7 review S-1).
  stackBelow?: "md" | "xl" | "2xl";
  /// Told when a view is picked ("" for all records), so a heading beside the list can say
  /// which list this is. The list keeps the state; this only reports it.
  onViewChange?: (id: string) => void;
  /// The view the list opens on (a view named in the address). Ignored if no such view exists.
  initialView?: string;
}) {
  const [compact, setCompact] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [view, setView] = useState(initialView && views.some((v) => v.id === initialView) ? initialView : "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Record<string, string>>({});

  /// Distinct values a filter can offer, taken from the rows themselves.
  const optionsFor = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      const held = [...new Set(rows.map((r) => cellText(r.cells[f.key])).filter(Boolean))].sort();
      map[f.key] = f.order ? [...f.order, ...held.filter((v) => !f.order!.includes(v))] : held;
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

  // Paging controls say nothing when everything fits on one page at every size.
  const showFooter = needsPaging(visible.length);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const paged = visible.slice(start, start + pageSize);

  const allSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));

  // Filtering an empty list is noise. The tools appear once there is something to use
  // them on, or once a filter is what emptied it.
  const narrowed = view !== "all" || query !== "" || Object.keys(chosen).length > 0;
  const showTools = toolbar && (rows.length > 0 || narrowed);

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }

  const sortButton = (c: Column) => (
    <button
      type="button"
      onClick={() => toggleSort(c.key)}
      title={c.label}
      className={cx(
        // Held to the column: a heading wider than a narrow column is
        // cut with an ellipsis rather than spilling into the next one.
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md align-middle hover:text-ink",
        c.numeric ? "text-right" : "text-left",
        sort?.key === c.key && "text-ink",
      )}
    >
      <span className="min-w-0 break-words">{c.label}</span>
      <span aria-hidden="true" className={cx("shrink-0 text-[9px]", sort?.key !== c.key && "opacity-40")}>
        {sort?.key === c.key && sort.dir === "desc" ? "▼" : "▲"}
      </span>
    </button>
  );

  const exportable = canExport(columns);

  function exportCsv() {
    // The guard lives here as well as in the button: no path out of a SULIT list.
    if (!exportable) return;
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

  // Each row's actions, rendered once. The column is decided over every row, not the page, so
  // it does not come and go as the reader pages or changes view.
  const rendered = new Map<string, ReactNode>(actions ? rows.map((r) => [r.id, actions(r.id)] as const) : []);
  const anyAction = actions ? [...rendered.values()].some(hasRowAction) : false;
  const actionsBelow = !!actions && actionsPlacement === "below";
  // The trailing column: the row link's arrow, or the actions when they sit in a column and a row has one.
  const actionColumn = actions ? anyAction && !actionsBelow : !!rowAction;
  const tableMinWidth = minTableWidth(columns, { selectable, actions: actionColumn ? (actions ? (actionsWidth ?? 128) : 56) : 0 });
  const rowActionsOf = (id: string) => rendered.get(id);
  const actionsLineOf = (id: string) => actionsBelow && hasRowAction(rendered.get(id));

  const openRow = (tr: HTMLElement) =>
    (
      tr.querySelector<HTMLElement>("[data-rowactions] button, [data-rowactions] a") ??
      // A list with its actions below the row keeps them on the next line.
      (tr.nextElementSibling as HTMLElement | null)?.querySelector<HTMLElement>("[data-rowactions] button, [data-rowactions] a")
    )?.click();

  // The stacked phone layout is opt-in: a list whose columns carry no `mobile` flag
  // keeps its scrolling table.
  const stacked = columns.some((c) => c.mobile);
  const mobilePrimary = columns.find((c) => c.mobile === "primary");
  const mobileMeta = columns.filter((c) => c.mobile === "meta");

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
            <Select
              variant="chip"
              aria-label="View"
              searchable={false}
              value={view === "all" ? "" : view}
              onChange={(e) => {
                setView(e.target.value || "all");
                onViewChange?.(e.target.value);
              }}
            >
              <option value="">All records</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
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

          {filters.map((f) => (
            <Select
              key={f.key}
              variant="chip"
              aria-label={f.label}
              chipLabel={f.label}
              value={chosen[f.key] ?? ""}
              onChange={(e) =>
                setChosen((c) => {
                  const next = { ...c };
                  if (e.target.value === "") delete next[f.key];
                  else next[f.key] = e.target.value;
                  return next;
                })
              }
            >
              <option value="">{`Any ${f.label.toLowerCase()}`}</option>
              {(optionsFor[f.key] ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          ))}

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
            {exportable && (
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Download this view as CSV"
              title="Download this view as CSV"
              className={iconButtonClass("sm", true, "size-9")}
            >
              <DownloadIcon size={16} />
            </button>
            )}
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
          title={narrowed ? (views.find((v) => v.id === view)?.emptyTitle ?? "Nothing matches") : emptyTitle}
          className={cx(showTools && "border-t border-line")}
          action={
            narrowed ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setView("all");
                  onViewChange?.("");
                  setQuery("");
                  setChosen({});
                }}
              >
                Show all records
              </Button>
            ) : undefined
          }
        >
          {narrowed ? (views.find((v) => v.id === view)?.emptyBody ?? "No record matches the view, search and filters you have chosen.") : emptyBody}
        </EmptyState>
      ) : (
        <>
        {stacked && (
          <ul className={cx("divide-y divide-line/70 border-t border-line", STACKED_BELOW[stackBelow])}>
            {paged.map((row) => (
              <li
                key={row.id}
                className={cx("flex items-start gap-3 px-4 py-3.5", selected.has(row.id) && "bg-brand-50/60")}
              >
                {selectable && (
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 cursor-pointer accent-brand-600"
                    checked={selected.has(row.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                    aria-label={`Select ${cellText(row.cells[(mobilePrimary ?? columns[0]).key])}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  {mobilePrimary && (
                    <div className="text-[14.5px] [&_.truncate]:overflow-visible [&_.truncate]:text-clip [&_.truncate]:whitespace-normal">
                      <CellView cell={row.cells[mobilePrimary.key]} />
                    </div>
                  )}
                  {mobileMeta.length > 0 && (
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {mobileMeta.map((c) => (
                        <div key={c.key} className="min-w-0">
                          <dt className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] font-semibold text-ink-3">
                            {c.label}
                            {c.sulit && <SulitMark />}
                          </dt>
                          <dd className={cx("mt-0.5 min-w-0 text-[13.5px] [&_.truncate]:overflow-visible [&_.truncate]:text-clip [&_.truncate]:whitespace-normal", c.numeric && "tabular-nums")}>
                            <CellView cell={row.cells[c.key]} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {row.note && <p className="mt-2.5 text-[12.5px] leading-snug text-ink-3">{row.note}</p>}
                  {actions && hasRowAction(rowActionsOf(row.id)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-1">{rowActionsOf(row.id)}</div>
                  )}
                </div>
                {rowAction && !actions && (
                  <Link
                    href={rowAction.hrefTemplate.replace("{id}", row.id)}
                    className={iconButtonClass("sm", false, "shrink-0 text-ink-4")}
                    aria-label={rowAction.label}
                    title={rowAction.label}
                  >
                    <ChevronRight size={16} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className={cx("relative overflow-x-auto", stacked && TABLE_FROM[stackBelow])}>
          {/* Relative so a positioned descendant is clipped here rather than by the
              page: without it a wide table scrolled the whole screen at phone width. */}
          <table className="w-full min-w-[640px] table-fixed border-collapse text-[13.5px]" style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}>
            <colgroup>
              {selectable && <col style={{ width: 48 }} />}
              {columns.map((c) => (
                <col
                  key={c.key}
                  className={c.hideBelow ? HIDE_COL_BELOW[c.hideBelow] : undefined}
                  style={c.width ? { width: c.width } : undefined}
                />
              ))}
              {actionColumn && <col style={{ width: actions ? (actionsWidth ?? 128) : 56 }} />}
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
                      // A heading wraps onto a second line rather than being cut: a long
                      // label ("Finance & Operations") must not need a wide column.
                      "px-4 py-2.5 align-bottom text-[12px] leading-4 font-semibold text-ink-3",
                      c.numeric ? "text-right" : "text-left",
                      c.hideBelow && HIDE_BELOW[c.hideBelow],
                    )}
                  >
                    {c.sulit ? (
                      <span className={cx("flex flex-wrap items-center gap-x-2 gap-y-1", c.numeric ? "justify-end" : "justify-start")}>
                        {c.sortable ? sortButton(c) : c.label}
                        <SulitMark />
                      </span>
                    ) : c.sortable ? (
                      sortButton(c)
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                {actionColumn && (
                  <th className="px-4 py-2.5 text-right text-[12px] font-semibold whitespace-nowrap text-ink-3">
                    {/* A lone row link is an arrow in a 56px column; the word would clip.
                        Screen readers still get the name of the column. */}
                    <span className={actions ? undefined : "sr-only"}>Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <Fragment key={row.id}>
                <tr
                  tabIndex={rowOpens ? 0 : undefined}
                  className={cx(
                    "group border-b border-line/70 transition hover:bg-brand-50/40",
                    row.note || actionsLineOf(row.id) ? "border-b-0" : "last:border-b-0",
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
                      className={cx(
                        cellPad,
                        "align-middle",
                        c.numeric && "text-right whitespace-nowrap tabular-nums",
                        c.hideBelow && HIDE_BELOW[c.hideBelow],
                      )}
                    >
                      <CellView cell={row.cells[c.key]} nowrap={c.nowrap} />
                    </td>
                  ))}
                  {actions && actionColumn && (
                    <td className={cellPad}>
                      <div data-rowactions className="flex items-center justify-end-safe gap-1 whitespace-nowrap">
                        {rowActionsOf(row.id)}
                      </div>
                    </td>
                  )}
                  {rowAction && !actions && (
                    <td className={cellPad}>
                      <div data-rowactions className="flex justify-end-safe">
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
                {(row.note || actionsLineOf(row.id)) && (
                  <tr className="border-b border-line/70 last:border-b-0">
                    <td colSpan={columns.length + (selectable ? 1 : 0) + (actionColumn ? 1 : 0)} className="px-4 pb-3 text-[12.5px] leading-snug text-ink-3">
                      {actionsLineOf(row.id) ? (
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                          <span className="min-w-0 flex-1">{row.note}</span>
                          <div data-rowactions className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                            {rowActionsOf(row.id)}
                          </div>
                        </div>
                      ) : (
                        row.note
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {showFooter && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-3 sm:px-5">
          <span className="tabular-nums">
            {`Showing ${start + 1}-${Math.min(start + pageSize, visible.length)} of ${visible.length}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12.5px]" aria-hidden="true">Rows</span>
            <Select
              variant="chip"
              aria-label="Rows per page"
              searchable={false}
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
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
