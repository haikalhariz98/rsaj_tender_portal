import type { Tx } from "@/lib/audit/record";
import { sha256Hex } from "@/lib/documents/store";

/**
 * The spent register form tokens (ADR 0041 D8, plan 3.5). A token is spent only by an application that was received: its SHA-256 (never the token) is written first in the
 * application's own transaction, then set to the application. A retry with the same token is answered from here, with the stored application's reference, before a byte of its body
 * is read. A refused submission never spends its token. Server-only: it reads the database.
 */

/// The SHA-256 of a token, as stored. The token itself is never stored.
export const tokenSha256 = (token: string): string => sha256Hex(new TextEncoder().encode(token));

/// The application a token already made, or null where the token is unspent. Within the deployment's organisation only.
export async function findSpent(client: Tx, organisationId: string, tokenSha: string): Promise<{ reference: string } | null> {
  const row = await client.portalFormToken.findFirst({
    where: { organisationId, tokenSha256: tokenSha, portalApplicationId: { not: null } },
    select: { portalApplication: { select: { reference: true } } },
  });
  return row?.portalApplication ? { reference: row.portalApplication.reference } : null;
}
