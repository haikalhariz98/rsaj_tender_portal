import { describe, expect, it, vi } from "vitest";

/**
 * The sealing modules import one another through `types.ts`, which re-exports from `x25519` and `hpke`. Whichever of them a process imports first must not change what
 * they do: a constant read from another module at load time is undefined when that module is the first one imported (found in step 9: sealing a part failed with LENGTH
 * whenever `x25519` was imported before `hpke`).
 */
describe("the sealing modules work whichever is imported first", () => {
  it.each([["./x25519"], ["./hpke"], ["./types"], ["./file-seal"], ["./open"], ["./split"]])("starting from %s", async (first) => {
    vi.resetModules();
    await import(/* @vite-ignore */ first);
    const { generateX25519 } = await import("./x25519");
    const { sealFile } = await import("./file-seal");
    const pair = generateX25519();
    const sealed = sealFile({ context: { organisationId: "o", exerciseId: "e", keyId: "k", fileId: "f", packPartId: "p" }, exercisePublicKey: pair.publicKey, plain: new Uint8Array(4), meta: { v: 1, filename: "a", mediaType: "b", plainSha256: "c", plainBytes: "4" } });
    expect(sealed.sealedDek.length).toBe(32 + 32 + 16);
  });
});
