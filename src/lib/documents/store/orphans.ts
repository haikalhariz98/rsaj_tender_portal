/**
 * Blobs no version points at. With the Postgres driver there are none — the bytes and
 * their version commit together — but a non-transactional driver writes before its
 * transaction, and a failed transaction can leave bytes behind. They are listed, never
 * deleted automatically: deleting bytes is not an act this build takes.
 */

/// Pure: the stored digests not referenced by any version.
export function orphanDigests(stored: readonly string[], referenced: ReadonlySet<string>): string[] {
  return stored.filter((s) => !referenced.has(s));
}

export async function orphanReport(organisationId: string): Promise<{ sha256: string; byteSize: bigint; storedAt: Date }[]> {
  const { db } = await import("@/lib/db");
  return db.$queryRaw<{ sha256: string; byteSize: bigint; storedAt: Date }[]>`
    SELECT b."sha256", b."byteSize", b."storedAt"
      FROM "BlobContent" b
     WHERE b."organisationId" = ${organisationId}
       AND NOT EXISTS (SELECT 1 FROM "DocumentVersion" v WHERE v."organisationId" = b."organisationId" AND v."sha256" = b."sha256")
     ORDER BY b."storedAt"`;
}
