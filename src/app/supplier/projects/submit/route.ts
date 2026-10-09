import { supplierPost } from "../../../_auth/supplier";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { parseSubmitBody, PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { KIND_SHAPE } from "@/lib/portal/projects/submission";
import { sendSubmission } from "@/lib/portal/projects/submission-store";

import { passwordReply, refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor sends a submission on a contract it holds (Phase 4e; spec section 5.3): `POST /supplier/projects/submit`, JSON. Guarded in the portal's order and before the body
 * is read: the public copy, the Origin guard, a bounded JSON body, the signed form token, then who is signed in. The supplier is the session's and the day is the server's: the body names
 * a contract, a kind and the submission's own fields, and nothing else. A statutory declaration asks the password again, before the act's transaction: a wrong one counts towards the
 * lockout and nothing is sent. The store judges everything again on the locked rows and routes the submission to the S.O. office in force.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseSubmitBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { contractId, kind, title, body, amount, aboutDay, lines, password } = parsed.value;
  let stepUpAt: Date | null = null;
  if (KIND_SHAPE[kind].signed) {
    if (password.length === 0) return reply({ ok: false, code: "VALIDATION", message: "Enter your password to sign the declaration." }, 422);
    const asked = await confirmSupplierPassword(actor, password, post.facts);
    const refused = passwordReply(asked);
    if (refused) return refused;
    stepUpAt = asked.ok ? asked.at : null;
  }
  try {
    const sent = await sendSubmission(actor, { contractId, kind, title, body, amount, aboutDay, lines, stepUpAt });
    return reply({ ok: true, submissionId: sent.submissionId, routedTo: sent.routedTo, dueOn: sent.dueOn }, 201);
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    throw e;
  }
}
