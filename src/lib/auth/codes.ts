import { createHash, randomBytes } from "node:crypto";

/**
 * One-time codes (ADR 0034 D6): 128 random bits, shown once in groups, held only as SHA-256. An officer hands the code
 * over by hand (a letter, a call): the system never sends one. Anyone who guesses a 128-bit code has guessed a secret, so
 * the code is stored as a plain hash (a slow hash buys nothing against that) and looked up by it.
 *
 * Crockford's base32, so a code read down a telephone has no 0 and O, 1 and I and L to confuse.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/// 26 characters carry 130 bits: the 128 random ones, and two spare bits that are zero.
const CODE_CHARS = 26;
const GROUP = 4;

function encode(bytes: Buffer): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  bits = bits.padEnd(CODE_CHARS * 5, "0");
  let out = "";
  for (let i = 0; i < CODE_CHARS; i++) out += ALPHABET[parseInt(bits.slice(i * 5, i * 5 + 5), 2)];
  return out;
}

/// Groups of four, hyphen-separated: how it is read out and written down.
export function formatCode(code: string): string {
  return (code.match(new RegExp(`.{1,${GROUP}}`, "g")) ?? []).join("-");
}

/// A new code, un-grouped. Its entropy is the random bytes it is made from.
export function generateCode(random: (n: number) => Buffer = randomBytes): string {
  return encode(random(16));
}

/**
 * What was typed, brought to the canonical form the hash is taken of: spaces and hyphens dropped, upper case, and the
 * look-alike letters read as Crockford reads them (O as 0, I and L as 1). Null where it cannot be a code at all.
 */
export function normaliseCode(typed: string): string | null {
  const c = typed.toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return c.length === CODE_CHARS && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

export function hashCode(normalised: string): string {
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

export type CodeVerdict = "VALID" | "USED" | "EXPIRED";

export function codeVerdict(code: { usedAt: Date | null; expiresAt: Date }, now: Date): CodeVerdict {
  if (code.usedAt) return "USED";
  if (now.getTime() >= code.expiresAt.getTime()) return "EXPIRED";
  return "VALID";
}

export function codeExpiry(now: Date, validityMinutes: number): Date {
  return new Date(now.getTime() + validityMinutes * 60_000);
}
