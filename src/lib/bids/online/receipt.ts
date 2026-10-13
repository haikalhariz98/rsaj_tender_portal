/**
 * The supplier's receipt: its digest and its words (ADR 0036 D5, ruling 20j; build plan §1.3, written verbatim). Pure.
 */

// src/lib/bids/online/receipt.ts
export declare function receiptDigest(i: { exerciseId: string; sequence: number; receivedAt: Date; keyFingerprint: string; manifestCipherSha256: string; declarationCipherSha256: string; fileCipherSha256s: string[] }): string;
export declare const RECEIPT_WORDS: { title: string; meaning: string };  // never "signed" / "proof" (scan)
