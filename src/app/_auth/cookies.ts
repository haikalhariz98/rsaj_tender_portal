import { cookies, headers } from "next/headers";

import { parseAllowedOrigins } from "@/lib/auth/allowed-origins";
import { originFault, type OriginFault } from "@/lib/auth/origin";
import { requestFacts, trustedProxyHops, type RequestFacts } from "@/lib/auth/request";
import { STAFF_COOKIE } from "@/lib/auth/routes";

/**
 * The staff session cookie and what a request says about itself (ADR 0034 D4).
 *
 * `__Host-` ties the cookie to this exact host with no Domain and Path=/, and requires Secure. HttpOnly keeps it from a script. SameSite=Lax is
 * not a CSRF defence on its own (a sibling subdomain is the same site), so every POST also passes `refuseForeignPost` below. Browsers accept a
 * Secure cookie on http://localhost (not on 127.0.0.1 or a LAN address), so development works there; a deployment needs HTTPS.
 *
 * `cookies().set` and `.delete` work only in a Server Function or a Route Handler, never while a page renders: only the sign-in, sign-out and
 * password actions call them. Reading works anywhere.
 */

export { STAFF_COOKIE };

export async function staffToken(): Promise<string | null> {
  return (await cookies()).get(STAFF_COOKIE)?.value ?? null;
}

export async function setStaffCookie(token: string, maxAgeSeconds: number): Promise<void> {
  (await cookies()).set({ name: STAFF_COOKIE, value: token, httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: maxAgeSeconds });
}

export async function clearStaffCookie(): Promise<void> {
  const store = await cookies();
  // A __Host- cookie is deleted by setting it again with the same attributes and no life.
  store.set({ name: STAFF_COOKIE, value: "", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/// The source address (where the deployment says how to read it) and the user agent of the request being served.
export async function currentRequestFacts(): Promise<RequestFacts> {
  const h = await headers();
  return requestFacts((name) => h.get(name));
}

/**
 * The guard on a server action (ADR D7): the request came from a page of this origin. A route handler passes the content types it accepts as
 * `contentTypes`; a server action passes null, since its body is multipart or text/plain by design and Next checks its Origin as well.
 */
export async function refuseForeignPost(contentTypes: readonly string[] | null = null): Promise<OriginFault | null> {
  const h = await headers();
  return originFault({
    method: "POST",
    header: (name) => h.get(name),
    contentTypes,
    trustForwardedHost: trustedProxyHops(process.env.TRUSTED_PROXY_HOPS) != null,
    // The same list Next's own check reads (next.config.ts), through the same parser.
    allowedHosts: parseAllowedOrigins(process.env.SERVER_ACTION_ALLOWED_ORIGINS).hosts,
  });
}
