/**
 * The exercise key split across every named officer, n-of-n by XOR (ADR 0036 D2, ruling 20k: n = `Committee.panelSize`, never a literal).
 *
 * n − 1 shares are random and the last is k XOR all of them, so any n − 1 shares say nothing about k. Recombined, k's public key is derived again and compared, in
 * constant time, with the exercise key's: a missing or altered share is refused as SHARE_MISMATCH, never used.
 *
 * X25519 clamps its scalar (RFC 7748 section 5): bits 0 to 2 of byte 0 and bits 6 and 7 of byte 31 do not change the key. An alteration confined to those bits gives
 * an equivalent key, the same public key, and opens the same ciphertexts, so the comparison cannot and need not tell it apart (`split.test.ts` shows both).
 */

import { randomBytes, timingSafeEqual } from "node:crypto";

import { SealError, type Bytes } from "./types";
import { publicOf, X25519_KEY_BYTES } from "./x25519";

export function splitKey(k: Bytes, n: number): Bytes[] {
  if (!Number.isInteger(n) || n < 2) throw new SealError("FORMAT");
  if (k.length !== X25519_KEY_BYTES) throw new SealError("LENGTH");
  const shares = Array.from({ length: n - 1 }, () => new Uint8Array(randomBytes(X25519_KEY_BYTES)));
  const last = new Uint8Array(k);
  for (const s of shares) for (let i = 0; i < last.length; i++) last[i] ^= s[i];
  return [...shares, last];
}

export function combineShares(shares: readonly Bytes[], expectedPublic: Bytes): { ok: true; k: Bytes } | { ok: false; fault: "SHARE_COUNT" | "SHARE_MISMATCH" } {
  if (shares.length < 2) return { ok: false, fault: "SHARE_COUNT" };
  if (expectedPublic.length !== X25519_KEY_BYTES || shares.some((s) => s.length !== X25519_KEY_BYTES)) return { ok: false, fault: "SHARE_MISMATCH" };
  const k = new Uint8Array(X25519_KEY_BYTES);
  for (const s of shares) for (let i = 0; i < k.length; i++) k[i] ^= s[i];
  const derived = publicOf(k);
  if (!timingSafeEqual(derived, expectedPublic)) {
    k.fill(0);
    return { ok: false, fault: "SHARE_MISMATCH" };
  }
  return { ok: true, k };
}
