import { supplierPost } from "../../../_auth/supplier";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { parseDiaryBody, PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { attestDiaryAsAgent, disputeDiaryAsAgent } from "@/lib/portal/projects/diary-store";

import { passwordReply, refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * The contractor's agent attests a site diary entry, or records a disagreement on it (FR-SUP-007, Phase 4e): `POST /supplier/projects/diary`, JSON. Guarded in the portal's order and
 * before the body is read. The supplier is the session's and the day is the server's: the body names a contract, an entry, the action and (for a disagreement) the words. An attestation is a
 * signature: the password is asked again before the act's transaction, and a wrong one counts towards the lockout and attests nothing. The store judges everything again on the locked rows.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseDiaryBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { contractId, entryId, action, disagreement, password } = parsed.value;
  try {
    if (action === "attest") {
      if (password.length === 0) return reply({ ok: false, code: "VALIDATION", message: "Enter your password to attest the entry." }, 422);
      const asked = await confirmSupplierPassword(actor, password, post.facts);
      const refused = passwordReply(asked);
      if (refused) return refused;
      const done = await attestDiaryAsAgent(actor, { contractId, entryId, stepUpAt: asked.ok ? asked.at : null });
      return reply({ ok: true, action, day: done.day });
    }
    const done = await disputeDiaryAsAgent(actor, { contractId, entryId, disagreement });
    return reply({ ok: true, action, day: done.day });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    throw e;
  }
}
