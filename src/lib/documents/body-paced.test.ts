import { describe, expect, it } from "vitest";

import { limitBodyPaced } from "./body";

/** Wave 3b step 9: a body is cut off at the deadline even when no chunk arrives, and under the minimum rate when chunks trickle (S17, S19). */

function fakeClock() {
  let t = 0;
  let pending: { fn: () => void; at: number } | null = null;
  return {
    clock: {
      now: () => t,
      setTimer: (fn: () => void, ms: number) => (pending = { fn, at: t + ms }),
      clearTimer: () => (pending = null),
    },
    advance(ms: number) {
      t += ms;
      if (pending && t >= pending.at) {
        const p = pending;
        pending = null;
        p.fn();
      }
    },
  };
}

const PACE = { deadlineMs: 60_000, minBytesPerSecond: 1000, graceMs: 2000 };

async function drain(s: ReadableStream<Uint8Array>): Promise<{ ok: boolean; bytes: number }> {
  const r = s.getReader();
  let n = 0;
  try {
    for (;;) {
      const x = await r.read();
      if (x.done) return { ok: true, bytes: n };
      n += x.value.byteLength;
    }
  } catch {
    return { ok: false, bytes: n };
  }
}

describe("limitBodyPaced", () => {
  it("passes a body that arrives in time", async () => {
    const f = fakeClock();
    const src = new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(new Uint8Array(500)); c.enqueue(new Uint8Array(500)); c.close(); } });
    const p = limitBodyPaced(src, 10_000n, PACE, f.clock);
    expect(await drain(p.stream)).toEqual({ ok: true, bytes: 1000 });
    expect(p.tooSlow()).toBe(false);
    expect(p.exceeded()).toBe(false);
  });

  it("cuts off a body that sends nothing at the deadline", async () => {
    const f = fakeClock();
    const src = new ReadableStream<Uint8Array>({ start() { /* never sends, never closes */ } });
    const p = limitBodyPaced(src, 10_000n, PACE, f.clock);
    const done = drain(p.stream);
    f.advance(60_001);
    expect((await done).ok).toBe(false);
    expect(p.tooSlow()).toBe(true);
  });

  it("cuts off a body that trickles under the minimum rate after the grace", async () => {
    const f = fakeClock();
    let c!: ReadableStreamDefaultController<Uint8Array>;
    const src = new ReadableStream<Uint8Array>({ start: (x) => { c = x; } });
    const p = limitBodyPaced(src, 10_000n, PACE, f.clock);
    const done = drain(p.stream);
    c.enqueue(new Uint8Array(10));
    await Promise.resolve();
    f.advance(5000);
    c.enqueue(new Uint8Array(10));
    expect((await done).ok).toBe(false);
    expect(p.tooSlow()).toBe(true);
  });

  it("is over its limit, not too slow, when the limit is passed", async () => {
    const f = fakeClock();
    const src = new ReadableStream<Uint8Array>({ start: (c) => { c.enqueue(new Uint8Array(600)); c.close(); } });
    const p = limitBodyPaced(src, 500n, PACE, f.clock);
    expect((await drain(p.stream)).ok).toBe(false);
    expect(p.exceeded()).toBe(true);
    expect(p.tooSlow()).toBe(false);
  });
});
