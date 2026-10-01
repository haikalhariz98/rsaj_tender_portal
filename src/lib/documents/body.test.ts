import { describe, expect, it } from "vitest";

import { limitBody, readBounded } from "./body";

const stream = (sizes: number[], onPull?: () => void) => {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      onPull?.();
      if (i < sizes.length) c.enqueue(new Uint8Array(sizes[i++]).fill(7));
      else c.close();
    },
  });
};

describe("reading an upload without trusting its length", () => {
  it("reads a body up to and exactly at the limit", async () => {
    const r = await readBounded(stream([4, 4, 2]), 10n);
    expect(r.ok && r.bytes.length).toBe(10);
  });
  it("stops reading the moment the body passes the limit, whatever was declared", async () => {
    let pulls = 0;
    const r = await readBounded(stream([6, 6, 6, 6, 6, 6], () => pulls++), 10n);
    expect(r).toEqual({ ok: false, reason: "TOO_LARGE", readBytes: 12n });
    expect(pulls).toBeLessThan(6);
  });
  it("no body reads as empty", async () => {
    expect(await readBounded(null, 10n)).toEqual({ ok: true, bytes: new Uint8Array(0) });
  });
});

describe("passing an upload through a bound without holding it (audit C-1)", () => {
  const drain = async (s: ReadableStream<Uint8Array>) => {
    const r = s.getReader();
    let n = 0;
    for (;;) {
      const { done, value } = await r.read();
      if (done) return n;
      n += value.byteLength;
    }
  };
  it("passes a body up to and exactly at the limit, unchanged", async () => {
    const b = limitBody(stream([4, 4, 2]), 10n);
    expect(await drain(b.stream)).toBe(10);
    expect(b.seen()).toBe(10n);
    expect(b.exceeded()).toBe(false);
  });
  it("errors the stream the moment the body passes the limit, and stops pulling", async () => {
    let pulls = 0;
    const b = limitBody(stream([6, 6, 6, 6, 6, 6], () => pulls++), 10n);
    await expect(drain(b.stream)).rejects.toThrow();
    expect(b.exceeded()).toBe(true);
    expect(b.seen()).toBe(12n);
    expect(pulls).toBeLessThan(6);
  });
  it("hands a parser the bytes it would have read directly", async () => {
    const form = new FormData();
    form.set("title", "t");
    form.set("file", new File([new Uint8Array(1000).fill(9)], "a.pdf", { type: "application/pdf" }));
    const src = new Response(form);
    const b = limitBody(src.body, 100_000n);
    const parsed = await new Response(b.stream, { headers: { "content-type": src.headers.get("content-type")! } }).formData();
    expect((parsed.get("file") as File).size).toBe(1000);
    expect(parsed.get("title")).toBe("t");
  });
  it("a bound that is passed makes the parse fail, so the route can say too large", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(5000)], "a.pdf"));
    const src = new Response(form);
    const b = limitBody(src.body, 1000n);
    await expect(new Response(b.stream, { headers: { "content-type": src.headers.get("content-type")! } }).formData()).rejects.toThrow();
    expect(b.exceeded()).toBe(true);
  });
  it("no body is an empty one", async () => {
    expect(await drain(limitBody(null, 10n).stream)).toBe(0);
  });
});
