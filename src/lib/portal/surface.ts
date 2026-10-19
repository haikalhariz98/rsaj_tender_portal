import { isSignInPath, SUPPLIER_ANNOUNCEMENTS_PAGE, SUPPLIER_AUTH_PAGES, SUPPLIER_BIDS_POST_PATHS, SUPPLIER_COMPANY_POST_PATHS, SUPPLIER_DATA_EXPORT, SUPPLIER_POST_PATHS, SUPPLIER_PROJECTS_POST_PATHS, SUPPLIER_REGISTRATION_GET_PATHS, SUPPLIER_REGISTRATION_POST_PATHS } from "@/lib/auth/routes";

/**
 * Which door a running copy of the product is the front of.
 *
 * Staff sign-in now exists, and every staff screen, action and route handler asks who is calling (Phase 1b); this is
 * the outer layer. The supplier portal is meant for strangers, so a copy that is reachable by them must serve
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
// Phase 4b: the registration wizard's page and its two reads (a code search and a file), served on the public copy and answering a supplier only (each asks who is signed in).
const PUBLIC_PAGES = new Set(["/supplier", "/supplier/opportunities", "/supplier/results", "/supplier/register", "/supplier/bids", "/supplier/company", "/supplier/projects", SUPPLIER_ANNOUNCEMENTS_PAGE, SUPPLIER_DATA_EXPORT.page, SUPPLIER_DATA_EXPORT.file, ...SUPPLIER_AUTH_PAGES, ...SUPPLIER_REGISTRATION_GET_PATHS]);
const OPPORTUNITY = /^\/supplier\/opportunities\/[A-Za-z0-9_-]+$/;
/// Phase 4d: one exercise in My Bids, and the two pages that open its tender documents. One id segment each; the posts are literal paths (`SUPPLIER_BIDS_POST_PATHS`), so a post to a path like these is refused.
const BID_PAGE = /^\/supplier\/bids\/[A-Za-z0-9_-]+(?:\/(?:table-document|documents|pay|submit|download))?$/;
/// The two of those that write the inspection log on every render. A page that is only asked about (HEAD) is not opened, so it is not served: a HEAD would otherwise log an opening nobody made.
const INSPECTION_PAGE = /^\/supplier\/bids\/[A-Za-z0-9_-]+\/(?:table-document|documents|download)$/;
/// Phase 4e: one contract in My Projects. One id segment; the posts are literal paths (`SUPPLIER_PROJECTS_POST_PATHS`).
const PROJECT_PAGE = /^\/supplier\/projects\/[A-Za-z0-9_-]+$/;
/// The organisation's logo, addressed by its own fingerprint.
const LOGO = /^\/organisation\/logo\/[A-Za-z0-9_-]+$/;
/// The platform's own files: scripts, styles and fonts, and nothing else under /_next. The image optimiser
/// (/_next/image) is left out on purpose: its job is to fetch other local paths, and nothing on the portal
/// needs it (the logo is a plain image, the fonts are static files).
const PLATFORM = /^\/_next\/static\//;
const ICON = "/favicon.ico";
/// The door that accepts a write from a stranger: the registration form's post.
export const SUBMIT_PATH = "/supplier/register/submit";
/// Every write the public copy takes, each at one literal path (Phase 4a): the registration post, and the supplier portal's sign-in, sign-out, activation, reset and account posts.
/// A stranger can reach the sign-in ones (they are how a supplier becomes signed in); each is a route handler that passes the Origin guard and a form token, and the ones
/// behind an account then ask who is signed in. No other path takes a write, and the public copy refuses every server action.
const POST_PATHS: ReadonlySet<string> = new Set([SUBMIT_PATH, ...SUPPLIER_POST_PATHS, ...SUPPLIER_REGISTRATION_POST_PATHS, ...SUPPLIER_COMPANY_POST_PATHS, ...SUPPLIER_BIDS_POST_PATHS, ...SUPPLIER_PROJECTS_POST_PATHS]);

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
  if (m === "POST") return POST_PATHS.has(path);
  if (m !== "GET" && m !== "HEAD") return false;
  if (m === "HEAD" && INSPECTION_PAGE.test(path)) return false;
  return PUBLIC_PAGES.has(path) || OPPORTUNITY.test(path) || BID_PAGE.test(path) || PROJECT_PAGE.test(path) || LOGO.test(path) || PLATFORM.test(path) || path === ICON;
}

/**
 * What the route boundary does with a request, now that there is sign-in (Phase 1b, threat model F3).
 *
 * This is the outer layer only. It looks at which cookie is there, never at whether it is good (it imports no database): the guard in every page,
 * action and route handler asks the database. Its job is to keep the two copies apart and to turn away the plainly signed-out before any work is done.
 *
 * - The public copy serves the portal and nothing else, as before; and a request that carries a staff cookie is refused there, since a staff session
 *   means nothing on the public copy and its presence says the request is not what that copy is for.
 * - The staff copy refuses a supplier cookie the same way, and sends anyone with no staff cookie to sign in (a page), or answers 401 (an API call or a post).
 *   What stays open without one is `PUBLIC_ENTRY_POINTS` in effect: the sign-in screens, the portal's pages and its registration post, the logo and the platform files.
 */
export interface GateRequest {
  surface: Surface;
  method: string;
  pathname: string;
  hasServerAction: boolean;
  staffCookie: boolean;
  supplierCookie: boolean;
  /// The development server's own channels (hot reload) are let through unsigned; a production copy has none.
  development?: boolean;
}

export type Gate = { kind: "next" } | { kind: "notFound" } | { kind: "signIn" } | { kind: "unauthorised" };

const DEV_CHANNELS = /^\/(_next\/webpack-hmr|_next\/turbopack-hmr|__nextjs_[a-z_-]+)(\/|$)/;

export function gate(r: GateRequest): Gate {
  if (r.surface === "public") {
    if (r.staffCookie) return { kind: "notFound" };
    return publicAllows(r) ? { kind: "next" } : { kind: "notFound" };
  }
  if (r.supplierCookie) return { kind: "notFound" };
  const path = r.pathname.length > 1 && r.pathname.endsWith("/") ? r.pathname.slice(0, -1) : r.pathname;
  const m = r.method.toUpperCase();
  const open = isSignInPath(path) || publicAllows({ method: m, pathname: path, hasServerAction: false }) || (r.development === true && DEV_CHANNELS.test(path));
  if (open || r.staffCookie) return { kind: "next" };
  // Nobody is signed in. A person looking at a page is sent to sign in; anything else (a post, a call to the API) is told so.
  return (m === "GET" || m === "HEAD") && !path.startsWith("/api/") ? { kind: "signIn" } : { kind: "unauthorised" };
}
