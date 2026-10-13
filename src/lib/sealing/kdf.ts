/**
 * An opening officer's key, wrapped under their unseal passphrase (ADR 0036 D2, D4, ruling 20v).
 *
 * The key-encryption key is scrypt(input, salt), N = 2^17, r = 8, p = 1, a 16-byte salt, where input is the passphrase, or HMAC-SHA256(pepper, passphrase) when the
 * deployment's pepper is configured (`SEALING_PEPPER`; required under LIVE, absent only under DEMONSTRATION). The wrap stores its parameters and the pepper's id,
 * and an unwrap reads them from the wrap, never from these constants. The private key is sealed with AES-256-GCM under the derived key.
 *
 * scrypt at these parameters takes 128 MiB, so the derivation runs with `maxmem` of 256 MiB and at most two at once (a queue): a burst of officers cannot exhaust
 * the server's memory.
 *
 * A pepper the deployment does not hold is not a wrong passphrase (20v): `pepperFault` is checked first by the caller, with its own fault, never counted toward the
 * passphrase lockout and never worded as a wrong passphrase. `unwrapKey` returns null for a wrong passphrase ONLY, and throws SealError("PEPPER") when it is handed a
 * pepper that is not the wrap's: that is a programming error, never a guess.
 */

import { createHmac, randomBytes, scrypt as scryptCallback } from "node:crypto";

import { gcmOpenWithin, gcmSeal } from "./aead";
import { SealError, type AadContext, type Bytes, type ScryptParams, type WrappedKey } from "./types";

/// ADR 0036 D2's parameters for a new wrap. An unwrap reads the wrap's own.
export const SCRYPT_LOG2N = 17;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_SALT_BYTES = 16;
export const SCRYPT_MAXMEM = 256 * 1024 * 1024;
/// How many derivations run at once in this process; the rest wait their turn.
export const KDF_MAX_CONCURRENT = 2;
/// The shortest pepper accepted: 32 bytes (the deployment reader refuses a shorter one too).
export const PEPPER_MIN_BYTES = 32;
const KEK_BYTES = 32;

/// What the act says when the wrap's pepper is not the one this deployment holds (20v). It never says the passphrase is wrong, and it is never counted.
export const PEPPER_NOT_HELD_WORDS =
  "This exercise was sealed under a pepper this copy of the system does not hold, so the key cannot be unlocked here. Whoever runs the system must restore that pepper. Nothing was counted against the officer's passphrase.";

// ------------------------------------------------------------------ the queue

let running = 0;
let peak = 0;
const waiting: (() => void)[] = [];

/// Runs `work` in one of the slots, waiting its turn in arrival order. Exported for the queue's own test.
export async function withKdfSlot<T>(work: () => Promise<T>): Promise<T> {
  if (running < KDF_MAX_CONCURRENT) running++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  peak = Math.max(peak, running);
  try {
    return await work();
  } finally {
    // Security audit 6: the slot passes straight to the first waiter, and `running` does not drop, so an arrival before the waiter resumes finds none free.
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

/// For the tests: the most derivations seen running at once since the last reset.
export const kdfPeak = () => peak;
export const resetKdfPeak = () => {
  peak = running;
};

// ------------------------------------------------------------------ the derivation

/// The parameters a wrap may carry: refused as FORMAT when out of range or over the memory cap, so a forged row cannot make the server spend without bound.
function checkParams(p: ScryptParams): void {
  const ok = Number.isInteger(p.log2N) && p.log2N >= 1 && p.log2N <= 20 && Number.isInteger(p.r) && p.r >= 1 && p.r <= 32 && Number.isInteger(p.p) && p.p >= 1 && p.p <= 16;
  if (!ok || 128 * p.r * 2 ** p.log2N > SCRYPT_MAXMEM) throw new SealError("FORMAT");
  if (p.salt.length !== SCRYPT_SALT_BYTES) throw new SealError("LENGTH");
}

/// scrypt itself, with the module's memory cap and queue. Exported for the RFC 7914 vectors, which use other salts and lengths.
export function scryptRaw(password: Bytes, salt: Bytes, length: number, params: { log2N: number; r: number; p: number }): Promise<Bytes> {
  return withKdfSlot(
    () =>
      new Promise<Bytes>((resolve, reject) =>
        scryptCallback(password, salt, length, { N: 2 ** params.log2N, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM }, (err, key) => (err ? reject(err) : resolve(new Uint8Array(key)))),
      ),
  );
}

/// The passphrase as scrypt's input: its UTF-8 bytes in Unicode normal form C (so the same passphrase typed on another keyboard is the same bytes), peppered when a
/// pepper is given.
export function kdfInput(passphrase: string, pepper: { id: string; key: Bytes } | null): Bytes {
  const utf8 = new Uint8Array(Buffer.from(passphrase.normalize("NFC"), "utf8"));
  if (!pepper) return utf8;
  if (pepper.key.length < PEPPER_MIN_BYTES || !pepper.id) throw new SealError("PEPPER");
  const out = new Uint8Array(createHmac("sha256", pepper.key).update(utf8).digest());
  utf8.fill(0);
  return out;
}

async function deriveKek(passphrase: string, pepper: { id: string; key: Bytes } | null, params: ScryptParams): Promise<Bytes> {
  checkParams(params);
  const input = kdfInput(passphrase, pepper);
  try {
    return await scryptRaw(input, params.salt, KEK_BYTES, params);
  } finally {
    input.fill(0);
  }
}

// ------------------------------------------------------------------ wrap and unwrap

/// Wraps with given parameters: `wrapKey` uses ADR 0036 D2's, and the tests use others to show an unwrap reads the wrap's own.
export async function wrapKeyWith(params: ScryptParams, privateKey: Bytes, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<WrappedKey> {
  const kek = await deriveKek(passphrase, pepper, params);
  try {
    return { params, pepperId: pepper?.id ?? null, sealed: gcmSeal(kek, privateKey, aad) };
  } finally {
    kek.fill(0);
  }
}

export function wrapKey(privateKey: Bytes, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<WrappedKey> {
  const params: ScryptParams = { log2N: SCRYPT_LOG2N, r: SCRYPT_R, p: SCRYPT_P, salt: new Uint8Array(randomBytes(SCRYPT_SALT_BYTES)) };
  return wrapKeyWith(params, privateKey, passphrase, pepper, aad);
}

/// 20v: checked FIRST, before any unwrap. A wrap made with a pepper needs that same pepper held; one made without needs none.
export function pepperFault(w: WrappedKey, held: { id: string } | null): "PEPPER_NOT_HELD" | null {
  if (w.pepperId === null) return null;
  return held?.id === w.pepperId ? null : "PEPPER_NOT_HELD";
}

export async function unwrapKey(w: WrappedKey, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<Bytes | null> {
  // The caller passes exactly the wrap's pepper, or none for a wrap made without one: anything else skipped `pepperFault`.
  if ((pepper?.id ?? null) !== w.pepperId) throw new SealError("PEPPER");
  const kek = await deriveKek(passphrase, pepper, w.params);
  try {
    return gcmOpenWithin(kek, w.sealed, aad);
  } catch (e) {
    if (e instanceof SealError && e.code === "TAG") return null;
    throw e;
  } finally {
    kek.fill(0);
  }
}
