/**
 * The officer's download of a sealed file at the opening check (ADR 0036 D4, D10; rulings 20n, 20w; wave 3b step 14). Pure: the request's parsing, the refusals' codes, statuses and words.
 * Whether the officer may have the file is `downloadFaults` (`grants.ts`); this file only says how a refusal is answered.
 */

import { DOWNLOAD_WORDS, type DownloadFault } from "./grants";

export const SEALED_FILE_FIELDS = ["openingId", "fileId", "password", "passphrase"] as const;
/// The body is four short strings: anything larger is refused unread.
export const MAX_SEALED_FILE_REQUEST_BYTES = 8 * 1024;
export const MAX_SEALED_FILE_PASSPHRASE_CHARACTERS = 1024;
const MAX_PASSWORD_CHARACTERS = 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface SealedFileRequest { openingId: string; fileId: string; password: string; passphrase: string }
export type SealedFileParse = { ok: true; value: SealedFileRequest } | { ok: false; fields: Record<string, string> };

/// The one place the body is read: exactly the four fields, each a string, nothing else. Unknown fields are refused by name.
export function parseSealedFileRequest(body: unknown): SealedFileParse {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return { ok: false, fields: { body: "Send a JSON object with openingId, fileId, password and passphrase." } };
  const o = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const k of Object.keys(o)) if (!(SEALED_FILE_FIELDS as readonly string[]).includes(k)) fields[k] = "This field is not accepted.";
  const text = (k: (typeof SEALED_FILE_FIELDS)[number], max: number, pattern?: RegExp) => {
    const v = o[k];
    if (typeof v !== "string") return void (fields[k] = "Required, as text.");
    if (v.length === 0) return void (fields[k] = "Required.");
    if (v.length > max || (pattern && !pattern.test(v))) return void (fields[k] = pattern ? "Not a valid identifier." : "Too long.");
    return v;
  };
  const openingId = text("openingId", 64, ID);
  const fileId = text("fileId", 64, ID);
  const password = text("password", MAX_PASSWORD_CHARACTERS);
  const passphrase = text("passphrase", MAX_SEALED_FILE_PASSPHRASE_CHARACTERS);
  if (Object.keys(fields).length > 0 || !openingId || !fileId || !password || !passphrase) return { ok: false, fields };
  return { ok: true, value: { openingId, fileId, password, passphrase } };
}

export type SealedFileRefusal =
  | "VALIDATION" | "TOO_LARGE" | "NOT_FOUND" | "RATE_LIMITED" | "STEP_UP_REFUSED" | "NO_GRANT" | "KEY_CHANGED" | "BUSY"
  | DownloadFault
  | "NO_KEY" | "PEPPER_NOT_HELD" | "PEPPER_INVALID" | "LOCKED" | "LOCKOUT_NOT_SET" | "WRONG_PASSPHRASE" | "KEY_UNREADABLE"
  | "BYTES_MISSING" | "DIGEST_MISMATCH" | "FILE_UNREADABLE";

export const SEALED_FILE_STATUS: Readonly<Record<SealedFileRefusal, number>> = {
  VALIDATION: 400, TOO_LARGE: 413, NOT_FOUND: 404, RATE_LIMITED: 429, STEP_UP_REFUSED: 403, NO_GRANT: 403, KEY_CHANGED: 409, BUSY: 503,
  NOT_NAMED_OFFICER: 403, ADMINISTRATOR: 403, NOT_UNSEALED: 403, FINALISED_USE_DOCUMENTS: 403, NOT_OPENING_CHECK_PART: 403, NOT_OPENED: 403,
  NO_KEY: 403, PEPPER_NOT_HELD: 503, PEPPER_INVALID: 503, LOCKED: 423, LOCKOUT_NOT_SET: 503, WRONG_PASSPHRASE: 403, KEY_UNREADABLE: 403,
  BYTES_MISSING: 500, DIGEST_MISMATCH: 500, FILE_UNREADABLE: 500,
};

export const SEALED_FILE_WORDS = {
  NOT_FOUND: "No such file at this opening.",
  TOO_LARGE: "That request is far larger than a download request can be.",
  RATE_LIMITED: "You have asked for a great many files in the last minute, so this one was not sent. Wait a minute and try again. The first refused request in each minute is logged.",
  NO_GRANT: "No key of yours opens that file at this opening.",
  KEY_CHANGED: "Your key for this exercise changed while this was being checked. Nothing was opened. Try again.",
  BUSY: "The portal is busy with other files. Wait a few seconds and try again.",
  BYTES_MISSING: "The sealed file is not in the store, so it is not served. This has been logged. Report it to whoever runs the portal.",
  DIGEST_MISMATCH: "The file does not match its recorded fingerprint, so it is not served. This has been logged. Report it to whoever runs the portal.",
  FILE_UNREADABLE: "The file could not be opened with your key, so it is not served. This has been logged. Report it to whoever runs the portal.",
  VALIDATION: "The request is not what was expected. Nothing was opened.",
} as const;

/// The words for a refusal of the download itself; the unlock's own refusals use `unlockRefusalWords`.
export const downloadRefusalWords = (code: DownloadFault): string => DOWNLOAD_WORDS[code];

/// The reason code written to the access log for a set of faults: an administrator is named as one whatever else is true; otherwise the first.
export const reasonOf = (faults: readonly DownloadFault[]): DownloadFault => (faults.includes("ADMINISTRATOR") ? "ADMINISTRATOR" : faults[0]);
