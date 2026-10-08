import { supplierPost } from "../../../_auth/supplier";
import { parseWithdrawBody } from "@/lib/portal/registration/api";
import { withdrawDraftFile } from "@/lib/portal/registration/upload-store";

import { refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/**
 * Take one of the signed-in supplier's own files off its registration draft (Phase 4b, B6). The file is detached, with its reason, and the bytes are kept (ADR 0011). A file that is not on
 * this supplier's own draft is not found. Guarded in the portal's order; a stale `version` is refused with 409 and nothing changes.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "registration");
  if (!guard.ok) return guard.response;
  const parsed = parseWithdrawBody(guard.post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  try {
    const done = await withdrawDraftFile(guard.actor, parsed.value);
    return reply({ ok: true, version: done.version });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    throw e;
  }
}
