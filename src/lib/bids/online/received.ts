/**
 * Received, before and after the opening's start (ruling 18 as amended by 20u, 20l; build plan §1.3, written verbatim). Pure.
 */

import type { OnlineBidStatus } from "./types";

// src/lib/bids/online/received.ts (ruling 18 as amended by 20u, 20l)
export declare function receivedView(rows: { sequence: number; receivedAt: Date; late: boolean; status: OnlineBidStatus }[], openingStarted: boolean): { count: number; standing: { ordinal: number; sequence: number | null /* null before the start */; receivedAt: Date; late: boolean }[] };
/// 20u: the ordinal column's label and note ("the order of the bids now standing, not the receipt number; it can change before the closing;
/// the receipt number is shown once the opening starts"), and the sequence column's label from the start. One constant; no component restates it.
export declare const RECEIVED_WORDS: { ordinalLabel: string; ordinalNote: string; sequenceLabel: string };
