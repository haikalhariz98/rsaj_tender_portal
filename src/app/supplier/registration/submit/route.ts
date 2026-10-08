import { supplierPost } from "../../../_auth/supplier";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { db } from "@/lib/db";
import { parseSubmitBody } from "@/lib/portal/registration/api";
import { contextFor } from "@/lib/portal/registration/context-store";
import { declarationsAsSigned } from "@/lib/portal/registration/declaration";
import { draftOf, DraftRefused, loadDraftView, loadWizardState } from "@/lib/portal/registration/draft-store";
import { blockingFaults, registrationFaults } from "@/lib/portal/registration/faults";
import { submitRegistration } from "@/lib/portal/registration/submit-store";

import { faultViews, refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * Send the signed-in supplier's registration to the procurement office (Phase 4b, B6). Guarded in the portal's order, before the body is read. Then, in this order:
 *
 *  1. what stands in the way is judged on the draft as it is now (a registration that cannot be sent is refused WITHOUT asking for the password, so a wrong one is never counted
 *     for nothing), and a draft already sent is refused as decided (409);
 *  2. the password is asked again: a wrong one counts towards the lockout and is logged (`STEP_UP_FAILED`), and a locked or throttled account is refused;
 *  3. one transaction judges it all again on the locked rows, with the texts in force now (a stale or forged text id is refused), and writes the application, the documents, the bank
 *     details, the two signed declarations with their attributions and the audit rows, or nothing.
 *
 * Nothing in the body names a supplier or a day: the supplier is the session's and the day is the server's.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "registration");
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;
  const parsed = parseSubmitBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { version, password, declarations } = parsed.value;

  const state = await loadWizardState(db, actor);
  if (state === "SENT") return reply({ ok: false, code: "DECIDED", message: "This registration has already been sent to the procurement office." }, 409);
  if (state !== "OPEN") return reply({ ok: false, code: "NOT_OPEN", message: "This registration is with the procurement office, so it cannot be sent from here." }, 409);
  const view = await loadDraftView(db, actor);
  if (view.version !== version) return refusalReply(new DraftRefused("STALE"))!;
  const ctx = await contextFor(db, actor, view.documents.flatMap((d) => d.valueIds));
  const faults = blockingFaults(registrationFaults(draftOf(view), ctx, declarationsAsSigned(declarations, draftOf(view))));
  if (faults.length > 0) return reply({ ok: false, code: "VALIDATION", message: faultViews(faults)[0]!.message, faults: faultViews(faults) }, 422);

  const asked = await confirmSupplierPassword(actor, password, post.facts);
  if (!asked.ok) {
    if (asked.kind === "LOCKED") return reply({ ok: false, code: "LOCKED", message: "This account is locked after too many wrong passwords. Try again later." }, 403);
    if (asked.kind === "THROTTLED") return reply({ ok: false, code: "THROTTLED", message: "Too many attempts just now. Wait a few minutes and try again." }, 429);
    if (asked.kind === "POLICY_NOT_SET") return reply({ ok: false, code: "CLOSED", message: "Signing is closed: the procurement office has not finished setting up supplier sign-in. Tell the procurement office." }, 503);
    return reply({ ok: false, code: "WRONG_PASSWORD", message: "That password is not right. Nothing was sent." }, 403);
  }

  try {
    const sent = await submitRegistration(actor, { version, declarations, stepUpAt: asked.at });
    return reply({ ok: true, sentOn: sent.sentOn });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    throw e;
  }
}
