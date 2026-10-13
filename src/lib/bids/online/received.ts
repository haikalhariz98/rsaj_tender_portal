/**
 * Received, before and after the opening's start (SR-13; ruling 18 as amended by 20u, 20l; ADR 0036 D9; build plan §1.3). Pure.
 *
 * The bids now standing (neither replaced nor withdrawn), in stamp order, each with its ordinal among them, its stamp and its late flag. No sequence before the opening
 * starts: its gaps would show how many replacements and withdrawals there have been, and when (20u). Never a name, a part or a size. The sequence appears from the
 * start, when the roll is frozen. Keeping the sequence before the start is a one-line change here (20u: reversible).
 */

import { w, type Words } from "@/lib/contract/labels";

import type { OnlineBidStatus } from "./types";

const STANDING: readonly OnlineBidStatus[] = ["SUBMITTED", "OPENED"];

// src/lib/bids/online/received.ts (ruling 18 as amended by 20u, 20l)
/// Review S2: the count of the bids now standing, and of those the ones in time and the ones late (the plan's "2 standing plus 1 late"), so no screen counts.
export function receivedView(rows: { sequence: number; receivedAt: Date; late: boolean; status: OnlineBidStatus }[], openingStarted: boolean): { count: number; inTime: number; late: number; standing: { ordinal: number; sequence: number | null /* null before the start */; receivedAt: Date; late: boolean }[] } {
  const standing = rows
    .filter((r) => STANDING.includes(r.status))
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.sequence - b.sequence)
    .map((r, i) => ({ ordinal: i + 1, sequence: openingStarted ? r.sequence : null, receivedAt: r.receivedAt, late: r.late }));
  const late = standing.filter((r) => r.late).length;
  return { count: standing.length, inTime: standing.length - late, late, standing };
}

/// 20u: the ordinal column's label and note ("the order of the bids now standing, not the receipt number; it can change before the closing;
/// the receipt number is shown once the opening starts"), and the sequence column's label from the start. One constant; no component restates it.
/// Ruling 20ab: in both languages, though Received is a staff screen; it renders the language its siblings render until the NFR-LNG-001 programme.
export const RECEIVED_WORDS: { ordinalLabel: Words; ordinalNote: Words; sequenceLabel: Words } = {
  ordinalLabel: w("Order", "Susunan"),
  ordinalNote: w(
    "The order of the bids now standing, not the receipt number. It can change before the closing. The receipt number is shown once the opening starts.",
    "Susunan bida yang masih berkuat kuasa sekarang, bukan nombor resit. Ia boleh berubah sebelum tarikh tutup. Nombor resit ditunjukkan sebaik sahaja pembukaan bermula.",
  ),
  sequenceLabel: w("Receipt number", "Nombor resit"),
};
