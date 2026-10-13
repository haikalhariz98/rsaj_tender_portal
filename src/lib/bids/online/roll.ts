/**
 * The opening roll, and what My Bids says of a supplier's own bid from the opening's start (ADR 0036 D10, H2, rulings 20s, 25; build plan §1.3, written verbatim).
 * Pure.
 */

import type { OnlineBidStatus } from "./types";

// src/lib/bids/online/roll.ts (H2)
export declare function receiptRoll(rows: { sequence: number; receiptDigest: string; late: boolean; status: OnlineBidStatus }[]): { v: 1; entries: { sequence: number; receiptDigest: string; late: boolean }[]; rollDigest: string };
/// 20s: from the opening's start, when the roll is frozen. Never a verdict, never "verified", "signed" or "proof".
export type MyBidOpeningState = "LISTED_NOT_OPENED" | "OPENED" | "LATE_IN_ROLL" | "NOT_IN_ROLL" | "REPLACED_OR_WITHDRAWN";
export declare function myBidOpeningState(i: { status: OnlineBidStatus; openingStarted: boolean; unsealed: boolean; rollEntry: { late: boolean } | null; opened: boolean }): MyBidOpeningState | null; // null: before the start
/// The words carry the digest itself (the listed or opened one), in full, and ask the supplier to compare it with the receipt it kept.
/// NOT_IN_ROLL names the organisation from configuration and asks the supplier to contact it now, quoting its receipt. OPENED keeps
/// ruling 25's "Opened; the result follows the evaluation".
export declare function myBidOpenedWords(i: { state: MyBidOpeningState; digest: string | null; organisationName: string }): { headline: string; detail: string; digest: string | null };
