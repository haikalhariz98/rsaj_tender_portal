"use client";

import Form from "next/form";
import Link from "next/link";
import { Fragment, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import {
  ChevronRight,
  DownloadIcon,
  SearchIcon,
} from "@/components/icons";
import { useLanguage, useSay } from "@/components/i18n/language-context";
import { AvatarStack, Avatar } from "@/components/ui/avatar";
import { Badge, Chip, SulitLock, SulitWithheld } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClass, iconButtonClass } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { EmptyState, Meter, Note } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { Select } from "@/components/ui/select";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";
import { sayWith } from "@/lib/i18n/say";
import { formatRM } from "@/lib/format";
import { compareSenOrNone, formatMoney } from "@/lib/money";
import { needsPaging, PAGE_SIZES } from "@/lib/paging";
import { canExport, cellText, exportColumns, listCsv, type Cell, type Column, type Row, type StatusItem } from "@/lib/ui/list-cells";

/**
 * The list chrome around every table: a view selector, search, sort, row selection,
 * and CSV export (the row-density switch was removed, founder 2026-10-04).
 *
 * Cells are described as data rather than passed as rendered nodes, so a server
 * component can hand rows straight over and the client can still sort and search
 * them. Adding a cell kind here is how a new column type arrives. The cell and column types, and
 * the pure text of a cell, live in `src/lib/ui/list-cells.ts`, so a route handler can use them.
 */
export type { Cell, Column, Row, StatusItem };

/**
 * Server mode (plan step 7, 7.3): the list the server searches, sorts and pages. The address carries the query (`ListQuery`); the page
 * reads one page of rows and the true total and passes them in, so the client never filters a partial set. Every href is made by the page
 * with `listHref`, because a function cannot cross to a client component.
 */
export interface ServerMode {
  /// The search text now in the address.
  q: string | null;
  /// The list's own address; the search box is a GET form to it, name "q".
  action: string;
  /// Hidden inputs a search keeps (the view, the sort, the page size). The page is dropped: a new search starts at the first.
  keep?: Record<string, string>;
  total: number;
  page: number;
  size: number;
  prevHref: string | null;
  nextHref: string | null;
  sizeHrefs: Record<(typeof PAGE_SIZES)[number], string>;
  /// ST-7: a column is drawn sortable only if its key is here, and its header is this link. Whatever else a column says, it is not sortable on the client.
  sortHrefs: Record<string, string>;
  /// The order now (column key), for the arrow and `aria-sort`.
  sorted: { key: string; dir: "asc" | "desc" } | null;
  /// Export is this route's link; absent, the list keeps its own client export of the page shown (until the export routes).
  exportHref?: string;
  /// Set where this view or size cannot be exported: Export is not offered, and this one line is said instead (ST-8).
  exportBlocked?: string;
  /// The way back to the whole list; set when a search or a view is narrowing it.
  clearHref: string | null;
}
export { canExport, exportColumns };

/// The SULIT columns in which every row is withheld from this reader (FR-EVL-014): a column of nothing but "SULIT · withheld" says it once, above the
/// list. Presentation only: a withheld cell carries no value, and the export already leaves SULIT columns out. A column with one value shown stays.
export function withheldColumns(columns: readonly Column[], rows: readonly Row[]): Column[] {
  if (rows.length === 0) return [];
  return columns.filter((c) => c.sulit && rows.every((r) => r.cells[c.key]?.kind === "withheld"));
}

/// Why the values are withheld, in the cells' own words (each says who is entitled), said once.
function withheldReason(gone: readonly Column[], rows: readonly Row[]): string {
  const words = rows.flatMap((r) => gone.map((c) => r.cells[c.key])).flatMap((cell) => (cell?.kind === "withheld" ? [cell.words] : []));
  return [...new Set(words)].join(" ");
}

/// The mark a SULIT column's header carries: the shared lock beside the column name, the
/// whole sentence in the tooltip and to a screen reader (founder, 2026-10-04: a lock, not a chip).
function SulitMark({ label }: { label?: string }) {
  const say = useSay();
  return <SulitLock size={12} label={label ?? say(WORDS.sulitColumn)} />;
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

export interface View {
  id: string;
  label: string;
  /// What an empty list says when this view is chosen and nothing is in it ("Nothing closes
  /// this week"), rather than the list's own empty state. The way back to all records is always offered.
  emptyTitle?: string;
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

/// A money cell's sen, for an exact sort: undefined where the cell is not money in sen, null where it holds none.
function senOf(cell: Cell | undefined): bigint | null | undefined {
  if (!cell || cell.kind !== "money" || cell.sen === undefined) return undefined;
  return cell.sen == null ? null : BigInt(cell.sen);
}

const dash = <span className="text-ink-4">—</span>;

/// The one status chip, and "+N" for the rest. The full list is a tooltip that opens on hover and on keyboard focus; a screen reader gets
/// it as the description.
function StatusCell({ main, others }: { main: StatusItem; others: StatusItem[] }) {
  const { language } = useLanguage();
  const id = useId();
  const chip = (item: StatusItem) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <Chip tone={item.tone}>{item.text}</Chip>
      {item.provenance && <ProvenanceBadge value={item.provenance} lang={language} />}
    </span>
  );
  const anchor = useRef<HTMLSpanElement>(null);
  // Where the tooltip sits, in the window: fixed, so the table wrapper cannot clip it, and above the chip when there is no room below.
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  if (others.length === 0) return chip(main);
  const show = () => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const needed = 28 + (others.length + 1) * 34;
    const below = window.innerHeight - box.bottom;
    setPlace(below >= needed || below >= box.top ? { left: box.left, top: box.bottom + 8 } : { left: box.left, bottom: window.innerHeight - box.top + 8 });
  };
  return (
    <span
      ref={anchor}
      className="inline-flex items-center gap-1.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={show}
      onMouseLeave={() => setPlace(null)}
      onFocus={show}
      onBlur={() => setPlace(null)}
    >
      {chip(main)}
      <span className="text-[12.5px] font-semibold text-ink-3" aria-hidden="true">+{others.length}</span>
      <span
        id={id}
        role="tooltip"
        style={place ?? undefined}
        className={cx(
          "pointer-events-none fixed z-30 w-max max-w-64 flex-col items-start gap-1.5 rounded-xl border border-line bg-surface p-2.5 shadow-pop",
          place ? "flex" : "hidden",
        )}
      >
        {[main, ...others].map((item) => (
          <span key={item.text}>{chip(item)}</span>
        ))}
      </span>
    </span>
  );
}

function CellView({ cell, nowrap = false }: { cell: Cell | undefined; nowrap?: boolean }) {
  const { language } = useLanguage();
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
      if (cell.sen !== undefined) return cell.sen == null ? dash : <span className="font-semibold tabular-nums">{formatMoney(BigInt(cell.sen))}</span>;
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
    case "open":
      return <OpenCell cell={cell} line={line} />;
    case "download":
      return (
        <div className="min-w-0">
          <a href={cell.href} download className={buttonClass("secondary", "sm")} aria-label={cell.label}>
            {cell.text}
          </a>
          {cell.sub && <div className="mt-1 break-words text-[12.5px] text-ink-3">{cell.sub}</div>}
        </div>
      );
    case "avatars":
      return cell.names.length === 0 ? dash : <AvatarStack names={cell.names} max={cell.max ?? 4} />;
    case "meter":
      return <Meter percent={cell.percent} threshold={cell.threshold} />;
    case "withheld":
      return <SulitWithheld words={cell.words} compact />;
    case "select":
      return <SelectCell cell={cell} />;
    case "chips":
      return cell.items.length === 0 ? (
        dash
      ) : (
        <span className="flex flex-col items-start gap-1">
          {cell.items.map((item) => {
            const chip = (
              // A chip wider than its column wraps inside it rather than being cut ("Approved, not in the finance sy…"); `nowrap` keeps one line.
              <Chip key={item.text} tone={item.tone} title={item.text} wrap={!item.nowrap}>
                {item.text}
              </Chip>
            );
            return item.provenance ? (
              <span key={item.text} className="flex flex-wrap items-center gap-1.5">
                {chip}
                <ProvenanceBadge value={item.provenance} lang={language} />
              </span>
            ) : (
              chip
            );
          })}
        </span>
      );
    case "status":
      return <StatusCell main={cell.main} others={cell.others} />;
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
  columns: allColumns,
  rows,
  views = [],
  filters = [],
  rowAction,
  actions,
  actionsWidth,
  actionsPlacement = "column",
  rowOpens = false,
  selectable = true,
  searchPlaceholder,
  searchable = true,
  flat = false,
  emptyTitle,
  exportName = "export",
  toolbar = true,
  stackBelow = "md",
  onViewChange,
  initialView,
  toolbarLead,
  toolbarFilters,
  paging = true,
  server,
}: {
  columns: Column[];
  rows: Row[];
  views?: View[];
  filters?: Filter[];
  /// A control the screen owns, drawn first in the toolbar (a server-side view picker, say). It keeps the
  /// toolbar on when the view it picked has no rows, so the way back is never hidden.
  toolbarLead?: ReactNode;
  /// A control the screen owns, drawn where the list's own filter chips go (after the search box). Like `toolbarLead`
  /// it keeps the toolbar on when the choice it made has no rows.
  toolbarFilters?: ReactNode;
  /// False for a list the server pages (a cursor and a link), whose rows are all shown: no client pages, and so no footer that counts them.
  paging?: boolean;
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
  /// Opt-in server mode: search, sort and paging are the server's, driven by the address. Views are the page's own chips and filters are not offered.
  server?: ServerMode;
}) {
  const gone = withheldColumns(allColumns, rows);
  const columns = gone.length > 0 ? allColumns.filter((c) => !gone.includes(c)) : allColumns;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  // The list's own words, in the language being read (NFR-LNG-001); a screen's words are passed in and left as they come.
  const say = useSay();
  const { language } = useLanguage();
  const sayN = (words: typeof WORDS.showing, values: Record<string, string>) => sayWith(words, language, values);
  const [view, setView] = useState(initialView && views.some((v) => v.id === initialView) ? initialView : "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Record<string, string>>({});
  // A filter and a typed search hold the words a cell showed, which another language no longer shows: on a switch they are cleared
  // (during render, as React advises) rather than left to empty the list under a chip that matches nothing. The view, sort and page stay.
  const [readIn, setReadIn] = useState(language);
  if (readIn !== language) {
    setReadIn(language);
    setChosen({});
    setQuery("");
    setPage(0);
  }

  /// Distinct values a filter can offer, taken from the rows themselves.
  const optionsFor = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      const held = [...new Set(rows.map((r) => cellText(r.cells[f.key], language)).filter(Boolean))].sort();
      map[f.key] = f.order ? [...f.order, ...held.filter((v) => !f.order!.includes(v))] : held;
    }
    return map;
  }, [filters, rows, language]);

  const visible = useMemo(() => {
    if (server) return rows;
    const needle = query.trim().toLowerCase();
    let out = rows.filter(
      (r) =>
        (view === "all" || r.views?.includes(view)) &&
        (needle === "" || r.search.toLowerCase().includes(needle)) &&
        Object.entries(chosen).every(([key, value]) => cellText(r.cells[key], language) === value),
    );

    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        // Money in sen sorts as the integer it is (none first), unless the row gives its own key.
        const as = senOf(a.cells[key]);
        const bs = senOf(b.cells[key]);
        if (a.sortKeys?.[key] == null && b.sortKeys?.[key] == null && as !== undefined && bs !== undefined) {
          const cmp = compareSenOrNone(as, bs);
          return dir === "asc" ? cmp : -cmp;
        }
        const av = a.sortKeys?.[key] ?? cellText(a.cells[key], language);
        const bv = b.sortKeys?.[key] ?? cellText(b.cells[key], language);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, view, query, sort, chosen, language, server]);

  // Paging controls say nothing when everything fits on one page at every size.
  const showFooter = !server && paging && needsPaging(visible.length);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = paging ? current * pageSize : 0;
  const paged = paging ? visible.slice(start, start + pageSize) : visible;

  const allSelected = paged.length > 0 && paged.every((r) => selected.has(r.id));

  // Filtering an empty list is noise. The tools appear once there is something to use
  // them on, or once a filter is what emptied it.
  const narrowed = server ? server.clearHref != null : view !== "all" || query !== "" || Object.keys(chosen).length > 0;
  const showTools = toolbar && (rows.length > 0 || narrowed || toolbarLead != null || toolbarFilters != null);

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }

  const shownSort = server ? server.sorted : sort;
  const sortClass = (c: Column) =>
    cx(
      // Held to the column: a heading wider than a narrow column is
      // cut with an ellipsis rather than spilling into the next one.
      "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md align-middle hover:text-ink",
      c.numeric ? "text-right" : "text-left",
      shownSort?.key === c.key && "text-ink",
    );
  const sortBody = (c: Column) => (
    <>
      <span className="min-w-0 break-words">{c.label}</span>
      {/* Server mode draws the arrow only on the column the list is sorted by: under the default order a dim ▲ on the first column read as
          "sorted by this, ascending" (Phase 0.2 item 4). */}
      {(!server || shownSort?.key === c.key) && (
        <span aria-hidden="true" className={cx("shrink-0 text-[9px]", shownSort?.key !== c.key && "opacity-40")}>
          {shownSort?.key === c.key && shownSort.dir === "desc" ? "▼" : "▲"}
        </span>
      )}
    </>
  );
  const sortableCol = (c: Column) => (server ? Object.hasOwn(server.sortHrefs, c.key) : !!c.sortable);
  const sortButton = (c: Column) =>
    server ? (
      <Link href={server.sortHrefs[c.key]} title={c.label} className={cx(sortClass(c), "no-underline hover:no-underline")}>
        {sortBody(c)}
      </Link>
    ) : (
      <button type="button" onClick={() => toggleSort(c.key)} title={c.label} className={sortClass(c)}>
        {sortBody(c)}
      </button>
    );

  const exportable = canExport(allColumns);
  const leavesOutSulit = allColumns.some((c) => c.sulit);

  function exportCsv() {
    // The guard lives here as well as in the button: a SULIT column never leaves in the file.
    if (!exportable) return;
    // The whole filtered list, not just the page being looked at.
    const csv = listCsv(columns, visible, language);
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

  const cellPad = "px-4 py-3.5";

  return (
    <div
      className={cx(
        "min-w-0",
        !flat && "overflow-hidden rounded-card border border-line/70 bg-surface shadow-card",
      )}
    >
      {gone.length > 0 && (
        <Note className="px-4 pt-3 sm:px-5">
          <span className="inline-flex items-center gap-1.5">
            {say(WORDS.valuesHidden)}
            <MoreText text={withheldReason(gone, rows) || say(WORDS.sulitColumn)} label={say(WORDS.valuesHiddenWhy)} />
          </span>
        </Note>
      )}
      {showTools && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          {toolbarLead}
          {!server && views.length > 0 && (
            <Select
              variant="chip"
              aria-label={say(WORDS.view)}
              searchable={false}
              value={view === "all" ? "" : view}
              onChange={(e) => {
                setView(e.target.value || "all");
                onViewChange?.(e.target.value);
              }}
            >
              <option value="">{say(WORDS.allRecords)}</option>
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          )}

          {searchable && server && (
            <ListSearch server={server} placeholder={searchPlaceholder ?? say(WORDS.searchPlaceholder)} />
          )}
          {searchable && !server && (
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
                placeholder={searchPlaceholder ?? say(WORDS.searchPlaceholder)}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={say(WORDS.searchThisList)}
              />
            </div>
          )}

          {toolbarFilters}
          {(server ? [] : filters).map((f) => (
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
              <option value="">{sayN(WORDS.anyOf, { label: f.label.toLowerCase() })}</option>
              {(optionsFor[f.key] ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          ))}

          <div className="ml-auto flex items-center gap-1.5">
            {server?.exportBlocked ? (
              <span className="inline-flex items-center gap-1">
                <span aria-disabled="true" className={iconButtonClass("sm", true, "size-9 opacity-50")}>
                  <DownloadIcon size={16} />
                </span>
                <MoreText text={server.exportBlocked} label="Why this cannot be exported" />
              </span>
            ) : server?.exportHref ? (
              <a href={server.exportHref} aria-label="Download as Excel" title="An Excel file of every row that matches. SULIT columns are left out." className={iconButtonClass("sm", true, "size-9")}>
                <DownloadIcon size={16} />
              </a>
            ) : (
              exportable && (
            <button
              type="button"
              onClick={exportCsv}
              aria-label={say(leavesOutSulit ? WORDS.downloadCsvLeavesOut : WORDS.downloadCsv)}
              title={say(leavesOutSulit ? WORDS.downloadCsvTitleLeavesOut : WORDS.downloadCsv)}
              className={iconButtonClass("sm", true, "size-9")}
            >
              <DownloadIcon size={16} />
            </button>
              )
            )}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-2 text-[13px] font-semibold text-brand-800 sm:mx-5">
          <span>{sayN(WORDS.nSelected, { count: String(selected.size) })}</span>
          <button
            type="button"
            className="ml-auto rounded-full px-3 py-1 text-[12.5px] hover:bg-brand-100"
            onClick={() => setSelected(new Set())}
          >
            {say(WORDS.clear)}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          size="sm"
          title={server ? (server.q ? say(WORDS.nothingMatches) : (emptyTitle ?? say(WORDS.nothingHere))) : narrowed ? (views.find((v) => v.id === view)?.emptyTitle ?? say(WORDS.nothingMatches)) : (emptyTitle ?? say(WORDS.nothingHere))}
          className={cx(showTools && "border-t border-line")}
          action={
            narrowed ? (
              server ? (
                <ButtonLink href={server.clearHref!} variant="secondary" size="sm">
                  {say(WORDS.showAllRecords)}
                </ButtonLink>
              ) : (
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
                {say(WORDS.showAllRecords)}
              </Button>
              )
            ) : undefined
          }
        />
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
                    aria-label={sayN(WORDS.selectRow, { name: cellText(row.cells[(mobilePrimary ?? columns[0]).key], language) })}
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
                          <dt className="flex items-center gap-1 text-[11.5px] font-semibold text-ink-3">
                            {c.label}
                            {c.sulit && <SulitMark label={c.sulitLabel} />}
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
                      aria-label={say(WORDS.selectAllRows)}
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    aria-sort={
                      shownSort?.key === c.key
                        ? shownSort.dir === "asc"
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
                      <span className={cx("inline-flex items-center gap-1", c.numeric ? "justify-end" : "justify-start")}>
                        {sortableCol(c) ? sortButton(c) : c.label}
                        <SulitMark label={c.sulitLabel} />
                      </span>
                    ) : sortableCol(c) ? (
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
                    <span className={actions ? undefined : "sr-only"}>{say(WORDS.actions)}</span>
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
                        aria-label={sayN(WORDS.selectRow, { name: cellText(row.cells[columns[0].key], language) })}
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

      {server && needsPaging(server.total) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-3 sm:px-5">
          <span className="tabular-nums">
            {server.page * server.size + 1}–{Math.min(server.total, (server.page + 1) * server.size)} of {server.total}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12.5px]">Rows per page</span>
            <nav className="flex items-center gap-1" aria-label="Rows per page">
              {PAGE_SIZES.map((n) => (
                <Link
                  key={n}
                  href={server.sizeHrefs[n]}
                  aria-current={n === server.size ? "true" : undefined}
                  className="grid h-8 min-w-8 place-items-center rounded-full px-2 text-[13px] font-semibold text-ink-2 no-underline hover:bg-ink/5 hover:no-underline aria-[current=true]:bg-brand-700 aria-[current=true]:text-white"
                >
                  {n}
                </Link>
              ))}
            </nav>
          </div>
          <nav className="flex items-center gap-1" aria-label={say(WORDS.pagination)}>
            {server.prevHref ? (
              <Link href={server.prevHref} className={iconButtonClass("sm")} aria-label={say(WORDS.previousPage)}>
                <ChevronRight size={14} className="rotate-180" />
              </Link>
            ) : (
              <span aria-disabled="true" className={iconButtonClass("sm", false, "opacity-40")}>
                <ChevronRight size={14} className="rotate-180" />
              </span>
            )}
            {server.nextHref ? (
              <Link href={server.nextHref} className={iconButtonClass("sm")} aria-label={say(WORDS.nextPage)}>
                <ChevronRight size={14} />
              </Link>
            ) : (
              <span aria-disabled="true" className={iconButtonClass("sm", false, "opacity-40")}>
                <ChevronRight size={14} />
              </span>
            )}
          </nav>
        </div>
      )}
      {showFooter && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-3 sm:px-5">
          <span className="tabular-nums">
            {sayN(WORDS.showing, { from: String(start + 1), to: String(Math.min(start + pageSize, visible.length)), total: String(visible.length) })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12.5px]" aria-hidden="true">{say(WORDS.rows)}</span>
            <Select
              variant="chip"
              aria-label={say(WORDS.rowsPerPage)}
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
            <nav className="flex items-center gap-1" aria-label={say(WORDS.pagination)}>
              <button
                type="button"
                className={iconButtonClass("sm")}
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label={say(WORDS.previousPage)}
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
                aria-label={say(WORDS.nextPage)}
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

/// The server-mode search box: a GET form to the list's own address (name "q"), keeping the hidden inputs. Exported so the Work board draws the same box above its columns.
export function ListSearch({ server, placeholder }: { server: Pick<ServerMode, "action" | "keep" | "q">; placeholder: string }) {
  const say = useSay();
  return (
    <Form action={server.action} className="relative min-w-40 flex-1 sm:max-w-80" role="search">
      {Object.entries(server.keep ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4" />
      <input
        key={server.q ?? ""}
        type="search"
        name="q"
        defaultValue={server.q ?? ""}
        className={cx(smallControl, "w-full pl-9 outline-none placeholder:text-ink-4 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15")}
        placeholder={placeholder}
        aria-label={say(WORDS.searchThisList)}
      />
    </Form>
  );
}

/// The "select" cell: an inline choice that calls the caller's action. It shows the pick at once and reverts, saying the refusal, if the action refuses or throws.
function SelectCell({ cell }: { cell: Extract<Cell, { kind: "select" }> }) {
  const [value, setValue] = useState(cell.value);
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [seen, setSeen] = useState(cell.value);
  if (seen !== cell.value) {
    setSeen(cell.value);
    setValue(cell.value);
  }
  if (cell.disabledWhy) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{cell.options.find((o) => o.value === cell.value)?.label ?? dash}</span>
        <MoreText text={cell.disabledWhy} label={`Who can change ${cell.label.toLowerCase()}`} />
      </span>
    );
  }
  return (
    <div className="min-w-0">
      <Select
        variant="chip"
        aria-label={cell.label}
        searchable={false}
        disabled={pending}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          const before = value;
          setValue(next);
          setRefused(null);
          const data = new FormData();
          for (const [k, v] of Object.entries(cell.fields)) data.set(k, v);
          data.set(cell.name, next);
          start(async () => {
            try {
              const r = await cell.action(data);
              if (r?.refused) {
                setValue(before);
                setRefused(r.refused);
              }
            } catch {
              setValue(before);
              setRefused("That did not save. Try again.");
            }
          });
        }}
      >
        {cell.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {refused && (
        <div role="alert" className="mt-1 break-words text-[12.5px] text-rose-700">
          {refused}
        </div>
      )}
    </div>
  );
}

/// The "open" cell (AC-47). The act is the caller's: this piece only calls the action it was handed, on a press, so a prefetch or a render never runs it, and it opens no drawer and
/// records nothing itself. A server action that redirects rejects its promise with the redirect, which the router follows.
function OpenCell({ cell, line }: { cell: Extract<Cell, { kind: "open" }>; line: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-disabled={pending || undefined}
        onClick={() => {
          if (pending) return;
          const data = new FormData();
          for (const [name, value] of Object.entries(cell.fields)) data.set(name, value);
          start(async () => {
            await cell.action(data);
          });
        }}
        className={cx("block cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-brand-700 hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500", line)}
      >
        {cell.text}
      </button>
      {cell.sub && <div className="break-words text-[12.5px] text-ink-3">{cell.sub}</div>}
    </div>
  );
}
