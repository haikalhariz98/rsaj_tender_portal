import { supplierPost } from "../../../../_auth/supplier";
import { PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { parseRaiseBody } from "@/lib/portal/projects/work-api";
import { raiseAsContractor } from "@/lib/work/portal-store";

import { refusalReply, reply } from "../../reply";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

/**
 * The contractor asks a question (an RFI) or reports an incident (3b step 4, B-15): `POST /supplier/projects/work/raise`, JSON. Guarded in the portal's order and before the body is read. The supplier is the session's and the clock is the server's:
 * the body names a contract, a type, words, a day or a time and staged files. Words, not a signature: no password. The store judges everything again on the locked rows; an unshared item, another contractor's and an unknown
 * one are the one 404.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseRaiseBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message, errors: parsed.errors }, 400);
  try {
    const done = await raiseAsContractor(actor, parsed.value);
    return reply({ ok: true, ref: done.ref }, 201);
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    return unexpectedFailure(e);
  }
}
