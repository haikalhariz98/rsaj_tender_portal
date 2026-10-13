/**
 * HPKE base mode (RFC 9180, mode 0), DHKEM(X25519, HKDF-SHA256) with HKDF-SHA256 (ADR 0036 D2). Node has no built-in HPKE, so this is composed from `x25519`
 * (`diffieHellman`) and `createHmac`: HKDF Extract and Expand, LabeledExtract and LabeledExpand, the KEM's Encap and Decap, and the key schedule. The AEAD is a
 * parameter, so the suite's AES-128-GCM vectors (RFC 9180 appendix A.1) run through the same code as the product's AES-256-GCM.
 *
 * It is checked against the published vectors (`hpke.test.ts`): the CFRG test-vectors.json entries for X25519 / HKDF-SHA256 with AES-128-GCM and AES-256-GCM,
 * every sequence number and every exported secret. The product seals single-shot (sequence 0) with info = aad = the canonical AAD (`aad.ts`).
 *
 * The opening functions are internal to `src/lib/sealing/`: a caller outside it opens through `open.ts`.
 */

import { createHmac, randomBytes } from "node:crypto";

import { aadBytes } from "./aad";
import { aeadOpen, aeadSeal, type AeadAlgorithm } from "./aead";
import { SealError, type AadContext, type Bytes, type HpkeSealed } from "./types";
import { publicOf, x25519, X25519_KEY_BYTES } from "./x25519";

export interface HpkeAead {
  /// The AEAD's identifier in RFC 9180 section 7.3.
  id: number;
  algorithm: AeadAlgorithm;
  /// Nk and Nn.
  keyBytes: number;
  nonceBytes: number;
}
export const AES_128_GCM: HpkeAead = { id: 0x0001, algorithm: "aes-128-gcm", keyBytes: 16, nonceBytes: 12 };
export const AES_256_GCM: HpkeAead = { id: 0x0002, algorithm: "aes-256-gcm", keyBytes: 32, nonceBytes: 12 };

const KEM_ID = 0x0020; // DHKEM(X25519, HKDF-SHA256)
const KDF_ID = 0x0001; // HKDF-SHA256
const NH = 32; // HKDF-SHA256's output size
const NSECRET = 32;
const NENC = X25519_KEY_BYTES;
const MODE_BASE = 0x00;
const TAG_BYTES = 16;

const ascii = (s: string) => new Uint8Array(Buffer.from(s, "ascii"));
const concat = (...parts: Bytes[]) => new Uint8Array(Buffer.concat(parts));
export function i2osp(n: number, length: number): Bytes {
  if (!Number.isSafeInteger(n) || n < 0) throw new SealError("FORMAT");
  const out = new Uint8Array(length);
  let v = n;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  if (v !== 0) throw new SealError("FORMAT");
  return out;
}

// ------------------------------------------------------------------ HKDF-SHA256 (RFC 5869), from HMAC

export function hkdfExtract(salt: Bytes, ikm: Bytes): Bytes {
  return new Uint8Array(createHmac("sha256", salt.length > 0 ? salt : new Uint8Array(NH)).update(ikm).digest());
}

export function hkdfExpand(prk: Bytes, info: Bytes, length: number): Bytes {
  if (length > 255 * NH) throw new SealError("LENGTH");
  const out = new Uint8Array(length);
  let t: Bytes = new Uint8Array(0);
  for (let i = 1, filled = 0; filled < length; i++) {
    t = new Uint8Array(createHmac("sha256", prk).update(t).update(info).update(Uint8Array.of(i)).digest());
    out.set(t.subarray(0, Math.min(NH, length - filled)), filled);
    filled += NH;
  }
  return out;
}

// ------------------------------------------------------------------ the labelled functions (RFC 9180 section 4)

const KEM_SUITE = concat(ascii("KEM"), i2osp(KEM_ID, 2));
const hpkeSuite = (aead: HpkeAead) => concat(ascii("HPKE"), i2osp(KEM_ID, 2), i2osp(KDF_ID, 2), i2osp(aead.id, 2));

export const labeledExtract = (suite: Bytes, salt: Bytes, label: string, ikm: Bytes) => hkdfExtract(salt, concat(ascii("HPKE-v1"), suite, ascii(label), ikm));
export const labeledExpand = (suite: Bytes, prk: Bytes, label: string, info: Bytes, length: number) =>
  hkdfExpand(prk, concat(i2osp(length, 2), ascii("HPKE-v1"), suite, ascii(label), info), length);

// ------------------------------------------------------------------ DHKEM(X25519, HKDF-SHA256) (RFC 9180 section 4.1)

const EMPTY = new Uint8Array(0);

function extractAndExpand(dh: Bytes, kemContext: Bytes): Bytes {
  const eaePrk = labeledExtract(KEM_SUITE, EMPTY, "eae_prk", dh);
  return labeledExpand(KEM_SUITE, eaePrk, "shared_secret", kemContext, NSECRET);
}

/// DeriveKeyPair (RFC 9180 section 7.1.3, X25519): the test vectors' deterministic keys.
export function deriveKeyPair(ikm: Bytes): { privateKey: Bytes; publicKey: Bytes } {
  const dkpPrk = labeledExtract(KEM_SUITE, EMPTY, "dkp_prk", ikm);
  const privateKey = labeledExpand(KEM_SUITE, dkpPrk, "sk", EMPTY, X25519_KEY_BYTES);
  return { privateKey, publicKey: publicOf(privateKey) };
}

/// Encap with a given ephemeral key (the test vectors' skEm), or a fresh random one.
export function encap(recipientPublic: Bytes, ephemeralPrivate?: Bytes): { sharedSecret: Bytes; enc: Bytes } {
  const skE = ephemeralPrivate ?? new Uint8Array(randomBytes(X25519_KEY_BYTES));
  const enc = publicOf(skE);
  const dh = x25519(skE, recipientPublic);
  const sharedSecret = extractAndExpand(dh, concat(enc, recipientPublic));
  dh.fill(0);
  if (!ephemeralPrivate) skE.fill(0);
  return { sharedSecret, enc };
}

export function decap(enc: Bytes, recipientPrivate: Bytes): Bytes {
  if (enc.length !== NENC) throw new SealError("LENGTH");
  const dh = x25519(recipientPrivate, enc);
  const sharedSecret = extractAndExpand(dh, concat(enc, publicOf(recipientPrivate)));
  dh.fill(0);
  return sharedSecret;
}

// ------------------------------------------------------------------ the key schedule, base mode (RFC 9180 section 5.1)

export interface HpkeContext {
  key: Bytes;
  baseNonce: Bytes;
  exporterSecret: Bytes;
  aead: HpkeAead;
}

export function keyScheduleBase(aead: HpkeAead, sharedSecret: Bytes, info: Bytes): HpkeContext {
  const suite = hpkeSuite(aead);
  const pskIdHash = labeledExtract(suite, EMPTY, "psk_id_hash", EMPTY);
  const infoHash = labeledExtract(suite, EMPTY, "info_hash", info);
  const context = concat(Uint8Array.of(MODE_BASE), pskIdHash, infoHash);
  const secret = labeledExtract(suite, sharedSecret, "secret", EMPTY);
  const out = {
    key: labeledExpand(suite, secret, "key", context, aead.keyBytes),
    baseNonce: labeledExpand(suite, secret, "base_nonce", context, aead.nonceBytes),
    exporterSecret: labeledExpand(suite, secret, "exp", context, NH),
    aead,
  };
  secret.fill(0);
  return out;
}

/// The nonce for a sequence number: base_nonce XOR I2OSP(seq, Nn).
export function nonceFor(ctx: HpkeContext, seq: number): Bytes {
  const s = i2osp(seq, ctx.aead.nonceBytes);
  return ctx.baseNonce.map((b, i) => b ^ s[i]);
}

export function contextSeal(ctx: HpkeContext, seq: number, aad: Bytes, plaintext: Bytes): Bytes {
  const { ct, tag } = aeadSeal(ctx.aead.algorithm, ctx.key, nonceFor(ctx, seq), aad, plaintext);
  return concat(ct, tag);
}

export function contextOpen(ctx: HpkeContext, seq: number, aad: Bytes, sealed: Bytes): Bytes {
  if (sealed.length < TAG_BYTES) throw new SealError("LENGTH");
  return aeadOpen(ctx.aead.algorithm, ctx.key, nonceFor(ctx, seq), aad, sealed.subarray(0, sealed.length - TAG_BYTES), sealed.subarray(sealed.length - TAG_BYTES));
}

/// Export (RFC 9180 section 5.3).
export const contextExport = (ctx: HpkeContext, exporterContext: Bytes, length: number) => labeledExpand(hpkeSuite(ctx.aead), ctx.exporterSecret, "sec", exporterContext, length);

// ------------------------------------------------------------------ single-shot base mode (RFC 9180 section 6.1)

export function sealBase(aead: HpkeAead, recipientPublic: Bytes, info: Bytes, aad: Bytes, plaintext: Bytes, ephemeralPrivate?: Bytes): HpkeSealed {
  const { sharedSecret, enc } = encap(recipientPublic, ephemeralPrivate);
  const ctx = keyScheduleBase(aead, sharedSecret, info);
  sharedSecret.fill(0);
  try {
    return { enc, ct: contextSeal(ctx, 0, aad, plaintext) };
  } finally {
    ctx.key.fill(0);
    ctx.exporterSecret.fill(0);
  }
}

export function openBase(aead: HpkeAead, recipientPrivate: Bytes, info: Bytes, aad: Bytes, sealed: HpkeSealed): Bytes {
  const sharedSecret = decap(sealed.enc, recipientPrivate);
  const ctx = keyScheduleBase(aead, sharedSecret, info);
  sharedSecret.fill(0);
  try {
    return contextOpen(ctx, 0, aad, sealed.ct);
  } finally {
    ctx.key.fill(0);
    ctx.exporterSecret.fill(0);
  }
}

// ------------------------------------------------------------------ the product's suite: AES-256-GCM, info = aad = the canonical AAD

export function hpkeSeal(recipientPublic: Bytes, plaintext: Bytes, aad: AadContext): HpkeSealed {
  const bound = aadBytes(aad);
  return sealBase(AES_256_GCM, recipientPublic, bound, bound, plaintext);
}

/// The opening of `hpkeSeal`, for `open.ts` and the share combination inside this module.
export function hpkeOpenWithin(recipientPrivate: Bytes, sealed: HpkeSealed, aad: AadContext): Bytes {
  const bound = aadBytes(aad);
  return openBase(AES_256_GCM, recipientPrivate, bound, bound, sealed);
}

/// The stored form of an HPKE ciphertext: enc || ct.
export function packHpke(s: HpkeSealed): Bytes {
  if (s.enc.length !== NENC) throw new SealError("LENGTH");
  return concat(s.enc, s.ct);
}
export function unpackHpke(b: Bytes): HpkeSealed {
  if (b.length < NENC + TAG_BYTES) throw new SealError("LENGTH");
  return { enc: b.slice(0, NENC), ct: b.slice(NENC) };
}
