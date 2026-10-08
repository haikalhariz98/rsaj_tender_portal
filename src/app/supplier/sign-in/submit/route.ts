import { entriesOf } from "@/lib/auth/json-body";
import { parseSignIn } from "@/lib/auth/forms";
import { SUPPLIER_AFTER_SIGN_IN } from "@/lib/auth/routes";
import { SupplierCredentials } from "@/lib/auth/supplier-identity";
import { AUTH_WORDS } from "@/lib/auth/words";

import { closedReply, portalReply, readPortalPost, supplierCookieHeader, validationReply } from "../../../_auth/supplier";

export const dynamic = "force-dynamic";

/**
 * A supplier signs in (Phase 4a, ADR 0034 D7). A route handler at a literal path, not a server action: the public copy refuses every action. It passes the Origin guard
 * and carries a form token (`readPortalPost`), reads the two fields the form has and refuses any other, and answers one sentence whether the password is wrong, the
 * account is locked or waiting for its code, the address is held back or the name matches nothing. The session cookie is set on the response, a new token every time.
 */
export async function POST(request: Request) {
  const first = await readPortalPost(request, "sign-in");
  if (!first.ok) return first.response;
  const { facts, token } = first.post;

  const parsed = parseSignIn(entriesOf(first.post.fields));
  if (!parsed.ok) return validationReply(parsed.errors);

  const outcome = await SupplierCredentials.authenticate(parsed.value, { request: facts, replacingToken: token });
  if (outcome.ok) return portalReply({ ok: true, href: SUPPLIER_AFTER_SIGN_IN }, 200, supplierCookieHeader(outcome.token, outcome.maxAgeSeconds));
  switch (outcome.kind) {
    case "SESSION_LIMIT":
      return portalReply({ ok: false, code: "SESSION_LIMIT", message: AUTH_WORDS.sessionLimit.en, error: "session limit" }, 403);
    case "NOT_CONFIGURED":
      return portalReply({ ok: false, code: "NOT_CONFIGURED", message: AUTH_WORDS.notConfigured.en, error: "not configured" }, 503);
    case "UNSAFE_DATABASE_ROLE":
      return portalReply({ ok: false, code: "CLOSED", message: AUTH_WORDS.unsafeDatabaseRole.en, error: "closed" }, 503);
    case "POLICY_NOT_SET":
      return closedReply(outcome.unset);
    case "FAILED":
      // The same words for a wrong password, a locked account, a held-back address, an account waiting for its code and a name that does not exist.
      return portalReply({ ok: false, code: "SIGN_IN_FAILED", message: AUTH_WORDS.signInFailed.en, error: "sign-in failed" }, 401);
  }
}
