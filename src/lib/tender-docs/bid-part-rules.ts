/**
 * What a bidder may upload for one returned part when bids are submitted online (ADR 0036 D7, ruling 19; build plan step 7). Pure.
 *
 * The accepted types are chosen only from the types the portal can tell from a file's own bytes for a supplier (the shared recogniser, ruling 12a): the Office types need a
 * read of the file's end that the supplier path does not make, and markup and archives are never accepted. The largest size is typed in whole megabytes and kept as bytes.
 * Nothing ships set: an empty list and an empty size are "not set", and publication of an online exercise refuses them, naming the part.
 */

import type { BidPartRule as BidPartRuleOut } from "@/lib/bids/online/types";
import { SUPPLIER_MEDIA_TYPES } from "@/lib/documents/media";

export const BID_PART_MEDIA_TYPES: readonly string[] = SUPPLIER_MEDIA_TYPES;
const BYTES_PER_MEGABYTE = 1024 * 1024;
/// A hard ceiling on what a customer may type, so a slip of the keyboard cannot ask the server to hold a terabyte. The deployment's own ceiling still applies on top.
export const BID_PART_MAX_MEGABYTES = 1024;

export type BidPartRuleFault = "TYPE_UNKNOWN" | "SIZE_NOT_VALID" | "OPENING_CHECK_PROVENANCE_REQUIRED";

export function bidPartRuleFaults(i: { types: readonly string[]; megabytes: number | null; openingCheck: boolean | null; openingCheckProvenance: string | null }): BidPartRuleFault[] {
  const out: BidPartRuleFault[] = [];
  if (i.types.some((t) => !BID_PART_MEDIA_TYPES.includes(t))) out.push("TYPE_UNKNOWN");
  if (i.megabytes !== null && (!Number.isInteger(i.megabytes) || i.megabytes < 1 || i.megabytes > BID_PART_MAX_MEGABYTES)) out.push("SIZE_NOT_VALID");
  if (i.openingCheck !== null && !i.openingCheckProvenance) out.push("OPENING_CHECK_PROVENANCE_REQUIRED");
  return out;
}

export const BID_PART_RULE_FAULT_TEXT: Readonly<Record<BidPartRuleFault, string>> = {
  TYPE_UNKNOWN: "Choose only from the file types the portal can recognise.",
  SIZE_NOT_VALID: `Enter a whole number of megabytes from 1 to ${BID_PART_MAX_MEGABYTES}, or leave it empty.`,
  OPENING_CHECK_PROVENANCE_REQUIRED: "Say where the opening-check answer comes from.",
};

/// The size as stored: whole megabytes to bytes, as a decimal string (the column is a BigInt). Null stays null.
export const bytesFromMegabytes = (mb: number | null): bigint | null => (mb === null ? null : BigInt(mb) * BigInt(BYTES_PER_MEGABYTE));

/// The size as typed: bytes back to whole megabytes, or null where it is not a whole number of them.
export const megabytesFromBytes = (bytes: bigint | null): number | null => (bytes === null || bytes % BigInt(BYTES_PER_MEGABYTE) !== BigInt(0) ? null : Number(bytes / BigInt(BYTES_PER_MEGABYTE)));

export interface PackPartFacts { id: string; partCode: string; label: string; sortOrder: number; mandatory: boolean | null; returnedByBidder: boolean | null }
export interface PartConfigFacts { code: string; contractBasisCode: string | null; bidAcceptedMediaTypes: readonly string[]; bidMaxBytes: bigint | null; openingCheck: boolean | null }

/**
 * The rules an online exercise freezes at publication (ADR 0036 D7), one per part of its approved pack, in the pack's order. Pure.
 *  - A part is returned by the bidder only where the pack part says so (`returnedByBidder` true): unset is not returned. The declaration is typed into the submission, not uploaded.
 *  - The configuration is the basis-specific row where there is one, else the any-basis row (as the pack resolved it).
 *  - `null`: a returned part's opening check is not set, so its rule cannot be written (the rule holds a yes or a no).
 * A returned part with no accepted types or no size is kept in the list, empty, so publication names it.
 */
export function bidRulesFrom(parts: readonly PackPartFacts[], configs: readonly PartConfigFacts[], basisCode: string | null): BidPartRuleOut[] | null {
  const out: BidPartRuleOut[] = [];
  for (const p of [...parts].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const matches = configs.filter((c) => c.code === p.partCode);
    const c = matches.find((x) => x.contractBasisCode !== null && x.contractBasisCode === basisCode) ?? matches.find((x) => x.contractBasisCode === null) ?? null;
    const returned = p.returnedByBidder === true;
    if (returned && (c === null || c.openingCheck === null)) return null;
    out.push({ packPartId: p.id, label: p.label, mandatory: p.mandatory === true, returnedByBidder: returned, acceptedMediaTypes: [...(c?.bidAcceptedMediaTypes ?? [])], maxBytes: c?.bidMaxBytes != null ? c.bidMaxBytes.toString() : "", openingCheck: c?.openingCheck === true });
  }
  return out;
}
