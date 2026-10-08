import { createHmac, timingSafeEqual } from "node:crypto";

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
export type FormPurpose = "register" | "sign-in" | "activate" | "reset" | "account";
export const FORM_PURPOSES: readonly FormPurpose[] = ["register", "sign-in", "activate", "reset", "account"];

/// How long a token is good for. A technical bound, not a customer's policy: a form left open for longer than a working day is simply rendered again. Logged as an
/// assumption in the decisions log.
export const FORM_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/// A token made a moment ahead of this instance's clock is the other instance's clock, not a forgery: a minute is allowed.
export const FORM_TOKEN_SKEW_MS = 60 * 1000;

/// The shortest key accepted. A shorter one is refused as not set, never used.
export const FORM_SECRET_MIN_LENGTH = 32;

export type FormTokenVerdict = "OK" | "MISSING" | "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "FROM_THE_FUTURE" | "KEY_NOT_SET";

const mac = (secret: string, purpose: FormPurpose, issuedAt: number) => createHmac("sha256", secret).update(`perolehan-form|${purpose}|${issuedAt}`, "utf8").digest("base64url");

export const keyIsUsable = (secret: string | null | undefined): secret is string => typeof secret === "string" && secret.length >= FORM_SECRET_MIN_LENGTH;

/// A token for a form rendered at `now`: the moment, and a signature over the purpose and the moment.
export function signFormToken(secret: string, purpose: FormPurpose, now: Date): string {
  const issuedAt = now.getTime();
  return `${issuedAt}.${mac(secret, purpose, issuedAt)}`;
}

export function verifyFormToken(secret: string | null | undefined, purpose: FormPurpose, token: string | null | undefined, now: Date): FormTokenVerdict {
  if (!keyIsUsable(secret)) return "KEY_NOT_SET";
  if (token == null || token === "") return "MISSING";
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return "MALFORMED";
  const issuedAt = Number(m[1]);
  const given = Buffer.from(m[2]);
  const expected = Buffer.from(mac(secret, purpose, issuedAt));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "BAD_SIGNATURE";
  // The signature is checked first, so a forged time is never reported as anything but a bad signature.
  if (issuedAt - now.getTime() > FORM_TOKEN_SKEW_MS) return "FROM_THE_FUTURE";
  if (now.getTime() - issuedAt > FORM_TOKEN_MAX_AGE_MS) return "EXPIRED";
  return "OK";
}
