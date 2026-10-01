/**
 * A bill of quantities as CSV (FR-EST-001, OD-5: CSV only, no new dependency). Pure.
 *
 * Import: the officer's file is decoded (`decodeCsv`, UTF-8 only, a byte-order mark
 * allowed), split into records (`parseCsv`, RFC 4180: quoted fields, doubled quotes, line
 * breaks inside quotes, CRLF or LF), then read as a bill (`parseBqCsv`). Nothing is
 * guessed: a quantity is a decimal to three places at most (`isQuantity`), a rate an amount
 * to the sen (`parseSen`, which refuses a third decimal rather than round it), and a line's
 * amount is never taken from the file. An Amount column is read only to be compared with
 * what the domain layer works out (`keyedMismatch`) and is then ignored.
 *
 * Export (`bqToCsv`): built on the server from a frozen or draft version, priced or
 * unpriced (OD-8: the unpriced bill has no Rate or Amount column at all). It carries the
 * bill's lines and nothing else: never a company-estimate figure, never an exercise value
 * (the SULIT guard). A cell that a spreadsheet would read as a formula is written with a
 * leading apostrophe, and the import takes that apostrophe off again, so a round trip
 * gives back what was exported.
 */

import { MoneyFormatError, parseSen, senToDecimalString, type Sen } from "@/lib/money";

import { bqTotals, isQuantity, itemAmount, keyedMismatch, lineSizeFaults, unpricedBq, type FrozenBq } from "./bq";
import type { BqItemKind, BqLine, Finding } from "./types";

// ------------------------------------------------------------------ records

export type CsvFault = "NOT_UTF8" | "EMPTY_FILE" | "UNTERMINATED_QUOTE" | "STRAY_QUOTE";

/// The file's text, from its bytes. UTF-8 only: anything else is refused, never re-read in another encoding.
export function decodeCsv(bytes: Uint8Array): { text: string } | { fault: Finding<CsvFault> } {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { fault: { code: "NOT_UTF8", level: "block" } };
  }
  return { text: text.replace(/^﻿/, "") };
}

/**
 * Records and their first physical line. A quote may open a field and close it; inside, a
 * doubled quote is one quote and a line break is part of the field. A quote anywhere else
 * in an unquoted field, or text straight after a closing quote, is refused with its line.
 */
export function parseCsv(text: string): { records: { line: number; cells: string[] }[]; faults: (Finding<CsvFault> & { line: number })[] } {
  const src = text.replace(/^﻿/, "");
  const records: { line: number; cells: string[] }[] = [];
  const faults: (Finding<CsvFault> & { line: number })[] = [];
  let line = 1;
  let i = 0;
  while (i < src.length) {
    const start = line;
    const cells: string[] = [];
    let cell = "";
    let ended = false;
    let broken = false;
    while (!ended) {
      if (i < src.length && src[i] === '"') {
        // A quoted field.
        i++;
        let closed = false;
        while (i < src.length) {
          const c = src[i];
          if (c === '"') {
            if (src[i + 1] === '"') {
              cell += '"';
              i += 2;
              continue;
            }
            i++;
            closed = true;
            break;
          }
          if (c === "\n") line++;
          cell += c;
          i++;
        }
        if (!closed) {
          faults.push({ code: "UNTERMINATED_QUOTE", level: "block", line: start });
          return { records, faults };
        }
        if (i < src.length && src[i] !== "," && src[i] !== "\n" && src[i] !== "\r") {
          if (!broken) faults.push({ code: "STRAY_QUOTE", level: "block", line });
          broken = true;
          while (i < src.length && src[i] !== "," && src[i] !== "\n" && src[i] !== "\r") i++;
        }
      } else {
        while (i < src.length && src[i] !== "," && src[i] !== "\n" && src[i] !== "\r") {
          if (src[i] === '"' && !broken) {
            faults.push({ code: "STRAY_QUOTE", level: "block", line });
            broken = true;
          }
          cell += src[i];
          i++;
        }
      }
      cells.push(cell);
      cell = "";
      if (i >= src.length) ended = true;
      else if (src[i] === ",") i++;
      else {
        // CRLF, LF or a lone CR ends the record.
        if (src[i] === "\r" && src[i + 1] === "\n") i++;
        i++;
        line++;
        ended = true;
      }
    }
    // A blank line is not a record.
    if (!(cells.length === 1 && cells[0].trim() === "")) records.push({ line: start, cells });
  }
  return { records, faults };
}

// ------------------------------------------------------------------ the bill's columns

/// The columns, in the order an export writes them. Headers are matched without regard to case or spacing.
export const BQ_CSV_COLUMNS = ["Section", "Section title", "Item", "Description", "Unit", "Kind", "Quantity", "Rate", "Amount", "Provisional"] as const;
export type BqCsvColumn = (typeof BQ_CSV_COLUMNS)[number];
const REQUIRED: readonly BqCsvColumn[] = ["Section", "Description", "Quantity"];

/**
 * The longest text each column takes: the same limits as the bill's editor (saveBqSection,
 * saveBqItem), so an imported line could have been typed.
 */
export const BQ_CSV_TEXT_MAX: Readonly<Partial<Record<BqCsvColumn, number>>> = { Section: 20, "Section title": 300, Item: 40, Description: 4000, Unit: 40 };

/**
 * The most lines one import takes. A platform limit, not policy: every line is written
 * and audited in one transaction under the exercise's lock, and that transaction has a
 * time limit. A longer bill is refused before anything is stored, naming the limit.
 */
export const BQ_CSV_MAX_LINES = 2000;
const UNPRICED_COLUMNS: readonly BqCsvColumn[] = BQ_CSV_COLUMNS.filter((c) => c !== "Rate" && c !== "Amount");

/// How each kind is written in a file, and what is read as it (labels, never the stored code alone).
export const KIND_IN_FILE: Readonly<Record<BqItemKind, string>> = { MEASURED: "Measured work", PRIME_COST_SUM: "Prime cost sum", PROVISIONAL_SUM: "Provisional sum" };
const KIND_READ: Readonly<Record<string, BqItemKind>> = {
  "measured work": "MEASURED",
  measured: "MEASURED",
  "prime cost sum": "PRIME_COST_SUM",
  "pc sum": "PRIME_COST_SUM",
  "provisional sum": "PROVISIONAL_SUM",
  "ps": "PROVISIONAL_SUM",
};
const YES = new Set(["yes", "y", "true", "1"]);
const NO = new Set(["no", "n", "false", "0", ""]);

export type BqCsvFault =
  | CsvFault
  | "NO_HEADER"
  | "COLUMN_MISSING"
  | "COLUMN_REPEATED"
  | "COLUMN_UNKNOWN"
  | "NO_LINES"
  | "WRONG_CELL_COUNT"
  | "SECTION_REQUIRED"
  | "SECTION_TITLE_DIFFERS"
  | "DESCRIPTION_REQUIRED"
  | "KIND_UNKNOWN"
  | "QUANTITY_INVALID"
  | "RATE_INVALID"
  | "TOO_LARGE"
  | "TEXT_TOO_LONG"
  | "TOO_MANY_LINES"
  | "FORMULA_LIKE_CELL"
  | "AMOUNT_INVALID"
  | "PROVISIONAL_UNKNOWN"
  | "PROVISIONAL_NOT_MEASURED";

export interface BqCsvSection {
  number: string;
  title: string;
  items: BqLine[];
}

export interface ParsedBqCsv {
  sections: BqCsvSection[];
  /// Every problem with its line. A block refuses the whole file; nothing is half-imported.
  faults: (Finding<BqCsvFault> & { line: number })[];
  /// A typed Amount that differs from quantity × rate: reported, then ignored.
  keyedMismatches: { line: number; keyed: Sen; computed: Sen | null }[];
  /// Whether the file carried a Rate column (an unpriced bill does not).
  priced: boolean;
  lineCount: number;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");
/// A cell written with a leading apostrophe to stop a spreadsheet reading it as a formula: the apostrophe is the export's, not the text's.
const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

/**
 * Read a bill from CSV text. Sections are grouped by their number, in the order they first
 * appear; a section's title is given on any of its rows and must not differ between them.
 * Blank Kind is measured work; blank Provisional is no. A rate left blank is allowed (an
 * unpriced bill); the line then has no amount until it is priced.
 */
export function parseBqCsv(text: string): ParsedBqCsv {
  const { records, faults: csvFaults } = parseCsv(text);
  const faults: ParsedBqCsv["faults"] = [...csvFaults];
  const keyedMismatches: ParsedBqCsv["keyedMismatches"] = [];
  const empty = (priced = false): ParsedBqCsv => ({ sections: [], faults, keyedMismatches, priced, lineCount: 0 });
  if (faults.length) return empty();
  if (records.length === 0) {
    faults.push({ code: "EMPTY_FILE", level: "block", line: 1 });
    return empty();
  }
  const header = records[0];
  const index = new Map<BqCsvColumn, number>();
  header.cells.forEach((h, at) => {
    const col = BQ_CSV_COLUMNS.find((c) => norm(c) === norm(h));
    if (!col) {
      if (h.trim()) faults.push({ code: "COLUMN_UNKNOWN", level: "warn", line: header.line, data: { column: h.trim() } });
      return;
    }
    if (index.has(col)) faults.push({ code: "COLUMN_REPEATED", level: "block", line: header.line, data: { column: col } });
    else index.set(col, at);
  });
  if (index.size === 0) {
    faults.push({ code: "NO_HEADER", level: "block", line: header.line });
    return empty();
  }
  for (const c of REQUIRED) if (!index.has(c)) faults.push({ code: "COLUMN_MISSING", level: "block", line: header.line, data: { column: c } });
  if (faults.some((f) => f.level === "block")) return empty(index.has("Rate"));

  const priced = index.has("Rate");
  const get = (cells: string[], c: BqCsvColumn) => (index.has(c) ? unguard(cells[index.get(c)!] ?? "").trim() : "");
  const sections: BqCsvSection[] = [];
  const titleLine = new Map<string, number>();
  let lineCount = 0;
  for (const r of records.slice(1)) {
    const at = r.line;
    if (r.cells.every((c) => !c.trim())) continue;
    lineCount++;
    if (r.cells.length !== header.cells.length) {
      faults.push({ code: "WRONG_CELL_COUNT", level: "block", line: at, data: { expected: header.cells.length, found: r.cells.length } });
      continue;
    }
    const number = get(r.cells, "Section");
    const title = get(r.cells, "Section title");
    const description = get(r.cells, "Description");
    const kindText = get(r.cells, "Kind");
    const qty = get(r.cells, "Quantity").replace(/,/g, "");
    const rateText = get(r.cells, "Rate");
    const amountText = get(r.cells, "Amount");
    const provText = get(r.cells, "Provisional").toLowerCase();
    // A cell a spreadsheet could read as a formula (not one the export guarded with an
    // apostrophe): imported as text, and said, so the officer knows the file holds one. The
    // stored file is evidence and is kept exactly as received.
    const formulaLike = BQ_CSV_COLUMNS.filter((c) => index.has(c) && /^[=+\-@]/.test((r.cells[index.get(c)!] ?? "").trimStart()));
    if (formulaLike.length) faults.push({ code: "FORMULA_LIKE_CELL", level: "warn", line: at, data: { columns: formulaLike.join(", ") } });
    for (const [column, max] of Object.entries(BQ_CSV_TEXT_MAX) as [BqCsvColumn, number][]) {
      if (get(r.cells, column).length > max) faults.push({ code: "TEXT_TOO_LONG", level: "block", line: at, data: { column, max } });
    }
    if (!number) faults.push({ code: "SECTION_REQUIRED", level: "block", line: at });
    if (!description) faults.push({ code: "DESCRIPTION_REQUIRED", level: "block", line: at });
    const kind: BqItemKind | undefined = kindText ? KIND_READ[norm(kindText)] : "MEASURED";
    if (!kind) faults.push({ code: "KIND_UNKNOWN", level: "block", line: at, data: { kind: kindText } });
    const quantity = qty === "" ? null : isQuantity(qty) ? qty : undefined;
    if (quantity === undefined) faults.push({ code: "QUANTITY_INVALID", level: "block", line: at, data: { quantity: qty } });
    let rate: Sen | null = null;
    if (rateText) {
      try {
        rate = parseSen(rateText);
        if (rate < 0n) throw new MoneyFormatError(rateText);
      } catch {
        faults.push({ code: "RATE_INVALID", level: "block", line: at, data: { rate: rateText } });
        rate = null;
      }
    }
    const provisional = YES.has(provText) ? true : NO.has(provText) ? false : undefined;
    if (provisional === undefined) faults.push({ code: "PROVISIONAL_UNKNOWN", level: "block", line: at, data: { provisional: provText } });
    if (provisional && kind && kind !== "MEASURED") faults.push({ code: "PROVISIONAL_NOT_MEASURED", level: "block", line: at });
    if (amountText) {
      try {
        const keyed = parseSen(amountText);
        const m = keyedMismatch(keyed, itemAmount(quantity ?? null, rate));
        if (m) keyedMismatches.push({ line: at, ...m });
      } catch {
        faults.push({ code: "AMOUNT_INVALID", level: "warn", line: at, data: { amount: amountText } });
      }
    }
    // Each figure, and quantity × rate, must fit the column it is stored in.
    for (const f of lineSizeFaults(quantity ?? null, rate)) faults.push({ code: "TOO_LARGE", level: "block", line: at, data: { field: f.field } });
    if (!number) continue;
    let s = sections.find((x) => x.number === number);
    if (!s) {
      s = { number, title, items: [] };
      sections.push(s);
      if (title) titleLine.set(number, at);
    } else if (title) {
      if (!s.title) {
        s.title = title;
        titleLine.set(number, at);
      } else if (s.title !== title) faults.push({ code: "SECTION_TITLE_DIFFERS", level: "block", line: at, data: { section: number, first: titleLine.get(number) ?? null } });
    }
    s.items.push({ itemRef: get(r.cells, "Item"), description, unit: get(r.cells, "Unit"), kind: kind ?? "MEASURED", quantity: quantity ?? null, rate, provisional: !!provisional });
  }
  if (lineCount === 0) faults.push({ code: "NO_LINES", level: "block", line: header.line });
  if (lineCount > BQ_CSV_MAX_LINES) faults.push({ code: "TOO_MANY_LINES", level: "block", line: header.line, data: { lines: lineCount, max: BQ_CSV_MAX_LINES } });
  // A section with no title of its own reads as its number.
  for (const s of sections) if (!s.title) s.title = `Section ${s.number}`;
  return { sections, faults, keyedMismatches, priced, lineCount };
}

/// What an import would add, for the officer to see before it is saved: lines and the bill's total from them.
export function importSummary(p: ParsedBqCsv) {
  const lines = p.sections.flatMap((s) => s.items);
  const t = bqTotals(lines, null);
  return { sections: p.sections.length, lines: lines.length, priced: p.priced, total: t.total, incompleteLines: t.incompleteLines };
}

/// Why the import's button is off, judged in the browser with the order the server judges in
/// (a file it refuses first, then a draft that has lines and no Replace), so the officer is
/// told before sending anything. Null: nothing stands in the way, or no file is chosen yet (the
/// file field says that itself).
export type ImportBlock = "FILE_REFUSED" | "NEEDS_REPLACE";
export function importBlock(parsed: ParsedBqCsv | null, ctx: { draftLines: number; replace: boolean }): ImportBlock | null {
  if (!parsed) return null;
  if (parsed.faults.some((f) => f.level === "block")) return "FILE_REFUSED";
  if (ctx.draftLines > 0 && !ctx.replace) return "NEEDS_REPLACE";
  return null;
}

// ------------------------------------------------------------------ export

/// A cell as written: quoted where it holds a comma, quote or line break; a formula-looking start guarded.
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * The bill as CSV, with a byte-order mark so a spreadsheet reads it as UTF-8, CRLF line
 * ends, one row per line. `priced: false` writes the unpriced bill (OD-8): `unpricedBq`
 * strips every rate and amount, and the Rate and Amount columns are not written at all.
 * Takes the bill's own lines only, so nothing else can reach the file.
 */
export function bqToCsv(frozen: FrozenBq, opts: { priced: boolean }): string {
  const rows: string[][] = [];
  if (opts.priced) {
    rows.push([...BQ_CSV_COLUMNS]);
    for (const s of frozen.sections) {
      for (const i of s.items) {
        const amount = itemAmount(i.quantity, i.rate);
        rows.push([s.number, s.title, i.itemRef, i.description, i.unit, KIND_IN_FILE[i.kind], i.quantity ?? "", i.rate == null ? "" : senToDecimalString(i.rate), amount == null ? "" : senToDecimalString(amount), i.provisional ? "Yes" : "No"]);
      }
    }
  } else {
    rows.push([...UNPRICED_COLUMNS]);
    for (const s of unpricedBq(frozen).sections) {
      for (const i of s.items) rows.push([s.number, s.title, i.itemRef, i.description, i.unit, KIND_IN_FILE[i.kind], i.quantity ?? "", i.provisional ? "Yes" : "No"]);
    }
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Whether the browser saves the file an export returned: once per export the server
 * recorded, keyed on that request's own id, never on the file's digest — two exports of the
 * same bill are two audited exports with the same digest, and each is saved.
 */
export function exportToSave(result: { ok: boolean; file?: string; fileName?: string; exportId?: string }, lastSavedId: string | null): boolean {
  return result.ok && !!result.file && !!result.fileName && !!result.exportId && result.exportId !== lastSavedId;
}

/// The file's name: the exercise's reference and the version, never an id.
export function bqCsvFilename(exerciseReference: string, versionNo: number, priced: boolean): string {
  const ref = exerciseReference.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exercise";
  return `${ref}-bill-v${versionNo}-${priced ? "priced" : "unpriced"}.csv`;
}
