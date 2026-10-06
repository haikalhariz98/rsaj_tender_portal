/**
 * Which door a running copy of the product is the front of.
 *
 * Sign-in does not exist yet, so nothing in the staff screens or their server actions asks who is
 * calling. The supplier portal is meant for strangers, so a copy that is reachable by them must serve
 * the portal and nothing else: no staff screen, no staff API, no staff server action. This module
 * decides that, as pure rules, and `src/proxy.ts` applies it to every request.
 *
 * `PORTAL_SURFACE` is set per running copy, never per request or per host name (a client chooses its
 * own Host header). Unset or "internal": the staff copy, which serves everything (the officers'
 * network). Anything else, including a misspelling: the public copy. A typo therefore closes the door
 * rather than opening it.
 */

export type Surface = "internal" | "public";

export const SURFACE_ENV = "PORTAL_SURFACE";

export function surfaceOf(value: string | undefined | null): Surface {
  const v = (value ?? "").trim().toLowerCase();
  return v === "" || v === "internal" ? "internal" : "public";
}

/// The public routes. One literal path each, or one id segment: nothing is matched by prefix.
const PUBLIC_PAGES = new Set(["/supplier", "/supplier/opportunities", "/supplier/results", "/supplier/register", "/supplier/bids", "/supplier/company", "/supplier/projects"]);
const OPPORTUNITY = /^\/supplier\/opportunities\/[A-Za-z0-9_-]+$/;
/// The organisation's logo, addressed by its own fingerprint.
const LOGO = /^\/organisation\/logo\/[A-Za-z0-9_-]+$/;
/// The platform's own files: scripts, styles and fonts, and nothing else under /_next. The image optimiser
/// (/_next/image) is left out on purpose: its job is to fetch other local paths, and nothing on the portal
/// needs it (the logo is a plain image, the fonts are static files).
const PLATFORM = /^\/_next\/static\//;
const ICON = "/favicon.ico";
/// The only door that accepts a write from a stranger.
export const SUBMIT_PATH = "/supplier/register/submit";

export interface PublicRequest {
  method: string;
  pathname: string;
  /// The request names a server action. The public copy has none: the one write is a route handler.
  hasServerAction: boolean;
}

/// Whether the public copy answers this request. Anything not listed is refused as not found.
export function publicAllows({ method, pathname, hasServerAction }: PublicRequest): boolean {
  if (hasServerAction) return false;
  // A trailing slash is the same page; nothing else is normalised, so an odd spelling is refused.
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const m = method.toUpperCase();
  if (m === "POST") return path === SUBMIT_PATH;
  if (m !== "GET" && m !== "HEAD") return false;
  return PUBLIC_PAGES.has(path) || OPPORTUNITY.test(path) || LOGO.test(path) || PLATFORM.test(path) || path === ICON;
}
