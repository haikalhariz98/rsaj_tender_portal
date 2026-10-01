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

export interface LimitedBody {
  /// The body, passed through chunk by chunk and errored the moment it passes the limit.
  stream: ReadableStream<Uint8Array>;
  /// Bytes seen so far.
  seen(): bigint;
  /// Whether the limit was passed (the stream is then errored, and parsing it fails).
  exceeded(): boolean;
}

/**
 * The same bound as `readBounded`, without holding the body ourselves: chunks pass
 * through to whoever parses the stream (the multipart parser), which is then the only
 * holder of the bytes. `readBounded` joined the chunks into one array, which was then
 * copied into a Blob for the parser to read again (audit C-1).
 */
export function limitBody(body: ReadableStream<Uint8Array> | null, limit: bigint): LimitedBody {
  let total = 0n;
  let over = false;
  const counted = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += BigInt(chunk.byteLength);
      if (total > limit) {
        over = true;
        controller.error(new Error("The body is over its limit."));
        return;
      }
      controller.enqueue(chunk);
    },
  });
  // A missing body is an empty one.
  const stream = (body ?? new ReadableStream<Uint8Array>({ start: (c) => c.close() })).pipeThrough(counted);
  return { stream, seen: () => total, exceeded: () => over };
}
