/**
 * The download of an opening-check file after finalising, through the filed document (20cl; wave 3c plan §3.2 and §4.2). Pure.
 *
 * Before finalising, the named opening officers open an opening-check file through the sealed route. Once the opening is finalised, the sealed route
 * refuses (`FINALISED_USE_DOCUMENTS`) and the file is read as the filed document instead: the route files it if the post-commit move has not yet, then
 * hands over to the document version route, which applies the SULIT entitlement and logs the download. This decides whether the request may go that far;
 * the words say why not, and say what each failure of the move means, so a cell never shows a dead control.
 */

import type { MoveResult } from "@/lib/sealing/online-file-mover";

import type { Finding } from "./types";

export type FiledFileFault = "ADMINISTRATOR" | "NOT_FINALISED" | "NOT_ON_THIS_OPENING" | "NOT_AN_OPENING_CHECK_FILE";

/// Why the mover could not file a file: one of `MoveResult`'s FAILED codes. Taken from the type, so a new code without words fails the typecheck.
export type MoveFailure = Extract<MoveResult, { status: "FAILED" }>["code"];

/**
 * Every fault that applies, in the order given (they accumulate).
 * - `administrator`: an administrator account is refused, as at every sealed entry point (20at, 20au).
 * - `finalised`: the opening is finalised; before that the file is opened only through the sealed route.
 * - `fileOnOpening`: the file belongs to a bid opened at this opening.
 * - `checked`: the file's part is one the frozen rules mark as opened at the opening (`openingCheck`), read from the frozen rules, never the live parts (G1).
 */
export function filedFileFaults(i: { administrator: boolean; finalised: boolean; fileOnOpening: boolean; checked: boolean }): Finding<FiledFileFault>[] {
  const out: Finding<FiledFileFault>[] = [];
  if (i.administrator) out.push({ code: "ADMINISTRATOR", level: "block" });
  if (!i.finalised) out.push({ code: "NOT_FINALISED", level: "block" });
  if (!i.fileOnOpening) out.push({ code: "NOT_ON_THIS_OPENING", level: "block" });
  if (!i.checked) out.push({ code: "NOT_AN_OPENING_CHECK_FILE", level: "block" });
  return out;
}

/// One sentence per refusal and per failure of the move. Staff-facing English; no code reaches a screen.
export const FILED_FILE_WORDS: Readonly<Record<FiledFileFault | MoveFailure, string>> = {
  ADMINISTRATOR: "Administrators do not download bid files.",
  NOT_FINALISED: "Not finalised yet. Only named opening officers open this file.",
  NOT_ON_THIS_OPENING: "Not part of a bid opened here.",
  NOT_AN_OPENING_CHECK_FILE: "Not an opening-check file. It cannot be downloaded here.",
  FILE_NOT_FOUND: "No such file received.",
  CLASS_NOT_SET: "Filing class not set. Set it under Configuration › Documents.",
  CLASS_NOT_SULIT: "Filing class is not SULIT. Set one under Configuration › Documents.",
  ORGANISATION_NOT_FOUND: "Organisation unreadable. Not filed. Ask whoever runs the portal.",
  STORE_NOT_BUILT: "Document store not set up. Not filed. Ask whoever runs the portal.",
  BYTES_MISSING: "Sealed file not in the store. Ask whoever runs the portal.",
  DIGEST_MISMATCH: "File does not match its fingerprint. Not filed. Ask whoever runs the portal.",
  FILE_UNREADABLE: "Sealed file would not open. Not filed. Ask whoever runs the portal.",
  REFUSED: "Document store refused it. Not filed. Ask whoever runs the portal.",
};

/// The words when the mover found nothing to move and no filed document stands for the file: the finalise did not release it. Staff-facing English.
export const NOT_FILED_YET_WORDS = "Not filed yet. Ask whoever runs the portal.";

/// The words when the route could not be reached or answered with something that is not ours (a proxy's page). Staff-facing English.
export const FILED_FILE_FALLBACK_WORDS = "Download failed. Try again, or ask whoever runs the portal.";

export const FILED_FILE_FIELDS = ["exerciseId", "openingId", "fileId"] as const;
export type FiledFileRequest = { exerciseId: string; openingId: string; fileId: string };
export type FiledFileParse = { ok: true; value: FiledFileRequest } | { ok: false; fields: Record<string, string> };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/// The one place the form is read (plan §4.2): exactly `exerciseId`, `openingId` and `fileId`, each once and an identifier. Unknown fields are refused by name.
export function parseFiledFileRequest(form: { keys(): Iterable<string>; getAll(name: string): unknown[] }): FiledFileParse {
  const fields: Record<string, string> = {};
  for (const k of new Set(form.keys())) if (!(FILED_FILE_FIELDS as readonly string[]).includes(k)) fields[k] = "This field is not accepted.";
  const value: Partial<FiledFileRequest> = {};
  for (const k of FILED_FILE_FIELDS) {
    const all = form.getAll(k);
    if (all.length === 0) fields[k] = "Required.";
    else if (all.length > 1) fields[k] = "Send this field once.";
    else if (typeof all[0] !== "string" || !ID.test(all[0])) fields[k] = "Not a valid identifier.";
    else value[k] = all[0];
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: value as FiledFileRequest };
}

/// How each refusal answers. A mover failure is a 409 whatever its code (plan §4.2).
export const FILED_FILE_STATUS: Readonly<Record<FiledFileFault, number>> = { ADMINISTRATOR: 403, NOT_FINALISED: 409, NOT_ON_THIS_OPENING: 404, NOT_AN_OPENING_CHECK_FILE: 409 };
