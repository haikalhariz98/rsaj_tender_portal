import { describe, expect, it } from "vitest";

import { readBounded } from "./body";

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
