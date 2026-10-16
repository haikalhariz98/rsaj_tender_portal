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
  ADMINISTRATOR: "An administrator account does not download bid files from an opening.",
  NOT_FINALISED: "The opening is not finalised yet. Until it is, only the named opening officers open this file, from the opening.",
  NOT_ON_THIS_OPENING: "That file is not part of a bid opened at this opening.",
  NOT_AN_OPENING_CHECK_FILE: "That file is not for a part the officers open at the opening, so it is not downloaded from here.",
  FILE_NOT_FOUND: "No such file was received for this exercise.",
  CLASS_NOT_SET: "The class that an online bid's files take when they are filed is not set, so this file cannot be filed yet. Set it under Configuration › Documents, in the upload rules.",
  CLASS_NOT_SULIT: "The class set for an online bid's filed files is not a SULIT class, so this file is not filed under it. Set a SULIT class under Configuration › Documents, in the upload rules.",
  ORGANISATION_NOT_FOUND: "The organisation this file belongs to could not be read, so it was not filed. Report it to whoever runs the portal.",
  STORE_NOT_BUILT: "The store that filed documents are kept in is not set up on this server, so this file cannot be filed yet. Report it to whoever runs the portal.",
  BYTES_MISSING: "The sealed file is not in the store, so it cannot be filed. Report it to whoever runs the portal.",
  DIGEST_MISMATCH: "The file does not match its recorded fingerprint, so it was not filed. Report it to whoever runs the portal.",
  FILE_UNREADABLE: "The sealed file could not be opened to be filed, so it was not filed. Report it to whoever runs the portal.",
  REFUSED: "The document store refused to file this file, so it was not filed. Report it to whoever runs the portal.",
};
