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

export interface Pace {
  /// The whole body must have arrived by then.
  deadlineMs: number;
  /// After `graceMs`, the bytes seen so far divided by the time taken must not fall below this.
  minBytesPerSecond: number;
  graceMs: number;
}

export interface PacedBody {
  stream: ReadableStream<Uint8Array>;
  seen(): bigint;
  exceeded(): boolean;
  /// True when the body was cut off for arriving too slowly (past the deadline, or under the minimum rate). Takes precedence over `exceeded` only when the limit was not passed.
  tooSlow(): boolean;
}

/**
 * `limitBody` with a clock on it (wave 3b step 9; threat S17, S19). A byte count alone never fires when no chunk arrives, so a body that sends nothing would hold its slot for
 * ever: a timer cuts the stream off at the deadline, and each chunk checks the rate against the time since the body began. The clock and the timer are injectable so a test
 * proves the cut-off without waiting for it. Chunks pass through to whoever parses the stream; this holds none of them.
 */
export function limitBodyPaced(
  body: ReadableStream<Uint8Array> | null,
  limit: bigint,
  pace: Pace,
  clock: { now(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(t: unknown): void } = { now: () => Date.now(), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) },
): PacedBody {
  const source = (body ?? new ReadableStream<Uint8Array>({ start: (c) => c.close() })).getReader();
  const began = clock.now();
  let total = 0n;
  let over = false;
  let slow = false;
  let timer: unknown = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = clock.setTimer(() => {
        slow = true;
        source.cancel().catch(() => undefined);
        try {
          controller.error(new Error("The body took too long."));
        } catch {
          // already closed or errored
        }
      }, pace.deadlineMs);
    },
    async pull(controller) {
      let r: ReadableStreamReadResult<Uint8Array>;
      try {
        r = await source.read();
      } catch (e) {
        if (timer !== null) clock.clearTimer(timer);
        controller.error(e);
        return;
      }
      if (r.done) {
        if (timer !== null) clock.clearTimer(timer);
        controller.close();
        return;
      }
      total += BigInt(r.value.byteLength);
      if (total > limit) {
        over = true;
        if (timer !== null) clock.clearTimer(timer);
        await source.cancel().catch(() => undefined);
        controller.error(new Error("The body is over its limit."));
        return;
      }
      const elapsed = clock.now() - began;
      if (elapsed > pace.graceMs && Number(total) / (elapsed / 1000) < pace.minBytesPerSecond) {
        slow = true;
        if (timer !== null) clock.clearTimer(timer);
        await source.cancel().catch(() => undefined);
        controller.error(new Error("The body is arriving too slowly."));
        return;
      }
      controller.enqueue(r.value);
    },
    async cancel(reason) {
      if (timer !== null) clock.clearTimer(timer);
      await source.cancel(reason).catch(() => undefined);
    },
  });
  return { stream, seen: () => total, exceeded: () => over, tooSlow: () => slow && !over };
}
