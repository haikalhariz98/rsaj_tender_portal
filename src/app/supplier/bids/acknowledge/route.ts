import { supplierPost } from "../../../_auth/supplier";
import { acknowledgeAddendum } from "@/lib/portal/bids/acknowledge-store";
import { BIDS_BODY_LIMIT, parseAcknowledgeBody } from "@/lib/portal/bids/api";

import { refusalReply, reply } from "../reply";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier acknowledges an addendum it holds a copy of (Phase 4d, FR-VND-013): `POST /supplier/bids/acknowledge`, JSON. Guarded in the portal's order and before the body is read. The supplier is the
 * session's and the day is the server's: the body names an exercise and an addendum, and nothing else. The acknowledgement is its own record and is not delivery: it never sets what an officer records of a paper copy.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "bids", { maxBytes: BIDS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseAcknowledgeBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  try {
    const done = await acknowledgeAddendum(actor, parsed.value);
    return reply({ ok: true, on: done.on });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    return unexpectedFailure(e);
  }
}
