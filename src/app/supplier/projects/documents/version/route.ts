import { supplierPost } from "../../../../_auth/supplier";
import { confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { PROJECTS_BODY_LIMIT } from "@/lib/portal/projects/api";
import { contractorVersion, versionSigns } from "@/lib/project-docs/portal-acts";
import { parseVersionBody, PASSWORD_ONLY_DECLARATION } from "@/lib/project-docs/portal-api";
import { NOT_FOUND_OUTCOME } from "@/lib/project-docs/portal-upload";

import { passwordReply, reply } from "../../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in contractor sends a new version of a document, from the staged files on a contract it holds (Project workspace, plan step 5): `POST /supplier/projects/documents/version`, JSON. Guarded in the portal's order and before
 * the body is read: the public copy, the Origin guard, a bounded JSON body, the signed form token, then who is signed in. The supplier is the session's and the day is the server's: the
 * body names a contract (and a document), one of the six kinds with a first version, and nothing else; an unknown field is refused 400 (plan step 6, PW-23). A statutory
 * declaration is signed: the password is asked again here, after the body is parsed and before the act's transaction, and only for a declaration's version (PW-41: posted with
 * any other document it is refused 400, as create refuses it), and only its moment reaches the store; a wrong one counts
 * towards the lockout and nothing is sent. The store judges everything again on the locked rows; a contract or document that is not the contractor's to open is the same 404
 * for every cause.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "projects", { maxBytes: PROJECTS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseVersionBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: parsed.code, message: parsed.message, errors: parsed.errors }, parsed.status);
  const { body, password } = parsed.value;
  // PW-41: a posted password is asked only for a statutory declaration's version, read as the contractor may open the document (as create refuses one with any other kind),
  // so nobody spends a step-up or a lockout count for nothing. A document it may not open is the act's one 404, and nothing is asked.
  let stepUpAt: Date | null = null;
  if (password !== null) {
    const signs = await versionSigns(actor, body);
    if (signs === null) return reply(NOT_FOUND_OUTCOME().body, 404);
    if (!signs) return reply({ ok: false, code: "VALIDATION", message: "Check the fields marked below.", errors: { password: PASSWORD_ONLY_DECLARATION } }, 400);
    const asked = await confirmSupplierPassword(actor, password, post.facts);
    const refused = passwordReply(asked);
    if (refused) return refused;
    stepUpAt = asked.ok ? asked.at : null;
  }
  const done = await contractorVersion(actor, body, stepUpAt);
  return reply(done.body, done.status);
}
