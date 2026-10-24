import { NextResponse, type NextRequest } from "next/server";

import { refusalBody } from "@/lib/auth/route-refusal";
import { SIGN_IN_PATH, STAFF_COOKIE, SUPPLIER_COOKIE } from "@/lib/auth/routes";
import { gate, SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

/**
 * The route boundary (see `lib/portal/surface.ts` for the rules, and for why this is only the outer layer).
 *
 * It keeps the public copy to the portal, keeps a staff cookie off the public copy and a supplier cookie off the staff copy, and on the staff copy turns
 * away a request with no session cookie at all: a page goes to sign in, a post or an API call is answered 401. It imports no database module on purpose, so it
 * cannot judge whether a cookie is good: every page, server action and route handler asks that itself (`requireStaff`).
 */
export function proxy(request: NextRequest) {
  const surface = surfaceOf(process.env[SURFACE_ENV]);
  const { pathname } = request.nextUrl;
  // The public copy has no home page of its own: the portal's is the front door.
  if (surface === "public" && request.method === "GET" && pathname === "/" && !request.cookies.get(STAFF_COOKIE)) {
    // Built from the request's own address: Next turns a redirect to its own host back into a relative one before it answers (`getRelativeURL`), so behind a reverse proxy
    // the person is sent to the proxy's host, not ours. A bare relative `location` is refused by Next's own adapter ("Invalid URL").
    return NextResponse.redirect(new URL("/supplier", request.url), 307);
  }
  const verdict = gate({
    surface,
    method: request.method,
    pathname,
    hasServerAction: request.headers.has("next-action"),
    staffCookie: Boolean(request.cookies.get(STAFF_COOKIE)?.value),
    supplierCookie: Boolean(request.cookies.get(SUPPLIER_COOKIE)?.value),
    development: process.env.NODE_ENV === "development",
  });
  switch (verdict.kind) {
    case "next":
      return NextResponse.next();
    case "signIn":
      // For the same reason as above.
      return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url), 307);
    case "unauthorised":
      return new NextResponse(JSON.stringify(refusalBody("NOT_SIGNED_IN")), { status: 401, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    case "notFound":
      return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

/**
 * Next copies a proxied request's body into memory so that the proxy and the route can both read it, waits for the whole body to arrive before the route runs, and past
 * `proxyClientMaxBodySize` (10 MB) keeps only the first part. For a multipart upload that undoes the route's own guards (they answer "before a byte of the body is read", cap the
 * time and the rate of the read, and refuse an upload by its length) and would cut an honest file between 10 MB and the part's own limit short, refused as unreadable. So the uploads
 * are left out of the proxy. Each is a route handler that asks the same questions itself and first (`supplierUploadPost`: this copy serves the portal, the Origin, the form token,
 * and a supplier signed in). A staff cookie on the public copy, which the boundary turns away, is ignored by those handlers (a supplier module never reads the staff cookie: supplier-reach.test.ts).
 * ADR 0041 D9: the public registration's one submission (`supplier/register/submit`) carries every file of an application, so it is left out too; nobody is signed in to it, so it asks the
 * boundary's own `gate()` itself, first, with the same facts this function passes, and answers as this would. The list is spelled out because Next reads this export statically;
 * `proxy.test.ts` pins that every route that takes a multipart upload is on it, and that nothing else is.
 */
export const config = {
  matcher: ["/((?!supplier/bids/part$|supplier/company/bank$|supplier/company/document$|supplier/registration/upload$|supplier/projects/documents/upload$|supplier/projects/award-return/upload$|supplier/register/submit$).*)"],
};
