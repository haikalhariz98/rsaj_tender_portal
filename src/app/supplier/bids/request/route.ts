import { supplierPost } from "../../../_auth/supplier";
import { BIDS_BODY_LIMIT, parseRequestBody } from "@/lib/portal/bids/api";
import { requestDocuments, withdrawRequest } from "@/lib/portal/bids/request-store";

import { refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier asks for the tender documents, or withdraws the request (Phase 4d, FR-VND-012): `POST /supplier/bids/request`, JSON. Guarded in the portal's order and before the body is read. The supplier is
 * the session's and the time is the server's: the body names an exercise and the person who will collect the documents. The pre-sale checks (FR-ADV-010) are judged on the locked rows; a check that stops the request is
 * answered with the reasons, and kept as a refused attempt. A request starts no sale and takes no payment: an officer records the sale, and online payment is not built.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "bids", { maxBytes: BIDS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseRequestBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { exerciseId, action, collectorName } = parsed.value;
  try {
    if (action === "withdraw") {
      await withdrawRequest(actor, { exerciseId });
      return reply({ ok: true, action });
    }
    const made = await requestDocuments(actor, { exerciseId, collectorName });
    if (made.outcome === "REFUSED") {
      const reasons = made.checks.filter((c) => c.state === "BLOCK").map((c) => c.detail);
      return reply({ ok: false, code: "REFUSED", message: reasons[0] ?? "The documents cannot be sold to your company at the moment.", reasons, recorded: made.recorded }, 422);
    }
    return reply({ ok: true, action });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    throw e;
  }
}
