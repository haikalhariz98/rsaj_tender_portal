/**
 * What the browser may know of a signed form token (ADR 0041 D8): the header it rides in, how long it is good for, and when it says it was made. No key and no signature: those are the
 * server's (`form-token.ts`, `node:crypto`). Defined once here, so the server's guards and the public registration form name the same header and the same age. Pure, and safe for the browser.
 */

/// The header a multipart upload or a search carries its form token in: the token cannot ride in a body that is not read until the guards have passed.
export const FORM_TOKEN_HEADER = "x-form-token";

/// How long a token is good for. A technical bound, not a customer's policy: a form left open for longer than a working day is simply rendered again. Logged as an
/// assumption in the decisions log.
export const FORM_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/// When a token says it was made, in milliseconds, or null where it does not start with a moment. Unchecked: the browser uses it only to ask for a fresh token before an old one is
/// refused, and the server judges the token itself.
export function formTokenMadeAt(token: string): number | null {
  const m = /^(\d{1,15})\./.exec(token);
  return m ? Number(m[1]) : null;
}
