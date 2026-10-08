import { supplierPost } from "../../../_auth/supplier";
import { contextFor } from "@/lib/portal/registration/context-store";
import { saveSection } from "@/lib/portal/registration/draft-store";
import { parseSaveBody } from "@/lib/portal/registration/api";
import { blockingFaults } from "@/lib/portal/registration/faults";

import { faultViews, refusalReply, reply } from "../reply";

export const dynamic = "force-dynamic";

/// A body of this size is more than a section of the wizard ever is (two hundred documents at their longest); past it the request is not read at all.
const SAVE_BODY_LIMIT = 96 * 1024;

/**
 * Save one section of the signed-in supplier's registration draft (Phase 4b, B6). Guarded in the portal's order, before the body is read: the public copy, the Origin guard, a bounded
 * JSON body, the signed form token, then who is signed in. The supplier is the session's: nothing in the body names one. A stale `version` is refused with 409 and writes nothing, as
 * is a draft that was sent. A save judges shape and length only and never claims the draft valid; when the supplier asked to go on (`next`) the answer carries the step's rules.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "registration", { maxBytes: SAVE_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseSaveBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "VALIDATION", message: parsed.message }, 400);
  const { version, section, remove, next } = parsed.value;
  try {
    const saved = await saveSection(actor, { version, section, remove }, (tx, chosen) => contextFor(tx, actor, chosen));
    return reply({ ok: true, version: saved.version, created: saved.created, faults: next ? faultViews(saved.faults) : [], advance: next && blockingFaults(saved.faults).length === 0 });
  } catch (e) {
    const refused = refusalReply(e);
    if (refused) return refused;
    throw e;
  }
}
