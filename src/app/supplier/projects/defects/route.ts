import { supplierPost } from "../../../_auth/supplier";
import { parseDefectBody, PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { reportRectifiedAsContractor } from "@/lib/portal/projects/defect-store";

import { refusalReply, reply } from "../reply";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

/**
 * The contractor marks a defect line rectified (Phase 2 close-out stage B, plan closeout-plan.md §5): `POST /supplier/projects/defects`, JSON. Guarded in
 * the portal's order and before the body is read. The supplier is the session's and the day is the server's: the body names a contract, a line, a note
 * and optionally one of the contractor's own documents. Words, not a signature: no password. The store judges everything again on the locked rows.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseDefectBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  try {
    const done = await reportRectifiedAsContractor(actor, parsed.value);
    return reply({ ok: true, eventId: done.eventId });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    return unexpectedFailure(e);
  }
}
