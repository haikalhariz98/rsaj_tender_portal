/**
 * AES-GCM, as HPKE's AEAD and as the content cipher (ADR 0036 D2). Every key is used once, with a fresh random 96-bit IV; the tag is always 16 bytes and a shorter
 * one is refused (Node would otherwise accept a truncated tag).
 *
 * The opening functions here are internal to `src/lib/sealing/`: a caller outside it opens through `open.ts`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { aadBytes } from "./aad";
import { SealError, type AadContext, type Bytes, type GcmSealed } from "./types";

export type AeadAlgorithm = "aes-128-gcm" | "aes-256-gcm";
export const GCM_IV_BYTES = 12;
export const GCM_TAG_BYTES = 16;
const KEY_BYTES: Record<AeadAlgorithm, number> = { "aes-128-gcm": 16, "aes-256-gcm": 32 };

/// One AEAD seal with a given nonce: used by HPKE, whose nonce comes from its key schedule, and by `gcmSeal`, with a random one.
export function aeadSeal(alg: AeadAlgorithm, key: Bytes, nonce: Bytes, aad: Bytes, plaintext: Bytes): { ct: Bytes; tag: Bytes } {
  if (key.length !== KEY_BYTES[alg] || nonce.length !== GCM_IV_BYTES) throw new SealError("LENGTH");
  const c = createCipheriv(alg, key, nonce, { authTagLength: GCM_TAG_BYTES });
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { ct: new Uint8Array(ct), tag: new Uint8Array(c.getAuthTag()) };
}

/// One AEAD open. Throws SealError("TAG") when the tag does not verify (a wrong key, or any change to the nonce, the ciphertext, the tag or the AAD).
export function aeadOpen(alg: AeadAlgorithm, key: Bytes, nonce: Bytes, aad: Bytes, ct: Bytes, tag: Bytes): Bytes {
  if (key.length !== KEY_BYTES[alg] || nonce.length !== GCM_IV_BYTES || tag.length !== GCM_TAG_BYTES) throw new SealError("LENGTH");
  const d = createDecipheriv(alg, key, nonce, { authTagLength: GCM_TAG_BYTES });
  d.setAAD(aad);
  d.setAuthTag(tag);
  const out = d.update(ct);
  try {
    return new Uint8Array(Buffer.concat([out, d.final()]));
  } catch {
    out.fill(0);
    throw new SealError("TAG");
  }
}

/// AES-256-GCM under a one-use key, with a fresh random 96-bit IV and the canonical AAD.
export function gcmSeal(key: Bytes, plaintext: Bytes, aad: AadContext): GcmSealed {
  if (key.length !== KEY_BYTES["aes-256-gcm"]) throw new SealError("LENGTH");
  const iv = new Uint8Array(randomBytes(GCM_IV_BYTES));
  const { ct, tag } = aeadSeal("aes-256-gcm", key, iv, aadBytes(aad), plaintext);
  return { iv, ct, tag };
}

/// The opening of `gcmSeal`, for `open.ts` and the officer-key unwrap inside this module.
export function gcmOpenWithin(key: Bytes, sealed: GcmSealed, aad: AadContext): Bytes {
  if (key.length !== KEY_BYTES["aes-256-gcm"]) throw new SealError("LENGTH");
  return aeadOpen("aes-256-gcm", key, sealed.iv, aadBytes(aad), sealed.ct, sealed.tag);
}

/// The stored form of a GCM ciphertext: iv || ct || tag (as `OfficerExerciseKey.wrappedPrivateKey`).
export function packGcm(s: GcmSealed): Bytes {
  if (s.iv.length !== GCM_IV_BYTES || s.tag.length !== GCM_TAG_BYTES) throw new SealError("LENGTH");
  return new Uint8Array(Buffer.concat([s.iv, s.ct, s.tag]));
}
export function unpackGcm(b: Bytes): GcmSealed {
  if (b.length < GCM_IV_BYTES + GCM_TAG_BYTES) throw new SealError("LENGTH");
  return { iv: b.slice(0, GCM_IV_BYTES), ct: b.slice(GCM_IV_BYTES, b.length - GCM_TAG_BYTES), tag: b.slice(b.length - GCM_TAG_BYTES) };
}

/// Best-effort zeroing of secrets held in memory (D3). JavaScript gives no guarantee that no copy remains; this clears the buffers the module holds.
export function zero(...buffers: Bytes[]): void {
  for (const b of buffers) b.fill(0);
}
