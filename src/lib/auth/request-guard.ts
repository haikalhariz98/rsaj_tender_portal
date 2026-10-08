import { parseAllowedOrigins } from "./allowed-origins";
import { originFault, type OriginFault } from "./origin";
import { trustedProxyHops } from "./request";

/**
 * The Origin guard for a route handler that has the `Request` in hand (`assertSameOrigin`, ADR 0034 D7): the supplier portal's handlers, which answer strangers and
 * people signed in as suppliers on the public copy. It is `refuseForeignPost` of the staff side (`src/app/_auth/cookies.ts`) without `next/headers`, so a handler's
 * test can hand it a bare `Request`; both read the same two environment settings through the same parsers and the same rule (`originFault`).
 *
 * A handler that changes anything names the content types it accepts. `text/plain` (the type a cross-site HTML form can send without a preflight) is never among them.
 */
export function foreignRequestFault(request: Request, contentTypes: readonly string[], env: Record<string, string | undefined> = process.env): OriginFault | null {
  return originFault({
    method: request.method,
    header: (name) => request.headers.get(name),
    contentTypes,
    trustForwardedHost: trustedProxyHops(env.TRUSTED_PROXY_HOPS) != null,
    allowedHosts: parseAllowedOrigins(env.SERVER_ACTION_ALLOWED_ORIGINS).hosts,
  });
}
