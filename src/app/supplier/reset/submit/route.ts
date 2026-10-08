import { entriesOf } from "@/lib/auth/json-body";
import { parseCodeForm } from "@/lib/auth/forms";
import { SUPPLIER_SIGN_IN_PATH } from "@/lib/auth/routes";
import { redeemSupplierCode } from "@/lib/auth/supplier-account-store";
import { AUTH_WORDS } from "@/lib/auth/words";

import { closedReply, portalReply, readPortalPost, validationReply } from "../../../_auth/supplier";

export const dynamic = "force-dynamic";

/**
 * A supplier sets a new password with the one-time RESET code an officer handed them after checking who was asking (Phase 4a, ADR 0034 D6, threat model F7). A reset
 * code only: an activation code brought here is refused as any wrong code is. Using it ends every session the account has.
 */
export async function POST(request: Request) {
  const first = await readPortalPost(request, "reset");
  if (!first.ok) return first.response;

  const parsed = parseCodeForm(entriesOf(first.post.fields));
  if (!parsed.ok) return validationReply(parsed.errors);

  const outcome = await redeemSupplierCode({ purpose: "RESET", loginName: parsed.value.loginName, code: parsed.value.code, password: parsed.value.password }, first.post.facts);
  if (outcome.ok) return portalReply({ ok: true, href: `${SUPPLIER_SIGN_IN_PATH}?password=set` });
  switch (outcome.kind) {
    case "FIELDS":
      return validationReply(Object.fromEntries(Object.entries(outcome.faults).map(([field, fault]) => [field, fault.en])));
    case "NOT_CONFIGURED":
      return portalReply({ ok: false, code: "NOT_CONFIGURED", message: AUTH_WORDS.notConfigured.en, error: "not configured" }, 503);
    case "UNSAFE_DATABASE_ROLE":
      return portalReply({ ok: false, code: "CLOSED", message: AUTH_WORDS.unsafeDatabaseRole.en, error: "closed" }, 503);
    case "POLICY_NOT_SET":
      return closedReply(outcome.unset);
    case "FAILED":
      return portalReply({ ok: false, code: "CODE_FAILED", message: AUTH_WORDS.codeFailed.en, error: "code failed" }, 400);
  }
}
