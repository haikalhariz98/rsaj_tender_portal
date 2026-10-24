/// Where the sign-in screens send people. In one place so a screen and an action cannot disagree.
export const SIGN_IN_PATH = "/sign-in";
/// The page a person lands on after signing in: the dashboard (founder, 2026-10-08), which raises a reset, a required password change or
/// failed attempts since the previous sign-in when there are any (ruling O-2's compensating control); the previous sign-in is on /account.
export const AFTER_SIGN_IN = "/";
/// Whether a path belongs to the sign-in screens, which are shown without the staff frame (no navigation, no counts).
export const isSignInPath = (pathname: string) => pathname === SIGN_IN_PATH || pathname.startsWith(`${SIGN_IN_PATH}/`);

/// The four supplier portal pages drawn as the portal's front door (design note 0006): sign-in, register, activate and reset. Each is a literal path, so a page
/// below them (the registration's own POST, an account page) is not one. Like the sign-in screens they are shown without the staff frame, on both copies.
export const PORTAL_LANDING_PATHS = ["/supplier/sign-in", "/supplier/register", "/supplier/activate", "/supplier/reset"] as const;
export const isPortalLandingPath = (pathname: string) => (PORTAL_LANDING_PATHS as readonly string[]).includes(pathname);

/// The supplier portal's sign-in (Phase 4a). The supplier store signs in on the public copy only, at literal paths: the pages, and the route handlers their forms post to
/// (a server action cannot be allow-listed by path, and the public copy refuses every one). `publicAllows` (`src/lib/portal/surface.ts`) lists exactly these.
export const SUPPLIER_SIGN_IN_PATH = "/supplier/sign-in";
export const SUPPLIER_AFTER_SIGN_IN = "/supplier/account";
export const SUPPLIER_AUTH_PAGES = ["/supplier/sign-in", "/supplier/activate", "/supplier/reset", "/supplier/account"] as const;
export const SUPPLIER_AUTH_POSTS = {
  signIn: "/supplier/sign-in/submit",
  signOut: "/supplier/sign-out",
  activate: "/supplier/activate/submit",
  reset: "/supplier/reset/submit",
  changePassword: "/supplier/account/password",
  signOutEverywhere: "/supplier/account/sign-out-everywhere",
  acknowledgeReset: "/supplier/account/acknowledge",
} as const;
export const SUPPLIER_POST_PATHS: readonly string[] = Object.values(SUPPLIER_AUTH_POSTS);

/// The signed-in supplier's registration wizard (Phase 4b): its one page, and the route handlers it calls, each at a literal path. A supplier must be signed in to every one (the page
/// redirects to the sign-in, a handler answers 401), and no id of a supplier is read from any of them: the supplier is the session's.
export const SUPPLIER_REGISTRATION_PAGE = "/supplier/registration";
export const SUPPLIER_REGISTRATION_POSTS = {
  save: "/supplier/registration/save",
  upload: "/supplier/registration/upload",
  withdrawFile: "/supplier/registration/withdraw-file",
  submit: "/supplier/registration/submit",
} as const;
export const SUPPLIER_REGISTRATION_GETS = {
  values: "/supplier/registration/values",
  file: "/supplier/registration/file",
} as const;
export const SUPPLIER_REGISTRATION_POST_PATHS: readonly string[] = Object.values(SUPPLIER_REGISTRATION_POSTS);
export const SUPPLIER_REGISTRATION_GET_PATHS: readonly string[] = [SUPPLIER_REGISTRATION_PAGE, ...Object.values(SUPPLIER_REGISTRATION_GETS)];

/// The signed-in supplier's Company workspace (Phase 4c): its page (already public), and the two uploads it makes, each a multipart route handler at a literal path. A supplier must be signed in to
/// each (a handler answers 401), and no id of a supplier is read from either: the supplier is the session's.
export const SUPPLIER_COMPANY_PAGE = "/supplier/company";
export const SUPPLIER_COMPANY_POSTS = {
  document: "/supplier/company/document",
  bank: "/supplier/company/bank",
} as const;
export const SUPPLIER_COMPANY_POST_PATHS: readonly string[] = Object.values(SUPPLIER_COMPANY_POSTS);

/// The signed-in supplier's My Bids workspace (Phase 4d): its list page, the page of one exercise (an id segment, so it has its own pattern in `surface.ts`), the two pages that open the tender
/// documents, and the three JSON posts it makes, each a route handler at a literal path. A supplier must be signed in to each (a page redirects to the sign-in, a handler answers 401), and no id of a
/// supplier is read from any of them: the supplier is the session's. The ids a post names are an exercise's, an event's and an addendum's, which the stores read only as the session's supplier may see them.
export const SUPPLIER_BIDS_PAGE = "/supplier/bids";
export const SUPPLIER_BIDS_POSTS = {
  event: "/supplier/bids/event",
  acknowledge: "/supplier/bids/acknowledge",
  request: "/supplier/bids/request",
  // Wave 3b (SR-13, plan section 1.5): one sealed bid part uploaded (multipart) and discarded (JSON). The submit and the withdraw join in step 10 (plan section 1.5).
  part: "/supplier/bids/part",
  partDiscard: "/supplier/bids/part/discard",
  submit: "/supplier/bids/submit",
  withdraw: "/supplier/bids/withdraw",
} as const;
export const SUPPLIER_BIDS_POST_PATHS: readonly string[] = Object.values(SUPPLIER_BIDS_POSTS);

/// The signed-in contractor's My Projects workspace (Phase 4e): its list page, the page of one contract (an id segment, so it has its own pattern in `surface.ts`), the announcements
/// board, and the three JSON posts it makes, each a route handler at a literal path. A supplier must be signed in to each (a page redirects to the sign-in, a handler answers 401), and no
/// id of a supplier is read from any of them: the supplier is the session's. The ids a post names are a contract's, a diary entry's and a certificate's, which the stores read only as the
/// session's supplier holds them.
export const SUPPLIER_PROJECTS_PAGE = "/supplier/projects";
export const SUPPLIER_ANNOUNCEMENTS_PAGE = "/supplier/announcements";
export const SUPPLIER_PROJECTS_POSTS = {
  submit: "/supplier/projects/submit",
  diary: "/supplier/projects/diary",
  block: "/supplier/projects/certificate",
} as const;
export const SUPPLIER_PROJECTS_POST_PATHS: readonly string[] = Object.values(SUPPLIER_PROJECTS_POSTS);

/// The contractor's Project workspace documents (plan step 5): four posts, each a route handler at a literal path (three JSON acts, and the multipart staging of one file), and one read, the download
/// of one file, at a path with one id segment (`SUPPLIER_PROJECT_DOCUMENT_FILE` + "/" + the attachment's id; it has its own pattern in `surface.ts`). A supplier must be signed in to each
/// (a handler answers 401), and no id of a supplier is read from any of them: the supplier is the session's. The ids a request names are a contract's, a document's, staged files' and a
/// file's, which the stores read only as the session's supplier may reach them (another's read as not found).
export const SUPPLIER_PROJECT_DOCUMENTS_POSTS = {
  create: "/supplier/projects/documents/create",
  version: "/supplier/projects/documents/version",
  request: "/supplier/projects/documents/request",
  upload: "/supplier/projects/documents/upload",
} as const;
export const SUPPLIER_PROJECT_DOCUMENTS_POST_PATHS: readonly string[] = Object.values(SUPPLIER_PROJECT_DOCUMENTS_POSTS);
export const SUPPLIER_PROJECT_DOCUMENT_FILE = "/supplier/projects/documents/file";

/// The contractor's online award return and questions (Wave V, V3): the multipart staging of one signed scan, the JSON lodge (signed with the password, asked again) and the JSON question.
/// A supplier must be signed in to each (a handler answers 401); the supplier is the session's, and a contract that is not its own is the one 404.
export const SUPPLIER_AWARD_RETURN_POSTS = {
  upload: "/supplier/projects/award-return/upload",
  submit: "/supplier/projects/award-return/submit",
  query: "/supplier/projects/award-query",
} as const;
export const SUPPLIER_AWARD_RETURN_POST_PATHS: readonly string[] = Object.values(SUPPLIER_AWARD_RETURN_POSTS);

/// A signed-in supplier's export of its own data (N2, the PDPA right of access): a printable page, and the same content as one JSON file. Both are reads and write one export row each; neither reads an id.
export const SUPPLIER_DATA_EXPORT = { page: "/supplier/account/data", file: "/supplier/account/data/file" } as const;

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
  { under: "sign-in", reason: "Signing in is how a person becomes signed in: the sign-in page, the one-time-code page, the page's image (served by its own fingerprint, holding nothing but the picture) and their actions. Each action passes the Origin guard and answers only on the staff copy." },
  // The supplier portal (Phase 4a): each public part is named, so that an account's own page is NOT exempt. `supplier/account` is guarded by `requireSupplier` (a page) and
  // `supplierPost` (its handlers), and a source scan holds it to that (`src/app/_auth/supplier-reach.test.ts`, and `auth-reach.test.ts` for the guards' names).
  {
    file: "supplier/page.tsx",
    reason: "The supplier portal's home page: served to people with no account, on the public copy and on the staff copy as well. It shows what is open to everyone and holds no supplier's data.",
  },
  {
    under: "supplier/opportunities",
    reason: "The portal's published opportunities: open to everyone by the founder's ruling (2026-10-06), on the public copy and on the staff copy. What it shows is what is public by `isPublicOpportunity`, never a supplier's own.",
  },
  { under: "supplier/results", reason: "The portal's published results: open to everyone, on the public copy and on the staff copy. It holds no supplier's own data." },
  {
    under: "supplier/register",
    reason: "The public registration form, its one POST and its two reads: served to people with no account, because applying is how a company gets one. The POST passes the Origin guard and a signed, single-use form token, and the public copy takes no other write from a stranger but the sign-in posts below. The reads (a fresh form token, and a search of the published registration codes) write nothing and refuse a request another site started (ADR 0041).",
  },
  // Phase 4d: `supplier/bids` is built, so it is no longer a public entry. Its pages ask `requireSupplier` and its three handlers ask `supplierPost`, first (held by `supplier-reach.test.ts`).
  // Phase 4c: `supplier/company` is built, so it is no longer a public entry. Its page asks `requireSupplier` and its two handlers ask `supplierUploadPost`, first (held by `supplier-reach.test.ts`).
  // Phase 4e: `supplier/projects` is built, so it is no longer a public entry. Its pages ask `requireSupplier` and its three handlers ask `supplierPost`, first (held by `supplier-reach.test.ts`).
  // `supplier/announcements` (Phase 4e) likewise asks `requireSupplier`: the board is for signed-in suppliers.
  {
    under: "supplier/sign-in",
    reason: "A supplier signing in is not yet signed in: the sign-in page and its POST are served to people with no account, on the public copy. The POST passes the Origin guard and a signed form token, and answers one sentence whatever was wrong.",
  },
  {
    under: "supplier/activate",
    reason: "Activating an account is done with a one-time code before any password exists: the page and its POST are served to people with no account, on the public copy, behind the Origin guard and a signed form token.",
  },
  {
    under: "supplier/reset",
    reason: "Setting a new password with a one-time reset code is done by someone who cannot sign in: the page and its POST are served to people with no account, on the public copy, behind the Origin guard and a signed form token.",
  },
  {
    file: "supplier/sign-out/route.ts",
    reason: "Signing out works for whoever holds a cookie, signed in or not, and ends only the session the cookie carries. It is a POST that passes the Origin guard.",
  },
  { file: "organisation/logo/[sha]/route.ts", reason: "The organisation's logo, addressed by its own fingerprint. It is shown on the sign-in page and on the public portal, to people who are not signed in, and holds nothing but the image." },
];

/// Whether a file under `src/app` (a path relative to it, with forward slashes) is a public entry point.
export function isPublicEntryFile(relativePath: string): boolean {
  return PUBLIC_ENTRY_POINTS.some((e) => (e.file != null && e.file === relativePath) || (e.under != null && (relativePath === e.under || relativePath.startsWith(`${e.under}/`))));
}
