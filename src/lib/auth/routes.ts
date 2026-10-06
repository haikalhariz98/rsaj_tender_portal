/// Where the sign-in screens send people. In one place so a screen and an action cannot disagree.
export const SIGN_IN_PATH = "/sign-in";
/// The page a person lands on after signing in: the one that shows them their last sign-in (ruling O-2).
export const AFTER_SIGN_IN = "/welcome";
/// Whether a path belongs to the sign-in screens, which are shown without the staff frame (no navigation, no counts).
export const isSignInPath = (pathname: string) => pathname === SIGN_IN_PATH || pathname.startsWith(`${SIGN_IN_PATH}/`);

/// The two session cookies (ADR 0034 D4). Names only, so the proxy can know them without importing anything that touches the database or `next/headers`.
/// `__Host-` ties each to one exact host with no Domain. A staff cookie means nothing to the public copy, and a supplier cookie nothing to the staff copy.
export const STAFF_COOKIE = "__Host-perolehan-staff";
export const SUPPLIER_COOKIE = "__Host-perolehan-supplier";

/**
 * The entry points that are reached with nobody signed in, and so carry no staff guard (Phase 1b, threat model F3). Everything else under
 * `src/app` (every page, every export of a `"use server"` file, every route handler) asks who is signed in first, and a source scan
 * (`src/app/_auth/auth-reach.test.ts`) holds it to that. Adding to this list is a decision, which is why each entry says why.
 *
 * `under` is a directory under `src/app` (everything below it); `file` is one file. The staff copy's proxy lets these through without a cookie as well.
 */
export interface PublicEntry {
  under?: string;
  file?: string;
  reason: string;
}

export const PUBLIC_ENTRY_POINTS: readonly PublicEntry[] = [
  { under: "sign-in", reason: "Signing in is how a person becomes signed in: the sign-in page, the one-time-code page and their actions. Each action passes the Origin guard and answers only on the staff copy." },
  {
    under: "supplier",
    reason:
      "The supplier portal is for strangers: its pages and its one registration POST are served to people with no account, on the public copy, and on the staff copy as well. Supplier sign-in (Phase 4a) will guard what is behind an account; staff sign-in has nothing to say about it.",
  },
  { file: "organisation/logo/[sha]/route.ts", reason: "The organisation's logo, addressed by its own fingerprint. It is shown on the sign-in page and on the public portal, to people who are not signed in, and holds nothing but the image." },
];

/// Whether a file under `src/app` (a path relative to it, with forward slashes) is a public entry point.
export function isPublicEntryFile(relativePath: string): boolean {
  return PUBLIC_ENTRY_POINTS.some((e) => (e.file != null && e.file === relativePath) || (e.under != null && (relativePath === e.under || relativePath.startsWith(`${e.under}/`))));
}
