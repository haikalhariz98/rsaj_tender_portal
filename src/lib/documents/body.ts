/**
 * Reading an upload's body without trusting its declared length: counted as it
 * arrives, and abandoned the moment it passes the limit, so a body sent with no length
 * (or a false one) can never be read past what the cap allows (scope ruling: "upload
 * with no length refused or counted" — counted).
 */

export type BoundedRead = { ok: true; bytes: Uint8Array } | { ok: false; reason: "TOO_LARGE"; readBytes: bigint } | { ok: false; reason: "REQUEST_UNREADABLE"; readBytes: bigint };

export async function readBounded(body: ReadableStream<Uint8Array> | null, limit: bigint): Promise<BoundedRead> {
  if (!body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0n;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += BigInt(value.byteLength);
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "TOO_LARGE", readBytes: total };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "REQUEST_UNREADABLE", readBytes: total };
  }
  const out = new Uint8Array(Number(total));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, bytes: out };
}
