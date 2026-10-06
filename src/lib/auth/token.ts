import { createHash, randomBytes } from "node:crypto";

/**
 * Session tokens (ADR 0034 D4): 256 random bits, carried only by the cookie. The database holds the SHA-256 of the token and
 * nothing else, so a copy of the table cannot be used to sign in. The token is high-entropy, so a plain hash is the right one.
 */

export function newToken(random: (n: number) => Buffer = randomBytes): string {
  return random(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/// A cookie value that could be a token: 43 characters of base64url. Anything else is not looked up.
export function looksLikeToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
