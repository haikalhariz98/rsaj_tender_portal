/**
 * Uploading one bid part: its rule, its type, its size, its hash and its scan (ADR 0036 D6, rulings 12a, 19, 20e, 20o; build plan §1.3). Pure.
 *
 * The type is the one the file's own bytes say (the shared recogniser: `sniffed`, and for a ZIP the Office reading of its end, `office`), never its name. THREAT and
 * ERROR refuse the file in either mode (20o, M3); NOT_SCANNED is stored only under DEMONSTRATION with no scanner configured. The route's own guards (the channel,
 * the switch, publication, the key and its fingerprint, the sale, the invitee list, the late window, the body's rate) are judged before the body is read (step 9).
 */

import type { ArchiveVerdict, Sniffed } from "@/lib/documents/media";
import type { ScanResult } from "@/lib/documents/store/types";
import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import type { onlineSubmissionAllowed } from "@/lib/sealing/switch";

import type { BidPartRule, OnlineSubmissionMode, PartUploadFault, StoredScan, SubmissionChannel } from "./types";

/// Recognised only to be refused, whatever a part's list says: markup and an archive that is not an Office document.
const NEVER_ACCEPTED: readonly string[] = ["text/html", "image/svg+xml", "application/zip"];
const SHA256_HEX = /^[0-9a-f]{64}$/;

// src/lib/bids/online/parts.ts (D6)
/**
 * Every refusal of one part's upload. `size` is the body's length in bytes; `storeCap` the deployment's ceiling on one file (null: not set, and nothing is taken).
 * `browserSha256` is the hash the supplier's browser computed (lower-case hex), `serverSha256` the server's of the bytes it read. `draftFilesBySupplier` counts the
 * supplier's drafts on the exercise before this one.
 */
export function partUploadFaults(i: { rule: BidPartRule | null; sniffed: Sniffed; office: ArchiveVerdict | null; size: bigint; storeCap: bigint | null; browserSha256: string; serverSha256: string; scan: ScanResult; mode: OnlineSubmissionMode; scannerConfigured: boolean; draftFilesBySupplier: number }): PartUploadFault[] {
  const out: PartUploadFault[] = [];
  const add = (f: PartUploadFault) => {
    if (!out.includes(f)) out.push(f);
  };
  if (i.draftFilesBySupplier >= MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE) add("TOO_MANY_DRAFT_FILES");
  if (!i.rule) {
    add("PART_UNKNOWN");
    return out;
  }
  if (!i.rule.returnedByBidder) add("PART_NOT_RETURNED");

  // The size: the part's own limit and the deployment's ceiling, the smaller of the two.
  const partMax = /^[1-9][0-9]*$/.test(i.rule.maxBytes) ? BigInt(i.rule.maxBytes) : null;
  if (partMax === null || i.storeCap === null) add("SIZE_NOT_SET");
  if (i.size <= BigInt(0)) add("EMPTY");
  else if ((partMax !== null && i.size > partMax) || (i.storeCap !== null && i.size > i.storeCap)) add("TOO_LARGE");

  // The type, by the bytes.
  if (i.rule.acceptedMediaTypes.length === 0) add("TYPES_NOT_SET");
  else if (i.office && "refused" in i.office) add("OFFICE_REFUSED");
  else {
    const type = i.office && "type" in i.office ? i.office.type : i.sniffed;
    if (type === null || NEVER_ACCEPTED.includes(type) || !i.rule.acceptedMediaTypes.includes(type)) add("TYPE_NOT_ACCEPTED");
  }

  // The bytes the server read are the bytes the supplier's browser hashed.
  if (!SHA256_HEX.test(i.browserSha256) || i.browserSha256 !== i.serverSha256) add("HASH_MISMATCH");

  // The scan (12a, 20o).
  if (storedScan(i.scan, i.mode, i.scannerConfigured) === null) add(i.scan === "THREAT" ? "THREAT" : "SCAN_ERROR");
  return out;
}

/// What a stored file's scan reads, or null to refuse it. THREAT and ERROR refuse in both modes. NOT_SCANNED is only "no scanner configured, under DEMONSTRATION":
/// under LIVE (which requires a scanner), or with a scanner configured, a file that was not scanned is refused as a scan that failed.
export function storedScan(scan: ScanResult, mode: OnlineSubmissionMode, scannerConfigured: boolean): StoredScan | null {  // null: refuse
  switch (scan) {
    case "CLEAN":
      return "CLEAN";
    case "NOT_SCANNED":
      return mode === "DEMONSTRATION" && !scannerConfigured ? "NOT_SCANNED" : null;
    case "THREAT":
    case "ERROR":
      return null;
  }
}

/**
 * The route's own guards, judged before the body is read (step 9; the same doors as `submitFaults`, in the same order). An exercise that is cancelled reads as not open for
 * bids, the words a cancelled exercise has here (`PartUploadFault` has no CANCELLED, and the contract is not widened for it). An exercise whose mode is not set at the
 * door reads as online not allowed. `fingerprintMatches`: the live key's fingerprint is the one frozen at publication (`publishedKeyFingerprint`); a key re-made without its
 * `PublishedKeyChange` would not match, and nothing is sealed to it.
 */
export function uploadGateFaults(i: {
  channel: SubmissionChannel | null; online: ReturnType<typeof onlineSubmissionAllowed>; published: boolean; cancelled: boolean;
  keyLive: boolean; fingerprintMatches: boolean; saleStands: boolean; invitedPath: boolean; onInviteeList: boolean; mainOpeningStartedAt: Date | null;
}): PartUploadFault[] {
  if (i.channel !== "ONLINE") return ["CHANNEL_NOT_ONLINE"];
  const out: PartUploadFault[] = [];
  const add = (f: PartUploadFault) => {
    if (!out.includes(f)) out.push(f);
  };
  if (i.online.fault) add("ONLINE_NOT_ALLOWED");
  if (!i.published || i.cancelled) add("NOT_PUBLISHED");
  if (!i.keyLive) add("KEY_NOT_LIVE");
  else if (!i.fingerprintMatches) add("FINGERPRINT_MISMATCH");
  if (!i.saleStands) add("NO_LIVE_SALE");
  if (i.invitedPath && !i.onInviteeList) add("NOT_ON_INVITEE_LIST");
  if (i.mainOpeningStartedAt !== null) add("LATE_CLOSED");
  return out;
}

/**
 * What can be said of a part before its body is read (step 9): the rule it names, what it takes, and the supplier's drafts held. The largest the body may be is the smaller of
 * the part's own limit and the deployment's ceiling (null: either is not set, and nothing is taken). The full judgement after the body is `partUploadFaults`, which says these again.
 */
export function partPreBodyFaults(i: { rule: BidPartRule | null; storeCap: bigint | null; draftFilesBySupplier: number }): { faults: PartUploadFault[]; cap: bigint | null } {
  const faults: PartUploadFault[] = [];
  if (i.draftFilesBySupplier >= MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE) faults.push("TOO_MANY_DRAFT_FILES");
  if (!i.rule) return { faults: [...faults, "PART_UNKNOWN"], cap: null };
  if (!i.rule.returnedByBidder) faults.push("PART_NOT_RETURNED");
  const partMax = /^[1-9][0-9]*$/.test(i.rule.maxBytes) ? BigInt(i.rule.maxBytes) : null;
  if (partMax === null || i.storeCap === null) faults.push("SIZE_NOT_SET");
  if (i.rule.acceptedMediaTypes.length === 0) faults.push("TYPES_NOT_SET");
  const cap = partMax !== null && i.storeCap !== null ? (partMax < i.storeCap ? partMax : i.storeCap) : null;
  return { faults, cap };
}
