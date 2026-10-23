import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { Fault } from "./types";

/**
 * Passwords (ADR 0034 D3). scrypt from node:crypto, held as a PHC-style string
 * `$scrypt$ln=15,r=8,p=3$<salt>$<hash>` so the parameters travel with the hash and can be raised later without a
 * migration (a successful sign-in then re-hashes: `needsRehash`).
 *
 * These are algorithm parameters, not customer policy. What is policy (the minimum length) comes in as an argument.
 * No composition rules, and no breached-password check: that needs an outside list, which this product does not use.
 */

export const SCRYPT = { ln: 15, r: 8, p: 3, keyBytes: 32, saltBytes: 16, maxmem: 64 * 1024 * 1024 } as const;

/// The longest password accepted, in characters. Longer is refused rather than cut.
export const PASSWORD_MAX_LENGTH = 256;
interface Parsed {
  ln: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

const B64 = (b: Buffer) => b.toString("base64url");

/// Only what this module wrote is read back, and a hash from elsewhere or damaged cannot make the server allocate without limit.
export function parseHash(stored: string): Parsed | null {
  const m = /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(stored);
  if (!m) return null;
  const ln = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  if (ln < 10 || ln > 20 || r < 1 || r > 16 || p < 1 || p > 16) return null;
  if (128 * 2 ** ln * r > SCRYPT.maxmem) return null;
  const salt = Buffer.from(m[4], "base64url");
  const hash = Buffer.from(m[5], "base64url");
  if (salt.length < 8 || hash.length < 16) return null;
  return { ln, r, p, salt, hash };
}

/// The parameters a stored hash was made with, for the trail ("ln=14,r=8,p=3"). Never the hash, the salt or any part of the key.
export function hashParameters(stored: string): string | null {
  const parsed = parseHash(stored);
  return parsed ? `ln=${parsed.ln},r=${parsed.r},p=${parsed.p}` : null;
}

/// Unicode compatibility form, so the same password typed on two keyboards is the same password.
const normalise = (password: string) => password.normalize("NFKC");

function derive(password: string, salt: Buffer, ln: number, r: number, p: number, keyBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(normalise(password), salt, keyBytes, { N: 2 ** ln, r, p, maxmem: SCRYPT.maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes);
  const key = await derive(password, salt, SCRYPT.ln, SCRYPT.r, SCRYPT.p, SCRYPT.keyBytes);
  return `$scrypt$ln=${SCRYPT.ln},r=${SCRYPT.r},p=${SCRYPT.p}$${B64(salt)}$${B64(key)}`;
}

/// Whether a stored hash was made with weaker parameters than today's, and is worth re-hashing at the next good sign-in.
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  if (!parsed) return true;
  return parsed.ln < SCRYPT.ln || parsed.r < SCRYPT.r || parsed.p < SCRYPT.p || parsed.hash.length < SCRYPT.keyBytes;
}

export async function verifyPassword(stored: string, given: string): Promise<{ ok: boolean; needsRehash: boolean }> {
  const parsed = parseHash(stored);
  if (!parsed) return { ok: false, needsRehash: false };
  const key = await derive(given, parsed.salt, parsed.ln, parsed.r, parsed.p, parsed.hash.length);
  const ok = key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
  return { ok, needsRehash: ok && needsRehash(stored) };
}

let dummy: Promise<string> | null = null;
/// A hash of nothing anyone knows, made with today's parameters. An unknown, locked or disabled name is checked against it,
/// so that the time taken does not say whether the account exists.
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(24).toString("base64url"));
  return dummy;
}

/**
 * What is wrong with a proposed password, in both languages; empty when it is acceptable.
 *
 * Length is counted in characters (code points), not bytes. `minLength` is the organisation's setting: the caller
 * refuses to get here while it is unset (policy.ts), so there is no default to fall back on.
 */
export function passwordFaults(password: string, opts: { loginName: string; minLength: number }): Fault[] {
  const faults: Fault[] = [];
  const length = [...password].length;
  if (length < opts.minLength) {
    faults.push({
      code: "TOO_SHORT",
      en: `Use at least ${opts.minLength} characters.`,
    });
  }
  if (length > PASSWORD_MAX_LENGTH) {
    faults.push({
      code: "TOO_LONG",
      en: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
    });
  }
  if (opts.loginName.trim() !== "" && normalise(password).trim().toLowerCase() === normalise(opts.loginName).trim().toLowerCase()) {
    faults.push({
      code: "SAME_AS_LOGIN",
      en: "The password must not be the same as the sign-in name.",
    });
  }
  return faults;
}
