/**
 * The hash the browser computes of a file before it is sent (ADR 0036 D5): SHA-256 of the bytes, as 64 lower-case hex digits, sent as `contentSha256`. The portal hashes what it
 * received and refuses a file whose two hashes differ (HASH_MISMATCH). Web Crypto only, so it runs in a browser and in the tests alike. No arithmetic on money or time.
 */
export async function sha256HexOf(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
