/**
 * The supplier's receipt: its digest and its words (ADR 0036 D5, H2, ruling 20j; build plan §1.3). Pure.
 *
 * The digest is SHA-256 over one versioned, unambiguous encoding of what the portal stored: a JSON array (each field typed and delimited by JSON itself) that starts
 * with its version, then the exercise, the sequence, the stamp (whole seconds, ISO 8601), the key's fingerprint, the manifest's and the declaration's ciphertext
 * digests, and every file's ciphertext digest in sorted order (so the order the files were sent in does not change it). The receipt also shows the browser's
 * confirmed plain hashes, which the portal does not store (D5).
 *
 * The receipt records what the portal told the supplier. It is not signed and proves nothing by itself (20j): its words never say "signed" or "proof".
 */

import { createHash } from "node:crypto";

import { w, type Words } from "@/lib/contract/labels";

export const RECEIPT_DIGEST_VERSION = "perolehan-receipt-v1";
const SHA256_HEX = /^[0-9a-f]{64}$/;

// src/lib/bids/online/receipt.ts
export function receiptDigest(i: { exerciseId: string; sequence: number; receivedAt: Date; keyFingerprint: string; manifestCipherSha256: string; declarationCipherSha256: string; fileCipherSha256s: string[] }): string {
  const t = i.receivedAt.getTime();
  if (!Number.isFinite(t) || t % 1000 !== 0) throw new RangeError("A receipt's stamp is a whole second (FR-BID-002).");
  if (!Number.isInteger(i.sequence) || i.sequence < 1) throw new RangeError("A receipt's sequence is a whole number from 1.");
  for (const d of [i.keyFingerprint, i.manifestCipherSha256, i.declarationCipherSha256, ...i.fileCipherSha256s]) {
    if (!SHA256_HEX.test(d)) throw new RangeError("A receipt's digests are SHA-256, as 64 lower-case hex digits.");
  }
  const encoding = JSON.stringify([RECEIPT_DIGEST_VERSION, i.exerciseId, i.sequence, i.receivedAt.toISOString(), i.keyFingerprint, i.manifestCipherSha256, i.declarationCipherSha256, [...i.fileCipherSha256s].sort()]);
  return createHash("sha256").update(encoding, "utf8").digest("hex");
}

/// In English and Malay (ruling 20ab): the Malay says no more than the English. The digest itself is shown beside these words, in full, never translated.
export const RECEIPT_WORDS: { title: Words; meaning: Words } = {  // never "signed" / "proof" (scan), in either language
  title: w("Your receipt", "Resit anda"),
  meaning: w(
    "It records what the portal told you when you submitted: your submission's number, the time the server stamped, the key your bid was sealed to, and a digest of what was stored. Print it or save it. From the opening's start, My Bids shows the digest that was listed and opened, for you to compare with this one.",
    "Resit ini merekodkan apa yang dimaklumkan oleh portal kepada anda semasa anda menyerahkan: nombor penyerahan anda, masa yang dicap oleh pelayan, kunci yang digunakan untuk memeterai bida anda, dan cincangan bagi apa yang disimpan. Cetak atau simpan resit ini. Mulai pembukaan bermula, Bida Saya menunjukkan cincangan yang disenaraikan dan dibuka, untuk anda bandingkan dengan cincangan ini.",
  ),
};
