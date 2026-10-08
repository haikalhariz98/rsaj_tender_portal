import { entriesOf } from "@/lib/auth/json-body";
import { parseChangePassword } from "@/lib/auth/forms";
import { changeSupplierPassword } from "@/lib/auth/supplier-account-store";
import { AUTH_WORDS } from "@/lib/auth/words";

import { closedReply, portalReply, supplierCookieHeader, supplierPost, validationReply } from "../../../_auth/supplier";

export const dynamic = "force-dynamic";

/**
 * A signed-in supplier changes their password (Phase 4a). The current password is asked for again and counts towards the lockout if wrong. Every other session ends,
 * and this one is given a new token, set on the response. The supplier is the session's.
 */
export async function POST(request: Request) {
  const guard = await supplierPost(request, "account");
  if (!guard.ok) return guard.response;
  const { actor, post } = guard;

  const parsed = parseChangePassword(entriesOf(post.fields));
  if (!parsed.ok) return validationReply(parsed.errors);

  const outcome = await changeSupplierPassword(actor, { current: parsed.value.current, next: parsed.value.password }, post.facts);
  if (outcome.ok) return portalReply({ ok: true, message: AUTH_WORDS.passwordChanged.en }, 200, supplierCookieHeader(outcome.token, outcome.maxAgeSeconds));
  switch (outcome.kind) {
    case "FIELDS":
      return validationReply(Object.fromEntries(Object.entries(outcome.faults).map(([field, fault]) => [field, fault.en])));
    case "LOCKED":
      return portalReply({ ok: false, code: "LOCKED", message: "This account is locked after too many wrong passwords. Try again later.", error: "locked" }, 403);
    case "THROTTLED":
      return portalReply({ ok: false, code: "THROTTLED", message: "Too many attempts just now. Wait a few minutes and try again.", error: "throttled" }, 429);
    case "POLICY_NOT_SET":
      return closedReply(outcome.unset);
  }
}
