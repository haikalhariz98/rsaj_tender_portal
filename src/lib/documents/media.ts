/**
 * What a file is, decided by its own bytes (NFR-SEC-007).
 *
 * The client's name and declared type are never trusted for what is stored: the type
 * kept is the sniffed one. They are still compared, and a file whose bytes disagree
 * with its name or declared type is refused naming both — a PDF called `.png` is either
 * a mistake or a disguise, and neither is filed.
 */

import { isKnownMediaType, type Finding, type KnownMediaType, type StorePolicy } from "./types";

/// What a file's opening bytes say it is. A ZIP, HTML and SVG are recognised only to be refused (a ZIP that is a workbook or a Word document is told apart by `ooxmlTypeOf`, from its end).
export type Sniffed = KnownMediaType | "application/zip" | "text/html" | "image/svg+xml" | null;

/// How many opening bytes `sniffMediaType` looks at.
export const SNIFF_BYTES = 512;

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);

export function sniffMediaType(head: Uint8Array): Sniffed {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]) || startsWith(head, [0x50, 0x4b, 0x07, 0x08])) return "application/zip";
  // Markup, after any byte-order mark and white space.
  const text = new TextDecoder("utf-8", { fatal: false }).decode(head.subarray(0, SNIFF_BYTES)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return "image/svg+xml";
  if (/^<(!doctype html|html|head|body|script|iframe|a\s|div|p>|meta|title|style|!--)/.test(text)) return "text/html";
  if (looksLikeCsv(head)) return "text/csv";
  return null;
}

/**
 * CSV has no signature, so it is told by what it is not (6.2 Q-3): the opening bytes are
 * valid UTF-8 (a character cut off at the end of the window is not held against it), carry
 * no control character other than tab, carriage return and line feed, and the first line
 * holds a comma, the delimiter. Plain prose with no comma on its first line is not a CSV.
 * Judged after the markup checks, so a page of HTML named `.csv` is still refused as markup.
 *
 * Invariant this relies on: a stored file is only ever served by the document download
 * route (`src/app/api/documents/versions/[id]/route.ts`), as an attachment (never inline,
 * `dispositionFilename`), with the stored type and `X-Content-Type-Options: nosniff`.
 * These tests are loose by design — text with a comma on its first line passes — so a
 * file accepted as CSV may still hold markup or script further down. It is safe only
 * because no browser renders it: it is saved, not shown, and not re-sniffed. Serving a
 * stored document inline, or without `nosniff`, would break that; any new route that
 * serves stored bytes must keep both. (The organisation logo route is inline, and takes
 * only the images `src/lib/organisation/logo.ts` decodes, never a stored document.)
 */
function looksLikeCsv(head: Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: true });
  } catch {
    return false;
  }
  text = text.replace(/^\uFEFF/, "");
  if (!text.trim()) return false;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return false;
  const firstLine = text.split(/\r?\n/, 1)[0];
  return firstLine.includes(",");
}


// ------------------------------------------------------------------ Office files (SR-09, SR-11)

/// The two Office Open XML types the product tells apart from a ZIP by what the archive holds. Macro-enabled files (.xlsm, .docm) are neither: they are refused as an archive.
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/// How many closing bytes of a ZIP file `ooxmlTypeOf` needs: its end record and its central directory, which names every entry. A workbook or document has a few dozen.
export const ARCHIVE_TAIL_BYTES = 256 * 1024;

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/**
 * What a ZIP file is, told from the names its central directory lists (NFR-SEC-007). A ZIP signature alone cannot tell a workbook from any other archive, but a workbook's
 * archive holds `[Content_Types].xml` and `xl/workbook.xml`, and a Word document's holds `word/document.xml`. The names are read from the end of the file (`tail`: its last
 * bytes, `size`: the whole file's length) and nothing is unpacked or run. Null when it is neither, when the archive has a macro project, uses ZIP64 or is encrypted, or when its
 * directory is not within `tail`: a file that cannot be told is refused as the archive it is.
 */
export function ooxmlTypeOf(tail: Uint8Array, size: number): typeof XLSX_TYPE | typeof DOCX_TYPE | null {
  const start = size - tail.length;
  // The end-of-central-directory record: 22 bytes, then at most a 65,535-byte comment.
  let eocd = -1;
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 22 - 65535); i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return null; // ZIP64
  const from = cdOffset - start;
  if (from < 0 || from + cdSize > tail.length) return null;
  const names: string[] = [];
  let at = from;
  for (let n = 0; n < count; n++) {
    if (at + 46 > from + cdSize || u32(tail, at) !== 0x02014b50) return null;
    const flags = u16(tail, at + 8);
    const nameLen = u16(tail, at + 28);
    const extraLen = u16(tail, at + 30);
    const commentLen = u16(tail, at + 32);
    if (flags & 1) return null; // encrypted
    if (at + 46 + nameLen > tail.length) return null;
    names.push(new TextDecoder("utf-8").decode(tail.subarray(at + 46, at + 46 + nameLen)));
    at += 46 + nameLen + extraLen + commentLen;
  }
  if (!names.includes("[Content_Types].xml")) return null;
  if (names.some((x) => /(^|\/)vbaProject\.bin$/i.test(x))) return null;
  if (names.includes("xl/workbook.xml") && !names.includes("word/document.xml")) return XLSX_TYPE;
  if (names.includes("word/document.xml") && !names.includes("xl/workbook.xml")) return DOCX_TYPE;
  return null;
}

const EXTENSION_TYPE: Readonly<Record<string, KnownMediaType>> = {
  xlsx: XLSX_TYPE,
  docx: DOCX_TYPE,
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  tif: "image/tiff",
  tiff: "image/tiff",
  csv: "text/csv",
};

/// The type a file's name claims, by its extension. Null: no extension the product knows.
export function typeFromName(filename: string): KnownMediaType | null {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return m ? (EXTENSION_TYPE[m[1].toLowerCase()] ?? null) : null;
}

const CSV_ALIASES = ["application/vnd.ms-excel", "application/csv", "text/x-csv", "text/comma-separated-values", "text/plain"];

/**
 * The type the client declared, normalised. Null where it declared nothing useful.
 * `sniffed` is what the bytes are: the names browsers give a .csv (Windows with Excel
 * installed says "an Excel file"; others say plain text) are read as CSV only when the
 * bytes are CSV. For any other file the declared type is kept as declared, so a PDF sent
 * as plain text is refused as sent as plain text, never as "sent as a CSV file".
 */
export function typeFromHeader(contentType: string | null | undefined, sniffed: Sniffed = null): string | null {
  const t = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!t || t === "application/octet-stream") return null;
  if (t === "image/jpg" || t === "image/pjpeg") return "image/jpeg";
  if (sniffed === "text/csv" && CSV_ALIASES.includes(t)) return "text/csv";
  // Some browsers on Windows send the older Excel name for a workbook; the bytes say what it is.
  if (sniffed === XLSX_TYPE && t === "application/vnd.ms-excel") return XLSX_TYPE;
  return t;
}

export type MediaFault =
  | "TYPES_NOT_SET"
  | "TYPE_NOT_RECOGNISED"
  | "ARCHIVE_NOT_ACCEPTED"
  | "MARKUP_NEVER_ACCEPTED"
  | "TYPE_NOT_ALLOWED"
  | "NAME_WITHOUT_TYPE"
  | "DECLARED_TYPE_MISMATCH";

/**
 * Whether a file of the sniffed type may be stored under the policy, given what its
 * name and the client declared. One fault, the first that applies: an unset policy
 * before anything about the file, then what the bytes are, then whether they agree
 * with what was declared.
 */
export function mediaFault(sniffed: Sniffed, declared: { filename: string; contentType?: string | null }, policy: StorePolicy): Finding<MediaFault> | null {
  const f = (code: MediaFault, data?: Finding["data"]): Finding<MediaFault> => ({ code, level: "block", ...(data ? { data } : {}) });
  if (policy.allowedMediaTypes.length === 0) return f("TYPES_NOT_SET");
  if (sniffed === "application/zip") return f("ARCHIVE_NOT_ACCEPTED");
  if (sniffed === "text/html" || sniffed === "image/svg+xml") return f("MARKUP_NEVER_ACCEPTED");
  if (sniffed == null || !isKnownMediaType(sniffed)) return f("TYPE_NOT_RECOGNISED");
  if (!policy.allowedMediaTypes.includes(sniffed)) return f("TYPE_NOT_ALLOWED", { sniffed });
  const byName = typeFromName(declared.filename);
  if (!byName) return f("NAME_WITHOUT_TYPE", { sniffed, filename: declared.filename });
  if (byName !== sniffed) return f("DECLARED_TYPE_MISMATCH", { sniffed, declared: byName });
  const byHeader = typeFromHeader(declared.contentType, sniffed);
  if (byHeader && byHeader !== sniffed) return f("DECLARED_TYPE_MISMATCH", { sniffed, declared: byHeader });
  return null;
}

/// Whether a policy's allowed types are all ones the product can recognise.
export function unknownPolicyTypes(types: readonly string[]): string[] {
  return types.filter((t) => !isKnownMediaType(t));
}
