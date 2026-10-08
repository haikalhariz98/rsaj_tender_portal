/**
 * The session cookie as a header (ADR 0034 D4), for the supplier portal's route handlers. A route handler answers with a `Response`, and a response carries its
 * cookie as `Set-Cookie`; building the header here, from the request's `Cookie` header and the response's, keeps the handlers free of `next/headers`, so a test hands
 * them a bare `Request` and reads the `Response`.
 *
 * The attributes are the staff cookie's: `__Host-` (no Domain, Path=/, Secure), HttpOnly, SameSite=Lax. Lax is not a CSRF defence on its own, so every POST also passes
 * the Origin guard. The value is a token (base64url) or empty, so nothing needs encoding.
 */

export function sessionCookieHeader(name: string, token: string, maxAgeSeconds: number): string {
  return `${name}=${token}; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/// A `__Host-` cookie is cleared by setting it again with the same attributes and no life.
export function clearedCookieHeader(name: string): string {
  return sessionCookieHeader(name, "", 0);
}

/// The value of one cookie in a `Cookie` request header, or null. The first of the name wins, as a browser sends the most specific first.
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}
