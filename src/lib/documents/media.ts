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

/// Why an archive that is not accepted as an Office file was refused (ruling 12a). Said to the officer in words (`documentFaultText`, OFFICE_FILE_REFUSED).
export type OfficeRefusal =
  /// A macro project, a macro sheet or a binary of macros.
  | "MACRO"
  /// Password-protected (an encrypted entry).
  | "ENCRYPTED"
  /// ActiveX controls or embedded objects (ruling 12a, amendment 2).
  | "ACTIVE_CONTENT"
  /// A Word document attached to a template, which Word can load from outside the file.
  | "EXTERNAL_TEMPLATE"
  /// Not a workbook or a Word document, or one whose structure cannot be read with certainty (ZIP64, a damaged or ambiguous end, a directory that does not add up).
  | "UNREADABLE";

export type ArchiveVerdict = { type: typeof XLSX_TYPE | typeof DOCX_TYPE } | { refused: OfficeRefusal };

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const MACRO_SEGMENT = /^(vbaproject.*|vbadata.*|macros?(\..*)?|macrosheets)$/i;
const unreadable: ArchiveVerdict = { refused: "UNREADABLE" };

/// Whether a ZIP entry name belongs to a macro: any segment of its path (wherever it sits, any case) naming a VBA project, a macros binary or macro sheets.
const isMacroName = (name: string) => name.split("/").some((seg) => MACRO_SEGMENT.test(seg));
/// ActiveX controls and embedded objects: an `activeX/` or an `embeddings/` directory anywhere. Pictures (`media/`) are not among them.
const isActiveName = (name: string) => /(^|\/)(activex|embeddings)\//i.test(name);

/**
 * What a ZIP file is, told from the names its central directory lists (NFR-SEC-007). A ZIP signature alone cannot tell a workbook from any other archive, but a workbook's
 * archive holds `[Content_Types].xml` and `xl/workbook.xml`, and a Word document's holds `word/document.xml`. The names are read from the end of the file (`tail`: its last
 * bytes, `size`: the whole file's length) and nothing is unpacked or run.
 *
 * The file is accepted only when its end is exactly what a ZIP's end is, so that two readers cannot see two different archives in it (an end record forged inside the comment,
 * junk after the real one, a directory that stops short): the first end record found from the back must account for every byte after it (its comment is the rest of the file); both
 * disk numbers are 0 and its entry counts agree; the directory ends exactly where the end record begins; and the walk over the entries ends exactly at the directory's end. A file
 * that fails any of it is refused as unreadable, never guessed at. Also refused, with the reason: ZIP64 (by its locator, its sentinels, an entry's sentinel size or offset, or its
 * 0x0001 extra field), encryption, a macro project or macro sheets or a macros binary anywhere, ActiveX and embedded objects, and a Word document that names a template.
 *
 * Remaining risk, recorded in ADR 0035: only the central directory is read, so a reader that trusts the local headers could see other names; the contents of
 * `[Content_Types].xml` and of the relationship files are not read, so a macro-enabled main type declared there, an external link or an `attachedTemplate` target is not seen
 * (the presence of the Word settings relationship file is what refuses a document with a template).
 */
export function inspectArchive(tail: Uint8Array, size: number): ArchiveVerdict {
  const start = size - tail.length;
  // The end-of-central-directory record: 22 bytes, then at most a 65,535-byte comment. The first signature from the back is THE end record; if it does not hold up, nothing else is tried.
  let eocd = -1;
  for (let i = tail.length - 22; i >= Math.max(0, tail.length - 22 - 65535); i--) {
    if (u32(tail, i) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return unreadable;
  if (eocd + 22 + u16(tail, eocd + 20) !== tail.length) return unreadable; // junk after the record, or a comment that overruns the file
  if (eocd >= 20 && u32(tail, eocd - 20) === 0x07064b50) return unreadable; // the ZIP64 end-of-directory locator
  const disk = u16(tail, eocd + 4);
  const cdDisk = u16(tail, eocd + 6);
  const onDisk = u16(tail, eocd + 8);
  const count = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  if (count === 0xffff || onDisk === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return unreadable; // ZIP64
  if (disk !== 0 || cdDisk !== 0 || onDisk !== count) return unreadable; // a multi-part archive
  if (cdOffset + cdSize !== start + eocd) return unreadable; // the directory must end where the end record begins
  const from = cdOffset - start;
  if (from < 0) return unreadable;
  const end = from + cdSize;
  const names: string[] = [];
  let encrypted = false;
  let at = from;
  for (let n = 0; n < count; n++) {
    if (at + 46 > end || u32(tail, at) !== ZIP_CENTRAL) return unreadable;
    const flags = u16(tail, at + 8);
    const method = u16(tail, at + 10);
    const nameLen = u16(tail, at + 28);
    const extraLen = u16(tail, at + 30);
    const commentLen = u16(tail, at + 32);
    const next = at + 46 + nameLen + extraLen + commentLen;
    if (next > end) return unreadable;
    if (u32(tail, at + 20) === 0xffffffff || u32(tail, at + 24) === 0xffffffff || u32(tail, at + 42) === 0xffffffff || u16(tail, at + 34) === 0xffff) return unreadable; // ZIP64 entry
    for (let x = at + 46 + nameLen, xEnd = x + extraLen; x + 4 <= xEnd; x += 4 + u16(tail, x + 2)) if (u16(tail, x) === 0x0001) return unreadable; // ZIP64 extra field
    if (flags & 0x41 || method === 99) encrypted = true;
    names.push(new TextDecoder("utf-8").decode(tail.subarray(at + 46, at + 46 + nameLen)));
    at = next;
  }
  if (at !== end) return unreadable; // the directory is longer than the entries it holds
  if (encrypted) return { refused: "ENCRYPTED" };
  if (!names.includes("[Content_Types].xml")) return unreadable;
  if (names.some(isMacroName)) return { refused: "MACRO" };
  if (names.some(isActiveName)) return { refused: "ACTIVE_CONTENT" };
  const isWorkbook = names.includes("xl/workbook.xml");
  const isDocument = names.includes("word/document.xml");
  if (isWorkbook === isDocument) return unreadable; // neither, or both
  if (isDocument && names.some((x) => x.toLowerCase() === "word/_rels/settings.xml.rels")) return { refused: "EXTERNAL_TEMPLATE" };
  return { type: isWorkbook ? XLSX_TYPE : DOCX_TYPE };
}

/// The type of a ZIP file that is an Office file this product accepts; null for any ZIP it refuses (`inspectArchive` says why).
export function ooxmlTypeOf(tail: Uint8Array, size: number): typeof XLSX_TYPE | typeof DOCX_TYPE | null {
  const v = inspectArchive(tail, size);
  return "type" in v ? v.type : null;
}

/// The types the supplier portal can take from a file's own bytes (ruling 12a, amendment 3). The Office types are staff-only: the supplier routes read only a file's opening bytes, where a workbook is just a ZIP.
export const SUPPLIER_MEDIA_TYPES: readonly KnownMediaType[] = ["application/pdf", "image/png", "image/jpeg", "image/tiff", "text/csv"];

/// The types the organisation's upload rules list that a supplier's upload can actually be: the rules less the Office types. Shown to suppliers, and what their uploads are judged by.
export function supplierAcceptedTypes(types: readonly string[]): string[] {
  return types.filter((t) => (SUPPLIER_MEDIA_TYPES as readonly string[]).includes(t));
}

/// The types a stranger's registration may send (RSEC-2): PDF and images only, the supplier's types less CSV. A product-level exclusion by channel, not a setting: a file from
/// someone not signed in is stored before any scanner looks at it. Signed-in suppliers keep CSV.
export function publicRegisterAcceptedTypes(types: readonly string[]): string[] {
  return supplierAcceptedTypes(types).filter((t) => t !== "text/csv");
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
  | "OFFICE_FILE_REFUSED"
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

/**
 * The staff upload's judgement (ruling 12a): `mediaFault`, except that a ZIP the archive reader refused is refused as an Office file, with the reason, rather than as a bare archive. The unset
 * rules and every other fault still come first and unchanged. `office`: why `inspectArchive` refused the file, null where it was not a ZIP or was accepted.
 */
export function staffMediaFault(sniffed: Sniffed, declared: { filename: string; contentType?: string | null }, policy: StorePolicy, office: OfficeRefusal | null): Finding<MediaFault> | null {
  const judged = mediaFault(sniffed, declared, policy);
  return judged?.code === "ARCHIVE_NOT_ACCEPTED" && office ? { code: "OFFICE_FILE_REFUSED", level: "block", data: { reason: office } } : judged;
}

/// Whether a policy's allowed types are all ones the product can recognise.
export function unknownPolicyTypes(types: readonly string[]): string[] {
  return types.filter((t) => !isKnownMediaType(t));
}

/// What a file is, by its own bytes (ruling 12a), in one place for every upload that judges it: the staff document route, and the bid part's upload (wave 3b, step 9).
/// `sniffed` is what the first bytes say; `office` is the reading of a ZIP's end (null where the file is not a ZIP); `type` is the type to judge: the Office type where the
/// archive is a workbook or a Word document, else `sniffed`; `officeRefusal` is why an archive was refused. Nothing is unpacked or run.
export interface Recognised {
  sniffed: Sniffed;
  office: ArchiveVerdict | null;
  type: Sniffed;
  officeRefusal: OfficeRefusal | null;
}

/// `file` is anything that can be sliced and read (a `File`, a `Blob`): only its head and, for a ZIP, its last `ARCHIVE_TAIL_BYTES` are read.
export async function recogniseFile(file: { size: number; slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> } }): Promise<Recognised> {
  const sniffed = sniffMediaType(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()));
  if (sniffed !== "application/zip") return { sniffed, office: null, type: sniffed, officeRefusal: null };
  const office = inspectArchive(new Uint8Array(await file.slice(Math.max(0, file.size - ARCHIVE_TAIL_BYTES)).arrayBuffer()), file.size);
  return "type" in office ? { sniffed, office, type: office.type, officeRefusal: null } : { sniffed, office, type: sniffed, officeRefusal: office.refused };
}
