import { issueFormToken } from "@/lib/auth/form-secret";
import { refusalBody, REFUSAL_STATUS } from "@/lib/auth/route-refusal";
import { downloadRequestFault } from "@/lib/documents/request-guard";
import { APPLY } from "@/lib/portal/labels";
import type { TokenReply } from "@/lib/portal/register/contract";

import { lookupRefusal } from "../lookup-guard";

export const dynamic = "force-dynamic";

/**
 * A fresh register form token (ADR 0041 D8, plan 2.4): `GET /supplier/register/token`. The public form holds one token for its visit; past its age, or refused as out of date, the page
 * asks here for another without reloading, so nothing typed or held is lost. Each token carries its own random nonce, so it is spent by one application only. A request another site
 * started is refused; nothing is read or written. Never cached.
 */
export async function GET(request: Request) {
  if (downloadRequestFault(request.headers.get("sec-fetch-site"))) return Response.json(refusalBody("CROSS_SITE"), { status: REFUSAL_STATUS.CROSS_SITE, headers: { "cache-control": "no-store" } });
  // Security audit L8: counted per source address, and refused past the minute's allowance.
  const limited = lookupRefusal(request, "token");
  if (limited) return limited;
  const token = issueFormToken("register");
  const body: TokenReply = token ? { ok: true, token } : { ok: false, code: "CLOSED", message: APPLY.closedTitle.en };
  return Response.json(body, { status: token ? 200 : 503, headers: { "cache-control": "no-store" } });
}
