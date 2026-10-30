import { supplierPost } from "../../../../_auth/supplier";
import { PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { parseAnswerBody } from "@/lib/portal/projects/work-api";
import { answerAsContractor } from "@/lib/work/portal-store";

import { refusalReply, reply } from "../../reply";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

/**
 * The contractor writes the Answer of an RFI assigned to it: `POST /supplier/projects/work/answer`, JSON. Guarded in the portal's order and before the body is read. The supplier is the session's and the clock is the server's:
 * the body names a contract, an item reference and words. Words, not a signature: no password. The store judges everything again on the locked rows; an unshared item, another contractor's and an unknown
 * one are the one 404.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseAnswerBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message, errors: parsed.errors }, 400);
  try {
    await answerAsContractor(actor, parsed.value);
    return reply({ ok: true });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    return unexpectedFailure(e);
  }
}
