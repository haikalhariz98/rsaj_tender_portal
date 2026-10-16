/**
 * The online finalise's rules (ADR 0036 D10, rulings 20, 20t; build plan step 15). Pure.
 *
 * Finalising an online opening needs every named officer's signature (20t) and any ONE of them, with their own passphrase. Before anything commits, every opened file is decrypted once through
 * the finaliser's grants and discarded, so a corrupt blob blocks the finalise in words instead of failing after the figures were written (M5). Only then, in one transaction and in the order
 * the triggers need, the declared figures are written (the first moment they are plain in the database), the snapshots are built from them and `finalisedAt` is set, and each opened file's data
 * key is released for the mover. Nothing here reads a database, a key or a file.
 */

import type { Declaration } from "@/lib/bids/online/types";
import { parseSen, type Sen } from "@/lib/money";
import type { Finding } from "./types";

export type OnlineFinaliseDoorFault =
  | "NOT_ONLINE"
  | "ADMINISTRATOR"
  | "NOT_NAMED_OFFICER"
  | "NOT_UNSEALED"
  | "ALREADY_FINALISED"
  | "CANCELLED"
  | "ONLINE_FILE_CLASS_NOT_SET"
  | "ONLINE_FILE_CLASS_NOT_SULIT"
  | "ONLINE_NOT_ALL_SIGNED";

/// What is judged before any password or passphrase is tried (the officer, the opening, the setting the mover will need), so a refusal here costs the officer nothing.
export function onlineFinaliseDoorFaults(i: {
  channel: string | null;
  actorIsAdministrator: boolean;
  actorIsNamedOfficer: boolean;
  unsealed: boolean;
  finalised: boolean;
  cancelled: boolean;
  /// `DocumentStorePolicy.onlineBidFileClassId` is set (the class a moved file takes). The mover has nowhere to put a file without it, so a key is never released for one.
  fileClassSet: boolean;
  /// The class is classified SULIT: a sealed bid file is never filed under a class readable by people who may not read SULIT (the attach rule's own requirement for this purpose).
  fileClassSulit: boolean;
  /// Every named officer has signed (20t). Judged before the passphrase, so no grant is opened and no figure is read until all have.
  allSigned: boolean;
  /// How many officers are named: the words for an opening not yet unsealed say each must authorise first.
  officers: number;
}): Finding<OnlineFinaliseDoorFault>[] {
  const out: Finding<OnlineFinaliseDoorFault>[] = [];
  const f = (code: OnlineFinaliseDoorFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.actorIsAdministrator) f("ADMINISTRATOR");
  if (i.channel !== "ONLINE") f("NOT_ONLINE");
  if (!i.actorIsNamedOfficer) f("NOT_NAMED_OFFICER");
  if (i.cancelled) f("CANCELLED");
  if (!i.unsealed) f("NOT_UNSEALED", { online: 1, required: i.officers });
  if (i.finalised) f("ALREADY_FINALISED");
  if (!i.fileClassSet) f("ONLINE_FILE_CLASS_NOT_SET");
  else if (!i.fileClassSulit) f("ONLINE_FILE_CLASS_NOT_SULIT");
  if (!i.allSigned) f("ONLINE_NOT_ALL_SIGNED");
  return out;
}

/// The reason code written to the access log for the first door fault (an administrator first, as at every sealed door).
export const doorReason = (fs: readonly Finding<OnlineFinaliseDoorFault>[]): OnlineFinaliseDoorFault => (fs.some((f) => f.code === "ADMINISTRATOR") ? "ADMINISTRATOR" : fs[0].code);

/// Why the material the finalise needs could not be gathered. Each carries the offer's listing number where it is about one offer.
export type MaterialFault =
  | "ONLINE_BID_NOT_FOUND"
  | "ONLINE_GRANT_MISSING"
  | "ONLINE_GRANT_UNREADABLE"
  | "ONLINE_BYTES_MISSING"
  | "ONLINE_FILE_UNREADABLE"
  | "ONLINE_DIGEST_MISMATCH"
  | "ONLINE_DECLARATION_UNREADABLE"
  | "ONLINE_ESTIMATE_UNREADABLE"
  | "ONLINE_STORE_UNAVAILABLE";

export const materialFinding = (fault: MaterialFault, listingNo: number | null): Finding => ({ code: fault, level: "block", ...(listingNo != null ? { data: { listingNo } } : {}) });

/// What the declaration writes onto the offer. The price is the decimal string it was sealed as (at most two places, above zero, `parseDeclaration`), never a float.
export function declaredWrite(d: Declaration): { priceAsRead: string; completionPeriod: number; completionUnit: Declaration["completionUnit"] } {
  return { priceAsRead: d.price, completionPeriod: d.completionPeriod, completionUnit: d.completionUnit };
}

/// The company estimate's figure as the sealed lodgement holds it: UTF-8 text of a decimal amount with at most two places. Null where it is anything else.
export function parseEstimateFigure(plain: Uint8Array): Sen | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    return null;
  }
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(text)) return null;
  return parseSen(text);
}

/// A bid file whose key the finalise releases to the mover: every file of an offer opened at this opening, and no other.
export function filesToRelease(opened: readonly { fileIds: readonly string[] }[]): string[] {
  return [...new Set(opened.flatMap((b) => b.fileIds))];
}
