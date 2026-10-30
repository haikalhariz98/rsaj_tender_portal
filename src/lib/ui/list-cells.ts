import type { Language } from "@/lib/i18n/language";
import { provenanceLabel } from "@/components/ui/provenance";
import { listToCsv } from "@/lib/csv-cell";
import { senToDecimalString } from "@/lib/money";

/**
 * A list's cells as data, and their plain text (plan step 7 §2). Moved out of the client-only `data-list.tsx` so a server route (a
 * list's export) builds and reads rows with the same types and the same text as the screen. Pure. `data-list.tsx` re-exports the
 * types and functions for its existing importers.
 */

export interface StatusItem {
  text: string;
  tone?: "ok" | "warn" | "err" | "info" | "brand";
  provenance?: "STATED" | "OBSERVED" | "ASSUMED";
}

export type Cell =
  | { kind: "stack"; title: string; sub?: string; monoSub?: boolean }
  | { kind: "text"; text: string; dim?: boolean }
  | { kind: "money"; value: number | null; sen?: never }
  /// Money in sen, as an integer's decimal string (a bigint does not travel to the client as a cell): shown and sorted
  /// exactly, never through a float (run 3 residual C3). Prefer it for new columns.
  | { kind: "money"; sen: string | null; value?: never }
  | { kind: "badge"; text: string; tone?: "ok" | "warn" | "err" | "info" | "brand" }
  | { kind: "chip"; text: string; tone?: "ok" | "warn" | "err" | "info" | "brand" }
  | { kind: "person"; name: string; sub?: string }
  | { kind: "link"; text: string; href: string; /** The link's accessible name where `text` alone repeats down the column ("Reply" on every row). */ label?: string; sub?: string; /** `false`: following it keeps the scroll position (a link that opens a panel beside the list). */ scroll?: false }
  /// A link that is an act: a button that calls a server action with `fields`, which does its work and then redirects (the inbox's notice, AC-47). Not an anchor, so a prefetch never runs it.
  | { kind: "open"; text: string; action: (data: FormData) => Promise<void>; fields: Record<string, string>; sub?: string }
  /// A file to save: a plain anchor with the `download` attribute (never a client-side Link, which could prefetch it and write a log row for a download nobody made).
  | { kind: "download"; text: string; href: string; label: string; sub?: string }
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
  /// One status chip with a muted "+N" beside it when the row has others; hovering or focusing either lists them all (founder, 2026-10-20: one status per row).
  /// Search and the CSV carry every status, the main one first.
  | { kind: "status"; main: StatusItem; others: StatusItem[] }
  /// A filled bar with the figure beside it, and a marker at the configured warning
  /// threshold. Null percent renders as not set — a code with no allocation has not
  /// used none of its budget, and a bar drawn at zero says it has.
  | { kind: "meter"; percent: number | null; threshold: number | null }
  /// A SULIT value the reader is not entitled to (Phase 3a, `Sulit<T>`): "SULIT · withheld", with the reason in words. It carries no value, so
  /// there is nothing to search, sort or export. Give the row no sort key for the column, or the order would give the value away.
  | { kind: "withheld"; words: string }
  /// An inline choice that is an act: picking calls the server action with `fields` plus `name` = the chosen value. The action returns `{ refused }` (the words) to
  /// refuse, and the cell reverts and says them. With `disabledWhy` the choice is read only: the current label shows, with who can change it in a popover.
  | { kind: "select"; name: string; value: string; options: { value: string; label: string }[]; label: string; action: (data: FormData) => Promise<{ refused?: string } | void>; fields: Record<string, string>; disabledWhy?: string; /** Default: the Select's own rule (a search box above seven options). */ searchable?: boolean; /** A warn chip shown under the choice while it holds this value (a state of the choice, not a refusal). */ flag?: { value: string; text: string }; /** Picking `when` asks this question first and posts only on the confirming answer (a pick that cannot be taken back). */ confirm?: { when: string; question: string; words?: string; confirmLabel: string; cancelLabel: string } };

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
  /// The column shows a SULIT figure, judged for the reader cell by cell (a `Sulit` made a cell by `sulitCell`): its header
  /// carries the SULIT lock, and the list offers no export of it in any form. Search, filters
  /// and sort stay. Files that must leave are built on the server and recorded, never
  /// downloaded from a list (NFR-SEC-002, NFR-AUD-004). The registry of fields that
  /// require this flag is `src/lib/sulit-fields.ts`; a test scans the screens for it.
  sulit?: boolean;
  /// What the column's lock says where the default (`SULIT_COLUMN_WORDS`) is not the whole truth of the column: who sees it, in the column's own words.
  sulitLabel?: string;
}

/// The columns a CSV download carries: every column but a SULIT one, so a classified figure never
/// leaves in a file (the SULIT guard). Founder, 2026-10-04: a list with a SULIT column downloads
/// its other columns, rather than offering no download at all.
export function exportColumns(columns: readonly Column[]): Column[] {
  return columns.filter((c) => !c.sulit);
}

/// Whether a list may offer a client export: when at least one column is not SULIT.
export function canExport(columns: readonly Column[]): boolean {
  return exportColumns(columns).length > 0;
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
  /// A sentence about the row that needs the row's full width — why an action beside it is
  /// disabled, say. Shown under the row, never squeezed into the actions column.
  note?: string;
}

/// A cell as plain text, for search, sort and the export. A withheld SULIT cell is empty: it carries no value.
export function cellText(cell: Cell | undefined, lang: Language = "en"): string {
  if (!cell) return "";
  switch (cell.kind) {
    case "stack":
      return cell.sub ? `${cell.title} ${cell.sub}` : cell.title;
    case "text":
    case "badge":
    case "chip":
      return cell.text;
    case "money":
      if (cell.sen !== undefined) return cell.sen == null ? "" : senToDecimalString(BigInt(cell.sen));
      return cell.value == null ? "" : String(cell.value);
    case "person":
      return cell.name;
    case "link":
    case "open":
      return cell.text;
    case "download":
      return cell.sub ?? cell.text;
    case "avatars":
      return cell.names.join(" ");
    case "badges":
      return cell.items.join(" ");
    case "chips":
      return cell.items.map((i) => (i.provenance ? `${i.text} (${provenanceLabel(i.provenance, lang)})` : i.text)).join(" · ");
    case "status":
      return [cell.main, ...cell.others].map((i) => (i.provenance ? `${i.text} (${provenanceLabel(i.provenance, lang)})` : i.text)).join(" · ");
    case "meter":
      return cell.percent == null ? "" : `${cell.percent}%`;
    case "withheld":
      return "";
    case "select":
      return cell.options.find((o) => o.value === cell.value)?.label ?? "";
  }
}

/// A UTF-8 byte-order mark: without it Excel reads a CSV as the local code page and garbles non-ASCII names (ST-9).
export const CSV_BOM = "\uFEFF";

/// An in-card list's client CSV: the byte-order mark, then the export columns (never a SULIT one) of the rows, guarded and quoted.
export function listCsv(columns: readonly Column[], rows: readonly Row[], lang: Language = "en"): string {
  const cols = exportColumns(columns);
  return CSV_BOM + listToCsv(cols.map((c) => c.label), rows.map((r) => cols.map((c) => cellText(r.cells[c.key], lang))));
}
