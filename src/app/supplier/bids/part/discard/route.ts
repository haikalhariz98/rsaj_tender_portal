import { supplierPost } from "../../../../_auth/supplier";
import { discardPart } from "@/lib/bids/online/upload-store";
import { parseDiscardBody } from "@/lib/bids/online/upload-parse";
import { PART_ROUTE_WORDS } from "@/lib/bids/online/words";
import { BIDS_BODY_LIMIT } from "@/lib/portal/bids/api";

import { reply } from "../../reply";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier discards a part it uploaded and has not submitted (SR-13, ADR 0036 D6): `POST /supplier/bids/part/discard`, JSON `{ exerciseId, fileId }`. Guarded in the
 * portal's order and before the body is read. The supplier is the session's: another supplier's file, another exercise's and one that does not exist all answer 404 in the same
 * words. A file a submission already took cannot be discarded. The sealed bytes stay in the store, as every ciphertext does; the draft stops counting toward the supplier's cap.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "bids", { maxBytes: BIDS_BODY_LIMIT });
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseDiscardBody(post.fields);
  if (!parsed.ok) return reply({ ok: false, code: "UNREADABLE", message: PART_ROUTE_WORDS.UNREADABLE.en }, 400);
  const done = await discardPart(actor, parsed.value);
  if (done.ok) return reply({ ok: true });
  const words = PART_ROUTE_WORDS[done.reason];
  return reply({ ok: false, code: done.reason, message: words.en }, done.reason === "NOT_FOUND" ? 404 : 409);
}
