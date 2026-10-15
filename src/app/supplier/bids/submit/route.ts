import { supplierPost } from "../../../_auth/supplier";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { partsOfFiles, submitBid, takeStamp } from "@/lib/bids/online/submit-store";
import { duplicatePartFaults } from "@/lib/bids/online/submission";
import { parseSubmitBody } from "@/lib/bids/online/submit-parse";
import { logPartRefusal } from "@/lib/bids/online/upload-store";
import { SUBMIT_FAULT_WORDS, submissionWarningWords } from "@/lib/bids/online/words";
import { db } from "@/lib/db";
import { RATE_LIMITS, rateRefusalLogged, SUBMIT_BODY_LIMIT } from "@/lib/portal/bids/limits";
import { countAndJudgeCounted } from "@/lib/portal/bids/rate-store";

import { actInvalid, actNotice, faultsReply, passwordNotice } from "../act-reply";
import { reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier submits a sealed bid, an alternative or a replacement (SR-13, ADR 0036 D5, D7, D8): `POST /supplier/bids/submit`, JSON of at most 16 KB
 * `{ exerciseId, kind, parentOnlineBidId?, replacesOnlineBidId?, fileIds, declaration, password }`. Guarded in the portal's order and before the body is read. The body is parsed
 * in one place (unknown fields refused). Then the account's rate, then the stamp: taken from the database clock after the small body is read and before the password is
 * checked, so a slow hash or a wait on the locks cannot make a late bid look in time (20aa). The password is asked again on its own committed connection (a wrong one counts
 * toward the lockout and nothing is submitted). The supplier is the session's: another supplier's exercise, file or bid answers as one that is not there. The store judges every rule
 * again on the locked rows and writes the envelope, the submission, its record and its receipt in one transaction.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "bids", { maxBytes: SUBMIT_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseSubmitBody(post.fields);
  if (!parsed.ok) return actInvalid(parsed.fields);
  const body = parsed.value;

  // The account's rate, counted before anything is judged, so a refused try counts too. Only the first refusal in each window writes a row (20w).
  const rate = await countAndJudgeCounted(db, { organisationId: actor.organisationId, accountId: actor.accountId, action: "bid-submit" });
  if (rate.limited) {
    if (rateRefusalLogged(rate.count, RATE_LIMITS["bid-submit"].limit)) await logPartRefusal(actor, body.exerciseId, "SUBMIT", "RATE_LIMITED");
    return actNotice("SUBMIT_RATE_LIMITED", 429, { "Retry-After": String(rate.retryAfterSeconds) });
  }
  if (!body.declaration.ok) return faultsReply(body.declaration.faults, SUBMIT_FAULT_WORDS);

  // Two files for one part (20al): judged before the stamp and the password, as the declaration is.
  const doubled = duplicatePartFaults(await partsOfFiles(actor, body.exerciseId, body.fileIds));
  if (doubled.length > 0) return faultsReply(doubled, SUBMIT_FAULT_WORDS);

  const stamp = await takeStamp();
  const asked = await confirmSupplierPassword(actor, body.password, post.facts);
  const refused = passwordNotice(asked);
  if (refused) return refused;

  const done = await submitBid(actor, {
    exerciseId: body.exerciseId, kind: body.kind, parentOnlineBidId: body.parentOnlineBidId, replacesOnlineBidId: body.replacesOnlineBidId,
    fileIds: body.fileIds, declaration: body.declaration.value, stamp, stepUpAt: asked.ok ? asked.at : null,
  });
  if (done.ok) {
    return reply({
      ok: true,
      receipt: done.receipt,
      warnings: done.warnings.map((x) => ({ message: submissionWarningWords(x).en, messageMs: submissionWarningWords(x).ms })),
    }, 201);
  }
  if (done.reason === "NOT_FOUND") return actNotice("NOT_FOUND", 404);
  return faultsReply(done.faults, SUBMIT_FAULT_WORDS);
}
