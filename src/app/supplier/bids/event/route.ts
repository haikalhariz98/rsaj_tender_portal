import { supplierPost } from "../../../_auth/supplier";
import { BIDS_BODY_LIMIT, parseEventBody } from "@/lib/portal/bids/api";
import { signUp, withdrawSignUp } from "@/lib/portal/bids/signup-store";

import { refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier signs up for a briefing or a site visit, or withdraws its sign-up (Phase 4d, FR-VND-013): `POST /supplier/bids/event`, JSON. Guarded in the portal's order and before the body is read: the
 * public copy, the Origin guard, a bounded JSON body, the signed form token, then who is signed in. The supplier is the session's and the time is the server's: the body names an exercise, an event and a person to send,
 * and nothing else. The store judges everything again on the locked rows. A sign-up is not attendance: it is not what the officer's register or the purchase gate reads.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "bids", { maxBytes: BIDS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseEventBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { exerciseId, eventId, action, representative } = parsed.value;
  try {
    if (action === "signup") await signUp(actor, { exerciseId, eventId, representative });
    else await withdrawSignUp(actor, { exerciseId, eventId });
    return reply({ ok: true, action });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    throw e;
  }
}
