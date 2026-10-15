import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sha256HexOf } from "./browser-hash";

describe("the hash the browser sends with a file (ADR 0036 D5)", () => {
  it("is SHA-256 as lower-case hex, the same as the server's", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 a bid part");
    const want = createHash("sha256").update(bytes).digest("hex");
    expect(await sha256HexOf(bytes.buffer as ArrayBuffer)).toBe(want);
    expect(want).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes an empty file too", async () => {
    expect(await sha256HexOf(new ArrayBuffer(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
