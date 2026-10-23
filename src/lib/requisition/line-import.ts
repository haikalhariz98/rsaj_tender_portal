/**
 * Line items from a filled-in template (.xlsx or .csv). Pure: rows of text in, lines and
 * problems out. The route handler reads the file into rows; this decides what they mean.
 *
 * Amounts are decimal strings and are never held as floats: a figure is read with
 * `parseSen`, and a missing amount is worked out with `lineAmount`, the one rule the form
 * and the server share. Nothing here saves anything: the form shows the lines, and the
 * server's own validation still runs when the officer saves.
 */

import { lineAmount } from "@/lib/requisition/lines";
import { parseSen, senToDecimalString } from "@/lib/money";

/// The most lines one upload may carry.
export const MAX_IMPORT_LINES = 500;

export type Words = { en: string;  };

export interface ImportedLine {
  description: string;
  quantity: string;
  unit: string;
  /// "1234.50", or "" where the file gave none.
  estimatedUnitPrice: string;
  /// "1234.50": as typed, or worked out from quantity × unit price. Never "".
  estimatedAmount: string;
}

export interface ImportProblem {
  /// The spreadsheet row, as Excel numbers it (1 is the first row), or null for the file as a whole.
  row: number | null;
  text: Words;
}

export interface ImportResult {
  lines: ImportedLine[];
  problems: ImportProblem[];
}

type Column = "description" | "quantity" | "unit" | "unitPrice" | "amount";

/// What a header may be called: lower case, letters and digits only, a trailing "rm" dropped.
/// English and Malay, so a template filled in either language reads.
const HEADERS: Record<string, Column> = {
  description: "description",
  item: "description",
  itemdescription: "description",
  perihal: "description",
  keterangan: "description",
  quantity: "quantity",
  qty: "quantity",
  kuantiti: "quantity",
  unit: "unit",
  uom: "unit",
  unitofmeasure: "unit",
  unitprice: "unitPrice",
  priceperunit: "unitPrice",
  price: "unitPrice",
  hargaseunit: "unitPrice",
  hargaunit: "unitPrice",
  amount: "amount",
  total: "amount",
  lineamount: "amount",
  jumlah: "amount",
};

export function headerKey(cell: string): Column | null {
  const key = cell.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/rm$/, "");
  return HEADERS[key] ?? null;
}

/// How far down the file the header row may be (the template has a note above it).
const HEADER_SEARCH_ROWS = 10;

const blank = (row: string[]) => row.every((c) => c.trim() === "");

/**
 * A spreadsheet cell as text. Numbers keep their shortest exact spelling; dates, errors and
 * objects that are not text read as empty rather than as something nobody typed.
 */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? plainNumber(value) : "";
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value instanceof Date) return "";
  if (typeof value === "object") {
    const v = value as { richText?: { text: string }[]; text?: unknown; result?: unknown; error?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.error !== undefined) return "";
    if (v.result !== undefined) return cellText(v.result); // a formula: its last result
    if (v.text !== undefined) return cellText(v.text); // a hyperlink
  }
  return "";
}

/// A number written out without an exponent, so 0.0000001 does not become "1e-7".
function plainNumber(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(10).replace(/\.?0+$/, "");
}

/// An amount as typed: "1,234.50", "1234.5", "RM 1,234.50". Sen, or null where it is not one.
function amountSen(text: string): bigint | null {
  const t = text.trim().replace(/^rm\s*/i, "");
  if (!/^\d[\d,]*(\.\d*)?$|^\.\d+$/.test(t)) return null;
  try {
    const sen = parseSen(t.startsWith(".") ? `0${t}` : t.endsWith(".") ? t.slice(0, -1) : t);
    return sen < 0n ? null : sen;
  } catch {
    return null;
  }
}

const problem = (row: number | null, en: string): ImportProblem => ({ row, text: { en: row == null ? en : `Row ${row}: ${en}` } });

/// Why a money cell is refused: too many decimals, or not a figure at all.
const figureProblem = (row: number, text: string, en: string): ImportProblem =>
  /^(rm\s*)?\d[\d,]*\.\d{3,}$/i.test(text.trim())
    ? problem(row, `${en} has more than two decimal places.`)
    : problem(row, `${en} is not a figure.`);

/**
 * Read the rows of an uploaded file. The header row is the first of the top few that names a
 * Description column; whatever is above it (the template's note) is ignored. A row with a
 * problem is left out and reported, in words, with its row number; the others still come
 * through.
 */
export function importLines(rows: string[][]): ImportResult {
  const problems: ImportProblem[] = [];
  const headerAt = rows.slice(0, HEADER_SEARCH_ROWS).findIndex((r) => r.some((c) => headerKey(c) === "description"));
  if (headerAt < 0) {
    return {
      lines: [],
      problems: [
        problem(
          null,
          "No header row was found. The file needs a row naming the columns Description, Quantity, Unit, Unit price and Amount. Download the template to start from.",
        ),
      ],
    };
  }
  const at: Partial<Record<Column, number>> = {};
  rows[headerAt].forEach((c, i) => {
    const k = headerKey(c);
    if (k && at[k] === undefined) at[k] = i;
  });
  if (at.amount === undefined && (at.quantity === undefined || at.unitPrice === undefined)) {
    return {
      lines: [],
      problems: [
        problem(
          headerAt + 1,
          "the columns do not give an amount. Add an Amount column, or both Quantity and Unit price.",
        ),
      ],
    };
  }
  const get = (row: string[], k: Column) => (at[k] === undefined ? "" : (row[at[k]!] ?? "").trim());

  const lines: ImportedLine[] = [];
  let capped = false;
  for (let i = headerAt + 1; i < rows.length; i++) {
    const row = rows[i];
    if (blank(row)) continue;
    const n = i + 1;
    const description = get(row, "description");
    // A totals row some people add under the lines is not a line.
    if (/^total$|^jumlah$/i.test(description) && !get(row, "quantity") && !get(row, "unitPrice")) continue;
    if (lines.length >= MAX_IMPORT_LINES) {
      capped = true;
      break;
    }

    const bad: ImportProblem[] = [];
    if (!description) bad.push(problem(n, "the description is empty."));

    const quantityText = get(row, "quantity").replace(/,/g, "");
    if (quantityText && !/^\d+(\.\d{1,3})?$/.test(quantityText)) {
      bad.push(
        /^\d+\.\d{4,}$/.test(quantityText)
          ? problem(n, "the quantity has more than three decimal places.")
          : problem(n, "the quantity is not a figure."),
      );
    }

    const priceText = get(row, "unitPrice");
    const price = priceText ? amountSen(priceText) : null;
    if (priceText && price == null) bad.push(figureProblem(n, priceText, "the unit price"));

    const amountText = get(row, "amount");
    let amount = amountText ? amountSen(amountText) : null;
    if (amountText && amount == null) bad.push(figureProblem(n, amountText, "the amount"));

    const unitPrice = price == null ? "" : senToDecimalString(price);
    if (bad.length === 0 && amount == null) {
      const worked = lineAmount(quantityText, unitPrice);
      if (worked == null) {
        bad.push(problem(n, "there is no amount, and no quantity and unit price to work one out from."));
      } else amount = worked;
    }

    if (bad.length > 0) {
      problems.push(...bad);
      continue;
    }
    lines.push({ description, quantity: quantityText, unit: get(row, "unit"), estimatedUnitPrice: unitPrice, estimatedAmount: senToDecimalString(amount!) });
  }
  if (capped) {
    problems.push(
      problem(
        null,
        `Only the first ${MAX_IMPORT_LINES} lines were read. A requisition holds at most ${MAX_IMPORT_LINES} lines: split the rest into another requisition.`,
      ),
    );
  }
  if (lines.length === 0 && problems.length === 0) {
    problems.push(problem(null, "The file has no lines below the header row."));
  }
  return { lines, problems };
}

/**
 * Comma-separated text as rows. Quotes may hold commas, line breaks and doubled quotes;
 * a leading byte order mark (Excel's "CSV UTF-8") is dropped; CRLF, LF and CR all end a row.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let started = false; // anything seen on this row, so a lone final newline adds no row
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") {
      quoted = true;
      started = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
      started = true;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      started = false;
    } else {
      cell += c;
      started = true;
    }
  }
  if (started || cell !== "") {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export { csvCell } from "@/lib/csv-cell";
