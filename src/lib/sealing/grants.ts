/**
 * Whether an officer may download a sealed file at the opening check (ADR 0036 D10, rulings 20c, 20n, 20t; build plan §1.3). Pure.
 *
 * Only the named officers, never an administrator, only after the unseal and before finalising (after it the files are documents), only an opening-check part
 * (SR-14: "the officers can only download these documents"), and only of an opened bid. FINALISE grants are for `finaliseOnline` alone.
 */

import type { GrantUse, OnlineBidStatus } from "@/lib/bids/online/types";

export type DownloadFault = "NOT_NAMED_OFFICER" | "ADMINISTRATOR" | "NOT_UNSEALED" | "FINALISED_USE_DOCUMENTS" | "NOT_OPENING_CHECK_PART" | "NOT_OPENED";

// src/lib/sealing/grants.ts (D10)
export function downloadFaults(i: { actorIsNamedOfficer: boolean; actorIsAdministrator: boolean; unsealed: boolean; finalised: boolean; use: GrantUse; bidStatus: OnlineBidStatus }): ("NOT_NAMED_OFFICER" | "ADMINISTRATOR" | "NOT_UNSEALED" | "FINALISED_USE_DOCUMENTS" | "NOT_OPENING_CHECK_PART" | "NOT_OPENED")[] {
  const out: DownloadFault[] = [];
  if (!i.actorIsNamedOfficer) out.push("NOT_NAMED_OFFICER");
  if (i.actorIsAdministrator) out.push("ADMINISTRATOR");
  if (!i.unsealed) out.push("NOT_UNSEALED");
  if (i.finalised) out.push("FINALISED_USE_DOCUMENTS");
  if (i.use !== "OPENING_CHECK") out.push("NOT_OPENING_CHECK_PART");
  if (i.bidStatus !== "OPENED") out.push("NOT_OPENED");
  return out;
}

export const DOWNLOAD_WORDS: Readonly<Record<DownloadFault, string>> = {
  NOT_NAMED_OFFICER: "Only the officers named to open this exercise download its bids' files at the opening check.",
  ADMINISTRATOR: "An administrator account does not open or download bids.",
  NOT_UNSEALED: "The bids have not been unsealed yet.",
  FINALISED_USE_DOCUMENTS: "The opening is finalised: the bids' files are now with the exercise's documents.",
  NOT_OPENING_CHECK_PART: "Only the parts checked at the opening are downloaded here.",
  NOT_OPENED: "That bid was not opened.",
};
