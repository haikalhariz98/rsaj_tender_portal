import type { SignInEventKind } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";

import type { RequestFacts } from "./request";

/**
 * The sign-in log (ADR 0034 D16, ruling O-1). One permanent row per event, holding only which account and what kind; the source
 * address and the user agent go in the side table, so that the row that can never be deleted holds no personal data.
 *
 * A failure is written on the pool's own connection, never inside a transaction that may roll back: a refused attempt that
 * left no trace would be a throttle with nothing to count.
 */

export async function recordSignInEvent(
  client: Tx,
  event: { organisationId: string; store?: "STAFF" | "SUPPLIER"; staffAccountId?: string | null; supplierAccountId?: string | null; kind: SignInEventKind; request?: RequestFacts | null; at: Date },
): Promise<void> {
  // The store is the one the account belongs to (Phase 4a): a supplier account's events are the supplier store's. An event that names no account is the staff store's,
  // as it always was (a name that matched nothing at the staff sign-in); the supplier sign-in says `store: "SUPPLIER"` for a name that matched nothing there.
  const supplier = (event.store ?? (event.supplierAccountId != null ? "SUPPLIER" : "STAFF")) === "SUPPLIER";
  await client.signInEvent.create({
    data: {
      organisationId: event.organisationId,
      store: supplier ? "SUPPLIER" : "STAFF",
      staffAccountId: supplier ? null : (event.staffAccountId ?? null),
      supplierAccountId: supplier ? (event.supplierAccountId ?? null) : null,
      kind: event.kind,
      at: event.at,
      ...(event.request ? { detail: { create: { sourceAddress: event.request.sourceAddress, userAgent: event.request.userAgent } } } : {}),
    },
  });
}

/// The kinds of event that are a failure to get in or to confirm a password, and so count against the address they came from. A locked account's
/// refusals (`LOCKED_OUT`) count as well as a wrong password (`FAILED`) and a wrong step-up (`STEP_UP_FAILED`): left out, a locked name would
/// be a free target that costs a hash every time and is never held back. `THROTTLED` and `SESSION_LIMIT` do not: neither is a guess.
export const ADDRESS_COUNTED_KINDS: SignInEventKind[] = ["FAILED", "LOCKED_OUT", "STEP_UP_FAILED"];

/// How many failed attempts came from this address since `since`. Counted in the database so every instance shares the count. An unknown address is never counted (it is not an address).
export async function failedSignInsFrom(client: Tx, organisationId: string, sourceAddress: string | null, since: Date, store: "STAFF" | "SUPPLIER" = "STAFF"): Promise<number> {
  if (sourceAddress == null) return 0;
  return client.signInEvent.count({
    where: { organisationId, store, kind: { in: ADDRESS_COUNTED_KINDS }, at: { gte: since }, detail: { is: { sourceAddress } } },
  });
}
