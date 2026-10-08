import { parseNoFields } from "@/lib/auth/forms";
import { entriesOf } from "@/lib/auth/json-body";
import { SUPPLIER_SIGN_IN_PATH } from "@/lib/auth/routes";
import { supplierSignOutEverywhere } from "@/lib/auth/supplier-identity";

import { portalReply, supplierCookieCleared, supplierPost, validationReply } from "../../../_auth/supplier";

export const dynamic = "force-dynamic";

/// A signed-in supplier ends every session their account has, this one included (Phase 4a). The supplier is the session's.
export async function POST(request: Request) {
  const guard = await supplierPost(request, "account");
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseNoFields(entriesOf(post.fields));
  if (!parsed.ok) return validationReply(parsed.errors);

  await supplierSignOutEverywhere(actor, post.facts);
  return portalReply({ ok: true, href: SUPPLIER_SIGN_IN_PATH }, 200, supplierCookieCleared());
}
