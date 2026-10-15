import { supplierPost } from "../../../_auth/supplier";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { logWithdrawRefusal, takeStamp, withdrawBid } from "@/lib/bids/online/submit-store";
import { parseWithdrawBody } from "@/lib/bids/online/submit-parse";
import { WITHDRAW_FAULT_WORDS } from "@/lib/bids/online/words";
import { db } from "@/lib/db";
import { BIDS_BODY_LIMIT } from "@/lib/portal/bids/api";
import { RATE_LIMITS, rateRefusalLogged } from "@/lib/portal/bids/limits";
import { countAndJudgeCounted } from "@/lib/portal/bids/rate-store";

import { actInvalid, actNotice, faultsReply, passwordNotice } from "../act-reply";
import { reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier withdraws a submission of its own, and with it the alternatives it names (SR-13, ADR 0036 D7, ruling 20h): `POST /supplier/bids/withdraw`, JSON
 * `{ onlineBidId, alsoWithdraw, password }`. Guarded in the portal's order and before the body is read, parsed in one place, then the account's rate, then the stamp (taken after the
 * body is read and before the password check, as the submit's), then the password asked again. The supplier is the session's: another supplier's submission answers as one that is not there.
 * The alternatives linked to the bid and not named are kept with their link cleared.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "bids", { maxBytes: BIDS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseWithdrawBody(post.fields);
  if (!parsed.ok) return actInvalid(parsed.fields);
  const body = parsed.value;

  const rate = await countAndJudgeCounted(db, { organisationId: actor.organisationId, accountId: actor.accountId, action: "bid-withdraw" });
  if (rate.limited) {
    if (rateRefusalLogged(rate.count, RATE_LIMITS["bid-withdraw"].limit)) await logWithdrawRefusal(actor, body.onlineBidId, "RATE_LIMITED");
    return actNotice("WITHDRAW_RATE_LIMITED", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const stamp = await takeStamp();
  const asked = await confirmSupplierPassword(actor, body.password, post.facts);
  const refused = passwordNotice(asked);
  if (refused) return refused;

  const done = await withdrawBid(actor, { onlineBidId: body.onlineBidId, alsoWithdraw: body.alsoWithdraw, stamp, stepUpAt: asked.ok ? asked.at : null });
  if (done.ok) return reply({ ok: true, withdrawn: done.withdrawn, linksCleared: done.linksCleared });
  if (done.reason === "NOT_FOUND") return actNotice("NOT_FOUND", 404);
  return faultsReply(done.faults, WITHDRAW_FAULT_WORDS);
}
