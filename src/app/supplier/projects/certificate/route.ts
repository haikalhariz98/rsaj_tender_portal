import { supplierPost } from "../../../_auth/supplier";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { parseCertificateBody, PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { signContractorBlock } from "@/lib/portal/projects/certificate-store";

import { passwordReply, refusalReply, reply } from "../reply";
import { unexpectedFailure } from "@/lib/unexpected-failure";

export const dynamic = "force-dynamic";

/**
 * The contractor signs, or disputes, the contractor's block of a Variation Order Certificate or a Certificate of Adjustment of Contract Sum (spec section 5.3; FR-VAR-022; Phase 4e):
 * `POST /supplier/projects/certificate`, JSON. Guarded in the portal's order and before the body is read. The supplier is the session's and the day is the server's: the body names a
 * contract, a certificate, the action and (for a dispute) the reason. Both are signatures on the certificate: the password is asked again before the act's transaction, and a wrong one
 * counts towards the lockout and signs nothing. The store, and then the certificate core, judge the block again on the locked rows.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseCertificateBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { contractId, certificateId, action, note, password } = parsed.value;
  if (password.length === 0) return reply({ ok: false, code: "VALIDATION", message: action === "sign" ? "Enter your password to sign the certificate." : "Enter your password to record your dispute." }, 422);
  const asked = await confirmSupplierPassword(actor, password, post.facts);
  const refused = passwordReply(asked);
  if (refused) return refused;
  try {
    const done = await signContractorBlock(actor, { contractId, certificateId, action, note, stepUpAt: asked.ok ? asked.at : null });
    return reply({ ok: true, action, blockOrder: done.blockOrder });
  } catch (e) {
    const refusedAct = refusalReply(e);
    if (refusedAct) return refusedAct;
    return unexpectedFailure(e);
  }
}
