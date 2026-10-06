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
