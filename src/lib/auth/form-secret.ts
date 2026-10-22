import { randomBytes } from "node:crypto";

import { keyIsUsable, NONCE_PURPOSES, signFormToken, verifyFormToken, type FormPurpose, type FormTokenVerdict } from "./form-token";

/**
 * The deployment's form key (`PORTAL_FORM_SECRET`, Phase 4a): deployment configuration, not customer policy, so it comes from the environment and is never in the
 * database or the repository. Unset, or shorter than the least accepted, it is "not set": the portal's forms are closed and say so, and nothing is signed with a
 * default. Changing it only retires the forms already on screen.
 */

export const FORM_SECRET_ENV = "PORTAL_FORM_SECRET";

export function formSecret(env: Record<string, string | undefined> = process.env): string | null {
  const v = env[FORM_SECRET_ENV];
  return keyIsUsable(v) ? v : null;
}

/// A token for a form being rendered now, or null where the key is not set (the page then shows the form closed). A `register` token gets 16 fresh random bytes as its nonce (ADR 0041
/// D8), so two pages rendered in the same millisecond never share one.
export function issueFormToken(purpose: FormPurpose, now: Date = new Date(), secret: string | null = formSecret()): string | null {
  if (!secret) return null;
  return NONCE_PURPOSES.includes(purpose) ? signFormToken(secret, purpose, now, randomBytes(16).toString("base64url")) : signFormToken(secret, purpose, now);
}

export function checkFormToken(purpose: FormPurpose, token: string | null | undefined, now: Date = new Date(), secret: string | null = formSecret()): FormTokenVerdict {
  return verifyFormToken(secret, purpose, token, now);
}
