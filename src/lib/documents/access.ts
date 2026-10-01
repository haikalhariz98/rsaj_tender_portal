/**
 * Whether a version's bytes are served (OD-2, OD-4).
 *
 * Nobody signs in yet, so the portal cannot say who is reading. Anything served is
 * served to anyone who can reach the portal — so SULIT and unclassified documents are
 * listed but never served, and a direct request is refused and logged. A version found
 * to carry a threat is never served. Verifying a fingerprint reads the bytes but serves
 * nothing, so it is allowed for every version.
 */

import type { Finding, ScanState, SecurityClass } from "./types";

export type DownloadRefusal = "SULIT" | "UNCLASSIFIED" | "THREAT";

export function downloadDecision(i: { classification: SecurityClass | null; scanState: ScanState }): { allow: true } | { allow: false; reason: DownloadRefusal } {
  if (i.scanState === "THREAT") return { allow: false, reason: "THREAT" };
  if (i.classification == null) return { allow: false, reason: "UNCLASSIFIED" };
  if (i.classification === "SULIT") return { allow: false, reason: "SULIT" };
  return { allow: true };
}

/// The longest file name stored, in code points (the database column has no limit of its own).
/// A longer name is refused at upload; it is never cut (security audit M-1).
export const MAX_FILENAME_CODE_POINTS = 255;

/// The longest name offered back on download, extension included, in code points.
export const MAX_SERVED_FILENAME_CODE_POINTS = 180;

const codePoints = (s: string) => Array.from(s);

/// A lone surrogate half cannot be percent-encoded (`encodeURIComponent` throws on one).
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/// Controls, quotes, backslash and slash, plus the invisible characters that can make a name
/// read differently from what it is: zero-width marks, bidirectional overrides, the BOM.
const UNSAFE_IN_NAME = /[\u0000-\u001f\u007f-\u009f"\\/\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/// Whether an uploaded file's name fits the storage limit. Counted in code points, so an
/// emoji is one. Refused rather than cut: a cut name is a different name.
export function filenameFault(name: string): Finding | null {
  const n = codePoints(name).length;
  return n > MAX_FILENAME_CODE_POINTS ? { code: "NAME_TOO_LONG", level: "block", data: { max: MAX_FILENAME_CODE_POINTS, length: n } } : null;
}

/**
 * The name a download is offered under, built from the uploader's name and the type the
 * bytes were sniffed as. The uploader's own extension is never reused: the name is the
 * cleaned stem, trimmed by code point, then "." and the extension of the stored type — so
 * no length of name can leave the uploader's extension (`.hta`, `.exe`) as the last one.
 * Control characters, quotes, backslashes, path separators and bidirectional marks are
 * taken out, and an ASCII fallback sits beside the UTF-8 form. The name is the uploader's,
 * shown and offered back, never used as a path.
 */
export function servedFilename(original: string, ext: string): string {
  const cleaned = original.replace(LONE_SURROGATE, "\ufffd").replace(UNSAFE_IN_NAME, "").replace(/^\.+/, "").trim();
  const stem = cleaned.replace(/\.[A-Za-z0-9]{1,10}$/, "");
  const budget = MAX_SERVED_FILENAME_CODE_POINTS - 1 - ext.length;
  const trimmed = codePoints(stem).slice(0, budget).join("").replace(/[.\s]+$/, "");
  return `${trimmed || "document"}.${ext}`;
}

/// The Content-Disposition value for a download: always an attachment (RFC 6266), the name
/// in an ASCII form and in RFC 5987 form, which percent-encodes ' ( ) * as well as what
/// `encodeURIComponent` does (it leaves those four bare, and RFC 5987 does not allow them
/// in an attr-char), so every client parses it the same way (security audit C-3).
export function dispositionFilename(original: string, ext: string): string {
  const name = servedFilename(original, ext);
  const ascii = name.replace(/[^\x20-\x7e]/gu, "_").replace(/[;%]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export const EXTENSION_FOR: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/tiff": "tif",
  "text/csv": "csv",
};
