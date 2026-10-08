import { readCookie } from "@/lib/auth/cookie-header";
import { requestFacts } from "@/lib/auth/request";
import { foreignRequestFault } from "@/lib/auth/request-guard";
import { refusalBody, REFUSAL_STATUS } from "@/lib/auth/route-refusal";
import { SUPPLIER_COOKIE, SUPPLIER_SIGN_IN_PATH } from "@/lib/auth/routes";
import { signOutSupplierToken } from "@/lib/auth/supplier-session-store";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { supplierCookieCleared } from "../../_auth/supplier";

export const dynamic = "force-dynamic";

/**
 * A supplier signs out (Phase 4a). A POST, because a link anyone can be sent to must not end a session: a plain form on the page posts here. It works for whoever holds
 * a cookie, signed in or not, ends the session the cookie carries and clears the cookie, then sends the browser to the sign-in page (303, so the browser follows with a GET).
 */
export async function POST(request: Request) {
  if (surfaceOf(process.env[SURFACE_ENV]) !== "public") return Response.json(refusalBody("NOT_FOUND", "Not found"), { status: REFUSAL_STATUS.NOT_FOUND });
  const fault = foreignRequestFault(request, ["application/x-www-form-urlencoded"]);
  if (fault) return Response.json(refusalBody(fault.code, fault.message), { status: REFUSAL_STATUS[fault.code], headers: { "Cache-Control": "no-store" } });
  await signOutSupplierToken(readCookie(request.headers.get("cookie"), SUPPLIER_COOKIE), requestFacts((n) => request.headers.get(n)));
  return new Response(null, { status: 303, headers: { Location: SUPPLIER_SIGN_IN_PATH, "Set-Cookie": supplierCookieCleared(), "Cache-Control": "no-store" } });
}
