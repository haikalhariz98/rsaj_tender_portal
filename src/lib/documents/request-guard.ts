/**
 * Who may ask the document routes for something, before anything is read or logged.
 *
 * Nobody signs in, so a browser holding no credential still carries the portal's
 * ambient reach: any page on any site can make a visitor's browser send a form to
 * `POST /api/documents`. These checks refuse such a request before it reads a body,
 * touches the database or writes an access event, so a hostile page cannot fill the
 * store or the log (security audit M-3, C-2). They are a defence for browsers; a
 * non-browser client sets whatever headers it likes, which is why they sit beside, not
 * in place of, the sign-in that is yet to come.
 */

/// A header a cross-site page cannot add without a CORS preflight, which the portal never answers.
export const UPLOAD_HEADER = "X-Perolehan-Upload";
export const UPLOAD_HEADER_VALUE = "1";

export type RequestFault = "NOT_SAME_ORIGIN" | "UPLOAD_HEADER_MISSING";

export interface UploadRequestFacts {
  /// `Sec-Fetch-Site`, which the browser sets and a page cannot override.
  secFetchSite: string | null;
  origin: string | null;
  /// The request's own `Host`.
  host: string | null;
  /// The value of `X-Perolehan-Upload`.
  uploadHeader: string | null;
}

/**
 * Whether an upload may proceed. Same-origin by `Sec-Fetch-Site`; where a client sends
 * none (older browsers, tools), the `Origin` must name the request's own host, and an
 * absent or `null` Origin is not a match. Then the custom header must be present. Hosts
 * are compared without the scheme: behind a TLS-terminating proxy the portal cannot
 * see the scheme the visitor used.
 */
export function uploadRequestFault(f: UploadRequestFacts): RequestFault | null {
  const site = f.secFetchSite?.trim().toLowerCase() || null;
  if (site) {
    if (site !== "same-origin") return "NOT_SAME_ORIGIN";
  } else if (!originMatchesHost(f.origin, f.host)) {
    return "NOT_SAME_ORIGIN";
  }
  if (f.uploadHeader?.trim() !== UPLOAD_HEADER_VALUE) return "UPLOAD_HEADER_MISSING";
  return null;
}

function originMatchesHost(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.host.toLowerCase() === host.trim().toLowerCase();
}
