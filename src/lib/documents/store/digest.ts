import { createHash } from "node:crypto";

/// The SHA-256 of the bytes, lowercase hex: the blob's address, the version's
/// fingerprint and the integrity check, all one value.
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export const isSha256 = (s: string) => /^[0-9a-f]{64}$/.test(s);
