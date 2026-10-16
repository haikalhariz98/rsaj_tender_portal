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

/// The bids now standing, in stamp order (two stamps in the same second by their sequence). The one ordering `receivedView` and `registerNumbers` share.
function standingInOrder<R extends { sequence: number; receivedAt: Date; status: OnlineBidStatus }>(rows: readonly R[]): R[] {
  return rows.filter((r) => STANDING.includes(r.status)).sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || a.sequence - b.sequence);
}

// src/lib/bids/online/received.ts (ruling 18 as amended by 20u, 20l)
/// Review S2: the count of the bids now standing, and of those the ones in time and the ones late (the plan's "2 standing plus 1 late"), so no screen counts.
export function receivedView(rows: { sequence: number; receivedAt: Date; late: boolean; status: OnlineBidStatus }[], openingStarted: boolean): { count: number; inTime: number; late: number; standing: { ordinal: number; sequence: number | null /* null before the start */; receivedAt: Date; late: boolean }[] } {
  const standing = standingInOrder(rows).map((r, i) => ({ ordinal: i + 1, sequence: openingStarted ? r.sequence : null, receivedAt: r.receivedAt, late: r.late }));
  const late = standing.filter((r) => r.late).length;
  return { count: standing.length, inTime: standing.length - late, late, standing };
}

/// What number each standing bid carries on Received: its ordinal before the opening starts, its portal order of receipt (the sequence) from the start (20u, 20ar). A bid not standing has none.
/// Built on the same ordering as `receivedView`, so the register and its counts cannot disagree.
export function registerNumbers(rows: readonly { id: string; sequence: number; receivedAt: Date; status: OnlineBidStatus }[], openingStarted: boolean): Map<string, { number: number; isOrdinal: boolean }> {
  return new Map(standingInOrder(rows).map((r, i) => [r.id, openingStarted ? { number: r.sequence, isOrdinal: false } : { number: i + 1, isOrdinal: true }]));
}

/// 20u: the ordinal column's label and note ("the order of the bids now standing; it can change before the closing; the portal's order of receipt is shown once the
/// opening starts"; ruling 20ar: never "the receipt number", since a supplier's receipt carries its own submission number), and the sequence column's label from the start. One constant; no component restates it.
/// Ruling 20ab: in both languages, though Received is a staff screen; it renders the language its siblings render until the NFR-LNG-001 programme.
export const RECEIVED_WORDS: { ordinalLabel: Words; ordinalNote: Words; sequenceLabel: Words } = {
  ordinalLabel: w("Order", "Susunan"),
  ordinalNote: w(
    "The order of the bids now standing. It can change before the closing. The portal's order of receipt for the exercise is shown once the opening starts.",
    "Susunan bida yang masih berkuat kuasa sekarang. Ia boleh berubah sebelum tarikh tutup. Susunan penerimaan portal bagi pelawaan ini ditunjukkan sebaik sahaja pembukaan bermula.",
  ),
  sequenceLabel: w("Portal order of receipt", "Susunan penerimaan portal"),
};
