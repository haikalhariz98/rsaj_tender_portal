import { parseNoFields } from "@/lib/auth/forms";
import { entriesOf } from "@/lib/auth/json-body";
import { acknowledgeSupplierResetNotice } from "@/lib/auth/supplier-account-store";

import { portalReply, supplierPost, validationReply } from "../../../_auth/supplier";

export const dynamic = "force-dynamic";

/// A signed-in supplier says they have seen the notice that their password was reset (Phase 4a). The supplier is the session's.
export async function POST(request: Request) {
  const guard = await supplierPost(request, "account");
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseNoFields(entriesOf(post.fields));
  if (!parsed.ok) return validationReply(parsed.errors);

  await acknowledgeSupplierResetNotice(actor, post.facts);
  return portalReply({ ok: true });
}
