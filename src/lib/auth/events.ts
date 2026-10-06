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
  event: { organisationId: string; staffAccountId?: string | null; kind: SignInEventKind; request?: RequestFacts | null; at: Date },
): Promise<void> {
  await client.signInEvent.create({
    data: {
      organisationId: event.organisationId,
      store: "STAFF",
      staffAccountId: event.staffAccountId ?? null,
      kind: event.kind,
      at: event.at,
      ...(event.request ? { detail: { create: { sourceAddress: event.request.sourceAddress, userAgent: event.request.userAgent } } } : {}),
    },
  });
}

/// How many failed sign-ins came from this address since `since`. Counted in the database so every instance shares the count. An unknown address is never counted (it is not an address).
export async function failedSignInsFrom(client: Tx, organisationId: string, sourceAddress: string | null, since: Date): Promise<number> {
  if (sourceAddress == null) return 0;
  return client.signInEvent.count({
    where: { organisationId, store: "STAFF", kind: "FAILED", at: { gte: since }, detail: { is: { sourceAddress } } },
  });
}
