/**
 * The most bytes one public application may weigh (ADR 0041 D9, REG-2, plan O-10): what the route enforces on the stated length before it reads a byte, and again while reading.
 * Derived, never a literal: the files part from the organisation's own settings (the per-file cap, the count and byte quotas per application), and the rest from technical bounds.
 * An unset setting gives no ceiling, and the register is closed (`whatIsMissing`). Pure, and safe for the browser.
 */

import { HONEYPOT_FIELD } from "@/lib/portal/apply";

import { REGISTER_APPLICATION_PART } from "./contract";
import { ADDRESS_BOUNDS, AGREEMENT_BOUNDS, CODE_BOUND, COMPANY_BOUNDS, CONTACT_BOUNDS, CREDITOR_BOUNDS, DOCUMENT_BOUNDS, LIST_BOUNDS, SIGNATORY_BOUNDS } from "./parse";

/// What one multipart part may carry besides its content: the boundary line and its headers, with a file name at the store's longest (255 code points, each up to four bytes and
/// possibly escaped). Technical, not policy, as `MULTIPART_ALLOWANCE_BYTES` is.
export const PART_OVERHEAD = 4096n;

/// The most one character of a text may cost once written as JSON: a control character is escaped as six bytes (`\u0001`); every other character is at most four.
const JSON_BYTES_PER_CHARACTER = 6;
/// What one field may cost in JSON besides its text: its key, quotes, colon, comma, and `null`. Generous: the longest key in the body is under 30 characters.
const JSON_FIELD_OVERHEAD = 64;
/// What the bait field may hold and still be read. A person leaves it empty; a script that fills it is answered as a success that wrote nothing (O-7).
const HONEYPOT_ALLOWANCE = 1024;

const sum = (o: Readonly<Record<string, number>>) => Object.values(o).reduce((a, b) => a + b, 0);
const textBytes = (o: Readonly<Record<string, number>>) => sum(o) * JSON_BYTES_PER_CHARACTER + Object.keys(o).length * JSON_FIELD_OVERHEAD;

const { valueId, ...documentTexts } = DOCUMENT_BOUNDS;
/// One document row at its bound: its texts, its two switches and every code it may carry (an id is ASCII by its pattern: its own length, quotes and a comma).
const DOCUMENT_ROW_BYTES = textBytes(documentTexts) + 2 * JSON_FIELD_OVERHEAD + LIST_BOUNDS.valuesPerDocument * (valueId + 3);
/// One agreement at its bound: its kind (a code), the text it names, its hash and its tick.
const AGREEMENT_BYTES = textBytes({ kind: CODE_BOUND, ...AGREEMENT_BOUNDS }) + JSON_FIELD_OVERHEAD;

/// The JSON part with every text at its hard bound and every list full, the bait field, and the two parts' headers and the closing boundary. Computed from the bounds `parse.ts`
/// enforces, so any body that can be read fits.
export const REGISTER_TEXT_ALLOWANCE: bigint =
  BigInt(
    textBytes(COMPANY_BOUNDS) +
      textBytes(ADDRESS_BOUNDS) +
      textBytes(CONTACT_BOUNDS) +
      LIST_BOUNDS.documents * DOCUMENT_ROW_BYTES +
      textBytes(CREDITOR_BOUNDS) +
      textBytes(SIGNATORY_BOUNDS) +
      LIST_BOUNDS.agreements * AGREEMENT_BYTES +
      textBytes({ noticeSha256: 64 }) +
      // the top level and the nested records' own braces and keys
      12 * JSON_FIELD_OVERHEAD +
      HONEYPOT_ALLOWANCE +
      REGISTER_APPLICATION_PART.length +
      HONEYPOT_FIELD.length,
  ) +
  3n * PART_OVERHEAD;

export interface CeilingSettings {
  /// The per-file cap: the smaller of the document store's and the deployment's. Null: not set.
  capBytes: bigint | null;
  /// `SupplierPolicy.uploadMaxFilesPerApplication`. Null: not set.
  maxFiles: number | null;
  /// `SupplierPolicy.uploadMaxBytesPerApplication`. Null: not set.
  maxBytes: bigint | null;
}

/// min(maxBytes, maxFiles × capBytes) + maxFiles × PART_OVERHEAD + REGISTER_TEXT_ALLOWANCE. Null while any setting is unset: the register is closed and names it.
export function registerBodyCeiling(s: CeilingSettings): bigint | null {
  if (s.capBytes == null || s.maxFiles == null || s.maxBytes == null) return null;
  const files = BigInt(s.maxFiles);
  const byCount = files * s.capBytes;
  const fileBytes = s.maxBytes < byCount ? s.maxBytes : byCount;
  return fileBytes + files * PART_OVERHEAD + REGISTER_TEXT_ALLOWANCE;
}
