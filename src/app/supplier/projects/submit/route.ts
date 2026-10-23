import { supplierPost } from "../../../_auth/supplier";
import { PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";

import { reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * The earlier way a contractor sent a submission (Phase 4e), CLOSED in plan step 6 (PW-11, PW-23): the six kinds are now sent from the contract's Documents list, as a document of
 * one of the six kinds (`/supplier/projects/documents/create` and `/version`), and a statutory declaration is signed there with the password. `POST /supplier/projects/submit`
 * answers 410 Gone, saying where to send it, and does nothing: no body is read past the portal's guard, no password is asked and no store is called. It still stands behind the
 * portal's guards (the public copy, the Origin guard, the bound, the signed form token, who is signed in), so a stale page is told in the same order as every other post.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  return reply({ ok: false, code: "GONE", message: "This form has closed. Send it from Documents." }, 410);
}
