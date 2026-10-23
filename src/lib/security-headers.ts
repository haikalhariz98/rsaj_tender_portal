/**
 * Response headers set on every route (`next.config.ts`, security audit C-7).
 *
 * The Content-Security-Policy carries `frame-ancestors` and nothing else on purpose: a
 * fuller policy has to allow what Next injects (inline scripts and styles, the dev
 * server's eval), and a policy that blocks them breaks the app. `X-Frame-Options` says
 * the same thing for browsers that read only that.
 *
 * A header set here replaces one the route sets itself, so the download route, whose
 * files are served under a far stricter policy, has its own rule after the general one
 * (the last matching rule wins) and the route and the rule share `DOWNLOAD_POLICY`.
 */

/// What the files a download serves may do: nothing, and sandboxed even if opened.
export const DOWNLOAD_POLICY = "default-src 'none'; sandbox; frame-ancestors 'self'";

export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

/// The rules for `headers()` in `next.config.ts`; where two match, the later one wins per header.
export function headerRules(): { source: string; headers: { key: string; value: string }[] }[] {
  return [
    // HSTS only in production: on http://localhost it would pin the browser to https for a year.
    { source: "/:path*", headers: [...SECURITY_HEADERS, ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : [])].map((h) => ({ ...h })) },
    { source: "/api/opening/sealed-file", headers: [{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }] },
    { source: "/api/documents/versions/:path*", headers: [{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }] },
    // The supplier file routes set their own policy too, and a header set in the global rule replaces it.
    { source: "/supplier/account/data/file", headers: [{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }] },
    { source: "/supplier/results/:id/schedule", headers: [{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }] },
    { source: "/supplier/bids/:id/download", headers: [{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }] },
    { source: "/supplier/registration/file", headers: [{ key: "Content-Security-Policy", value: DOWNLOAD_POLICY }] },
  ];
}
