import { supplierPost } from "../../../_auth/supplier";
import { parseQueryBody } from "@/lib/award/online-return-api";
import { askAwardQuery } from "@/lib/award/online-return-store";
import { PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { unexpectedFailure } from "@/lib/unexpected-failure";

import { refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor asks the office a question about its issued award (ADR 0045 D3; Wave V, V3): `POST /supplier/projects/award-query`, JSON, guarded in the portal's order and before
 * the body is read. The body names a contract and the question, and nothing else; an unknown field is 400. The question pauses no clock. A contract that is not the contractor's is the one 404;
 * an award that is not issued is 422.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseQueryBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: parsed.code, message: parsed.message, errors: parsed.errors }, parsed.status);
  try {
    const done = await askAwardQuery(actor, parsed.value);
    return reply({ ok: true, queryId: done.queryId }, 201);
  } catch (e) {
    return refusalReply(e) ?? unexpectedFailure(e);
  }
}
