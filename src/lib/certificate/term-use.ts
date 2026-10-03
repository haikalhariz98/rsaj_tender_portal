/**
 * Which issued certificates' frozen text still says an alias (BD-614-33 as ruled; residual consider). A read only, inside
 * the glossary save's transaction: the match is `wholeWordPattern`'s (the pure rule, `wordAt`'s, in terms.ts), run in
 * the database so only the certificates' numbers are read, never their text, and capped at ALIAS_USE_SHOWN with the
 * whole count beside it.
 */

import type { Tx } from "@/lib/audit/record";

import { ALIAS_USE_SHOWN, wholeWordPattern } from "./terms";

/// An alias, the certificates named for it (at most ALIAS_USE_SHOWN, by number), and how many there are in all.
export type AliasUse = { alias: string; numbers: string[]; total: number };

export async function aliasInUse(tx: Tx, organisationId: string, alias: string): Promise<AliasUse> {
  const pattern = wholeWordPattern(alias);
  if (!pattern) return { alias, numbers: [], total: 0 };
  const rows = await tx.$queryRaw<{ number: string | null; total: number }[]>`SELECT x."number", count(*) OVER ()::int AS total FROM (SELECT DISTINCT c."id", c."number" FROM "CertificateDocument" d JOIN "Certificate" c ON c."id" = d."certificateId" WHERE d."organisationId" = ${organisationId} AND c."status" = 'ISSUED' AND d."renderedText" ~* ${pattern}) x ORDER BY x."number" COLLATE "C" ASC NULLS LAST, x."id" COLLATE "C" ASC LIMIT ${ALIAS_USE_SHOWN}`;
  return { alias, numbers: rows.map((r) => r.number ?? "a certificate"), total: rows[0]?.total ?? 0 };
}
