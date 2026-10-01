/**
 * The Postgres driver (OD-1): bytes in `BlobContent` as bytea, written inside the
 * caller's transaction, so a version can never exist without its bytes or its audit
 * row, and backups of the database include the documents. Content-addressed per
 * organisation: `INSERT … ON CONFLICT DO NOTHING` makes a second upload of the same
 * bytes (even a concurrent one) a no-op rather than a race.
 */

import type { Tx } from "@/lib/audit/record";

import { isSha256, sha256Hex } from "./digest";
import type { BlobStore } from "./types";

export class BlobAddressError extends Error {
  constructor(readonly expected: string, readonly actual: string) {
    super("The bytes do not hash to the address they were stored under.");
  }
}

/// A Buffer over the same memory, not a copy of it.
const asBuffer = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength);

export const postgresBlobStore: BlobStore = {
  driver: "postgres",
  transactional: true,
  async put(tx: Tx, organisationId: string, sha256: string, bytes: Uint8Array) {
    const actual = sha256Hex(bytes);
    if (!isSha256(sha256) || actual !== sha256) throw new BlobAddressError(sha256, actual);
    const size = BigInt(bytes.byteLength);
    await tx.$executeRaw`
      INSERT INTO "BlobContent" ("organisationId", "sha256", "byteSize", "bytes", "storedAt")
      VALUES (${organisationId}, ${sha256}, ${size}, ${asBuffer(bytes)}, now())
      ON CONFLICT ("organisationId", "sha256") DO NOTHING`;
  },
  async get(organisationId: string, sha256: string) {
    if (!isSha256(sha256)) return null;
    // Read lazily: the façade is importable where no database is configured (tests).
    const { db } = await import("@/lib/db");
    const row = await db.blobContent.findUnique({ where: { organisationId_sha256: { organisationId, sha256 } }, select: { bytes: true } });
    // The driver's own array, not a copy of it: a 50 MB file is held once, not twice.
    return row ? row.bytes : null;
  },
};
