import { createHmac, timingSafeEqual } from "node:crypto";

import { FORM_TOKEN_MAX_AGE_MS } from "./form-token-shape";

/**
 * The signed form token on the portal's forms (Phase 4a; the plan: "a signed form token, server secret from the environment, on the portal forms").
 *
 * A page the server rendered carries a token it signed: the purpose of the form, and the moment it was made. The route that takes the form's POST refuses one that
 * has no token, a token for another form, a token that was not signed with this deployment's key, or one that is too old. It is not a session and it names nobody, so
 * it stops nothing a person at a browser can do. What it stops is a script that POSTs to the route blind, without ever having asked for the page, and a form
 * re-used long after it was made. It sits beside the Origin guard, never instead of it.
 *
 * Pure: the key, the clock and the token are passed in. The key itself (`PORTAL_FORM_SECRET`) is read by `form-secret.ts`.
 */

/// The hidden field a form carries its token in.
export const FORM_TOKEN_FIELD = "formToken";

/// The forms that carry a token. A token for one is no good for another.
/// "registration" (Phase 4b): the signed-in supplier's registration wizard, one token for its saves, uploads, searches, downloads and the final send.
/// "company" (Phase 4c): the signed-in supplier's Company workspace, one token for its two uploads (a replacement document, a change of bank details).
/// "bids" (Phase 4d): the signed-in supplier's My Bids workspace, one token for its sign-ups, acknowledgements and requests.
/// "data-export" (N2): the signed-in supplier's download of its own data as a file; the link on the printable page carries one.
export type FormPurpose = "register" | "sign-in" | "activate" | "reset" | "account" | "registration" | "company" | "bids" | "projects" | "data-export";
export const FORM_PURPOSES: readonly FormPurpose[] = ["register", "sign-in", "activate", "reset", "account", "registration", "company", "bids", "projects", "data-export"];

/// How long a token is good for: defined with the token's header in `form-token-shape.ts`, which the browser may import.
export { FORM_TOKEN_MAX_AGE_MS };

/// A token made a moment ahead of this instance's clock is the other instance's clock, not a forgery: a minute is allowed.
export const FORM_TOKEN_SKEW_MS = 60 * 1000;

/// The shortest key accepted. A shorter one is refused as not set, never used.
export const FORM_SECRET_MIN_LENGTH = 32;

export type FormTokenVerdict = "OK" | "MISSING" | "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "FROM_THE_FUTURE" | "KEY_NOT_SET";

/// ADR 0041 D8: the forms whose token is spent once used, and so must differ between two pages rendered in the same millisecond. Their token carries a random nonce, signed with the rest.
export const NONCE_PURPOSES: readonly FormPurpose[] = ["register"];
/// 16 random bytes in base64url, made by `issueFormToken` (the caller's randomness: this module stays pure).
export const FORM_NONCE = /^[A-Za-z0-9_-]{22}$/;

const needsNonce = (purpose: FormPurpose) => NONCE_PURPOSES.includes(purpose);

const mac = (secret: string, purpose: FormPurpose, issuedAt: number, nonce: string | null) =>
  createHmac("sha256", secret).update(nonce == null ? `perolehan-form|${purpose}|${issuedAt}` : `perolehan-form|${purpose}|${issuedAt}|${nonce}`, "utf8").digest("base64url");

export const keyIsUsable = (secret: string | null | undefined): secret is string => typeof secret === "string" && secret.length >= FORM_SECRET_MIN_LENGTH;

/// A token for a form rendered at `now`: the moment, and a signature over the purpose and the moment. A `register` token also carries a nonce (`issuedAt.nonce.mac`), signed with them; every other
/// purpose has none, and is given none.
export function signFormToken(secret: string, purpose: FormPurpose, now: Date, nonce?: string): string {
  const issuedAt = now.getTime();
  if (needsNonce(purpose)) {
    if (nonce == null || !FORM_NONCE.test(nonce)) throw new Error(`A ${purpose} token needs a nonce of 16 random bytes in base64url.`);
    return `${issuedAt}.${nonce}.${mac(secret, purpose, issuedAt, nonce)}`;
  }
  if (nonce != null) throw new Error(`A ${purpose} token carries no nonce.`);
  return `${issuedAt}.${mac(secret, purpose, issuedAt, null)}`;
}

/// When a token says it was made, or null where it is not of this purpose's shape. Trusted only once `verifyFormToken` has accepted the token (the moment is signed with it).
export function formTokenIssuedAt(purpose: FormPurpose, token: string): Date | null {
  const m = (needsNonce(purpose) ? /^(\d{1,15})\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/ : /^(\d{1,15})\.[A-Za-z0-9_-]{43}$/).exec(token);
  return m ? new Date(Number(m[1])) : null;
}

export function verifyFormToken(secret: string | null | undefined, purpose: FormPurpose, token: string | null | undefined, now: Date): FormTokenVerdict {
  if (!keyIsUsable(secret)) return "KEY_NOT_SET";
  if (token == null || token === "") return "MISSING";
  // A `register` token without its nonce, or another form's token with one, is not this form's shape.
  const m = needsNonce(purpose) ? /^(\d{1,15})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token) : /^(\d{1,15})\.()([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return "MALFORMED";
  const issuedAt = Number(m[1]);
  const given = Buffer.from(m[3]);
  const expected = Buffer.from(mac(secret, purpose, issuedAt, needsNonce(purpose) ? m[2] : null));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "BAD_SIGNATURE";
  // The signature is checked first, so a forged time is never reported as anything but a bad signature.
  if (issuedAt - now.getTime() > FORM_TOKEN_SKEW_MS) return "FROM_THE_FUTURE";
  if (now.getTime() - issuedAt > FORM_TOKEN_MAX_AGE_MS) return "EXPIRED";
  return "OK";
}
