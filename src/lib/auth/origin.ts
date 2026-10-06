/**
 * The guard on every POST (ADR 0034 D4, D7; threat model F9).
 *
 * The session cookie is SameSite=Lax, which stops most cross-site posts but not all (a sibling subdomain is the same
 * site), so every state-changing request must also pass this: it came from a page of this origin. Pure: it takes the
 * request's headers as a lookup and returns a fault or null.
 *
 * Server actions pass `contentTypes: null`: a server action's own body is multipart or text/plain by design, and Next
 * checks its Origin against its Host as well. A route handler names the types it accepts, and `text/plain` (the type a
 * cross-site HTML form can send without a preflight) is never among them.
 */

export interface OriginFault {
  code: "CROSS_SITE" | "NO_ORIGIN" | "WRONG_ORIGIN" | "WRONG_CONTENT_TYPE";
  message: string;
}

export interface OriginCheck {
  method: string;
  header: (name: string) => string | null;
  /// The content types the route accepts, or null where the request's body is not the route's to judge (a server action).
  contentTypes: readonly string[] | null;
  /// Whether `X-Forwarded-Host` may be believed: only behind a proxy the deployment trusts (`TRUSTED_PROXY_HOPS`).
  trustForwardedHost?: boolean;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function originFault(check: OriginCheck): OriginFault | null {
  if (SAFE.has(check.method.toUpperCase())) return null;

  const site = check.header("sec-fetch-site");
  // `same-origin` is a page of this origin. `none` is the address bar, which never posts. Anything else is another site.
  if (site != null && site !== "same-origin") return { code: "CROSS_SITE", message: "The request came from another site." };

  const origin = check.header("origin");
  if (origin == null) {
    // A browser always sends Origin on a POST. Sec-Fetch-Site same-origin alone is enough from one that does not.
    if (site !== "same-origin") return { code: "NO_ORIGIN", message: "The request does not say where it came from." };
  } else {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return { code: "WRONG_ORIGIN", message: "The request's origin is not an address." };
    }
    const forwarded = check.trustForwardedHost ? check.header("x-forwarded-host") : null;
    const host = (forwarded ?? check.header("host") ?? "").split(",")[0].trim();
    if (host === "" || originHost.toLowerCase() !== host.toLowerCase()) return { code: "WRONG_ORIGIN", message: "The request came from a different address than the one it was sent to." };
  }

  if (check.contentTypes) {
    const type = (check.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!check.contentTypes.includes(type)) return { code: "WRONG_CONTENT_TYPE", message: "The request's content type is not accepted here." };
  }
  return null;
}
