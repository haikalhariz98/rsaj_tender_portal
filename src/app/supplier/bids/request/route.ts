import { supplierPost } from "../../../_auth/supplier";
import { BIDS_BODY_LIMIT, parseRequestBody } from "@/lib/portal/bids/api";
import { countAndJudge } from "@/lib/portal/bids/rate-store";
import { RATE_LIMITED_WORDS } from "@/lib/portal/bids/limits";
import { db } from "@/lib/db";
import { startPurchase, settlePayment } from "@/lib/portal/bids/purchase-store";
import { requestDocuments, withdrawRequest } from "@/lib/portal/bids/request-store";

import { refusalReply, reply } from "../reply";
import { unexpectedFailure } from "@/lib/unexpected-failure";

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
  const { exerciseId, action, collectorName, method, choice } = parsed.value;
  try {
    if (action === "buy") {
      // SR-10: "Buy documents" on an exercise sold online. It makes a purchase awaiting payment; nothing is paid or released here.
      const made = await startPurchase(actor, { exerciseId });
      if (made.outcome === "REFUSED") return reply({ ok: false, code: "REFUSED", message: made.reasons[0] ?? "The documents cannot be sold to your company at the moment.", reasons: made.reasons, recorded: made.recorded }, 422);
      return reply({ ok: true, action, purchase: made.outcome });
    }
    if (action === "pay") {
      // SR-10: the buyer's answer on the simulated provider's page. A failure is an answer, not an error: the purchase stays awaiting payment, with the failure shown.
      // SEC-2: each account may try to pay only so often. Counted before anything is judged, so a refused try counts too, and written nowhere that is a trail.
      const rate = await countAndJudge(db, { organisationId: actor.organisationId, accountId: actor.accountId, action: "payment-attempt" });
      if (rate.limited) return Response.json({ ok: false, code: "RATE_LIMITED", message: RATE_LIMITED_WORDS["payment-attempt"] }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rate.retryAfterSeconds) } });
      const settled = await settlePayment(actor, { exerciseId, method, choice: choice! });
      if (settled.outcome === "FAILED") return reply({ ok: false, code: "PAYMENT_FAILED", message: settled.failureText, reference: settled.reference }, 200);
      return reply({ ok: true, action, reference: settled.reference });
    }
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
    return unexpectedFailure(e);
  }
}
