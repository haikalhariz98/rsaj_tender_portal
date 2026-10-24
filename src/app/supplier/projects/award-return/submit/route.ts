import { supplierPost } from "../../../../_auth/supplier";
import { lodgeOnlineReturn } from "@/lib/award/online-return-store";
import { parseSubmitBody } from "@/lib/award/online-return-api";
import { lodgeReach } from "@/lib/award/online-return-reach";
import { awardReturnFaultText } from "@/lib/award/online-return-words";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { unexpectedFailure } from "@/lib/unexpected-failure";

import { passwordReply, refusalReply, reply } from "../../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor sends its award return online (ADR 0045; Wave V, V3): `POST /supplier/projects/award-return/submit`, JSON. Guarded in the portal's order and before the body is read:
 * the public copy, the Origin guard, a bounded JSON body, the signed form token, then who is signed in. The body names a contract, the staged scan of each document and, for an indent, the
 * acceptance page; an unknown field is refused 400. The password is asked again only after the body parses and a read-only check that the contract is this supplier's and the account may sign
 * (so nobody spends a lockout count for nothing); a wrong one writes nothing. The lodge judges everything again on the locked rows. A contract that is not the contractor's is the one 404.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseSubmitBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: parsed.code, message: parsed.message, errors: parsed.errors }, parsed.status);
  const { body, password } = parsed.value;

  const reach = await lodgeReach(actor, body.contractId);
  if (!reach.ok) {
    if (reach.reason === "NOT_FOUND") return reply({ ok: false, code: "NOT_FOUND", message: "That is not something you can open." }, 404);
    return reply({ ok: false, code: "NOT_SIGNING_AUTHORITY", message: awardReturnFaultText({ code: "NOT_SIGNING_AUTHORITY", data: { fault: reach.fault ?? "" } }) }, 403);
  }
  if (body.page && reach.instrument === "LETTER_OF_ACCEPTANCE") return reply({ ok: false, code: "VALIDATION", message: "Check the fields marked below.", errors: { page: awardReturnFaultText({ code: "PAGE_NOT_TAKEN" }) } }, 400);

  const asked = await confirmSupplierPassword(actor, password, post.facts);
  const refused = passwordReply(asked);
  if (refused) return refused;
  try {
    const done = await lodgeOnlineReturn(actor, { ...body, stepUpAt: asked.ok ? asked.at : null });
    return reply({ ok: true, onlineReturnId: done.onlineReturnId }, 201);
  } catch (e) {
    return refusalReply(e) ?? unexpectedFailure(e);
  }
}
