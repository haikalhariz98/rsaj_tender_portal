/**
 * The supplier's receipt: its digest and its words (ADR 0036 D5, H2, ruling 20j; build plan §1.3). Pure.
 *
 * Version 2 (security audit of wave 3b stage B): the exercise-wide envelope sequence counts every rival's envelopes, paper and online, so it is never hashed into a receipt or returned to a supplier before the opening. The number is the supplier's own count of its submissions on the exercise, which reveals nothing of anyone else.
 *
 * The digest is SHA-256 over one versioned, unambiguous encoding of what the portal stored: a JSON array (each field typed and delimited by JSON itself) that starts
 * with its version, then the exercise, the supplier's own submission number, the stamp (whole seconds, ISO 8601), the key's fingerprint, the manifest's and the declaration's ciphertext
 * digests, and every file's ciphertext digest in sorted order (so the order the files were sent in does not change it). The receipt also shows the browser's
 * confirmed plain hashes, which the portal does not store (D5).
 *
 * The receipt records what the portal told the supplier. It is not signed and proves nothing by itself (20j): its words never say "signed" or "proof".
 */

import { createHash } from "node:crypto";


export const RECEIPT_DIGEST_VERSION = "perolehan-receipt-v2";
const SHA256_HEX = /^[0-9a-f]{64}$/;

// src/lib/bids/online/receipt.ts
export function receiptDigest(i: { exerciseId: string; submissionNumber: number; receivedAt: Date; keyFingerprint: string; manifestCipherSha256: string; declarationCipherSha256: string; fileCipherSha256s: string[] }): string {
  const t = i.receivedAt.getTime();
  if (!Number.isFinite(t) || t % 1000 !== 0) throw new RangeError("A receipt's stamp is a whole second (FR-BID-002).");
  if (!Number.isInteger(i.submissionNumber) || i.submissionNumber < 1) throw new RangeError("A receipt's submission number is a whole number from 1.");
  for (const d of [i.keyFingerprint, i.manifestCipherSha256, i.declarationCipherSha256, ...i.fileCipherSha256s]) {
    if (!SHA256_HEX.test(d)) throw new RangeError("A receipt's digests are SHA-256, as 64 lower-case hex digits.");
  }
  const encoding = JSON.stringify([RECEIPT_DIGEST_VERSION, i.exerciseId, i.submissionNumber, i.receivedAt.toISOString(), i.keyFingerprint, i.manifestCipherSha256, i.declarationCipherSha256, [...i.fileCipherSha256s].sort()]);
  return createHash("sha256").update(encoding, "utf8").digest("hex");
}

// The words live in receipt-words.ts, which imports nothing of node's, so a screen in the browser can show them (step 11).
export { RECEIPT_WORDS } from "./receipt-words";

/**
 * A supplier's own number for each of its submissions on one exercise: 1 for the first it made, then 2, 3 and so on, by the order the portal accepted them (the envelope's
 * sequence). Nothing is stored for it, because it is a function of the supplier's own rows (a submission is never deleted): the receipt carries it, the digest hashes it, and the
 * opening's roll and My Bids derive it again from the rows, so a receipt digest recomputes from the stored rows alone. Only the order of the supplier's own rows is read: the gaps in
 * the exercise-wide sequence, which count rivals' envelopes, never reach the number. Pure.
 */
export function submissionNumbers(own: readonly { id: string; sequence: number }[]): Map<string, number> {
  return new Map([...own].sort((a, b) => a.sequence - b.sequence).map((row, index) => [row.id, index + 1]));
}
