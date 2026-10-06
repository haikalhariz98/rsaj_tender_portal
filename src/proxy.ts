import { NextResponse, type NextRequest } from "next/server";

import { publicAllows, SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

/**
 * The route boundary for the supplier portal. Sign-in does not exist, so the only thing keeping a
 * stranger off the staff screens (and the staff server actions, which need no sign-in either) is that
 * the copy of the product they reach serves nothing else. See `lib/portal/surface.ts`.
 *
 * On the staff copy this passes everything through. It imports no database module on purpose.
 */
export function proxy(request: NextRequest) {
  if (surfaceOf(process.env[SURFACE_ENV]) === "internal") return NextResponse.next();
  // The public copy has no home page of its own: the portal's is the front door.
  if (request.method === "GET" && request.nextUrl.pathname === "/") return new NextResponse(null, { status: 307, headers: { location: "/supplier" } }); // relative: behind a reverse proxy the request's own host is not the public one
  const allowed = publicAllows({ method: request.method, pathname: request.nextUrl.pathname, hasServerAction: request.headers.has("next-action") });
  return allowed ? NextResponse.next() : new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}
