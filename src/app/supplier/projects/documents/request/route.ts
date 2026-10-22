import { supplierPost } from "../../../../_auth/supplier";
import { PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { contractorRequest } from "@/lib/project-docs/portal-acts";
import { parseRequestBody } from "@/lib/project-docs/portal-api";

import { reply } from "../../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor sends a request for a document on a contract it holds (Project workspace, plan step 5): `POST /supplier/projects/documents/request`, JSON. Guarded in the portal's order and before
 * the body is read: the public copy, the Origin guard, a bounded JSON body, the signed form token, then who is signed in. The supplier is the session's and the day is the server's: the
 * body names a contract (and a document), and nothing else; an unknown field is refused 400, and a posted `kind` is refused 422 (PW-23: the six kinds arrive in step 6). The store judges
 * everything again on the locked rows; a contract or document that is not the contractor's to open is the same 404 for every cause.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseRequestBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: parsed.code, message: parsed.message, errors: parsed.errors }, parsed.status);
  const done = await contractorRequest(actor, parsed.value);
  return reply(done.body, done.status);
}
