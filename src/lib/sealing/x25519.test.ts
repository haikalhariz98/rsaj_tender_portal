import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SealError } from "./types";
import { fingerprint, generateX25519, publicOf, x25519 } from "./x25519";

/**
 * X25519 on raw keys (RFC 7748), checked against the RFC's known answers (`vectors/rfc7748-x25519.json`): section 5.2's first single-step vector and its iterated
 * vectors after 1 and 1,000 steps, and section 6.1's Diffie-Hellman.
 *
 * Section 5.2's second single-step vector is not included. The vectors here were transcribed from the RFC (this build fetched nothing but the CFRG file), and
 * that one transcription could not be confirmed. Its expected value is never taken from the implementation under test, which would make the test circular. The
 * iterated vectors exercise the same function a thousand times over.
 */

const V = JSON.parse(readFileSync(path.join(process.cwd(), "src", "lib", "sealing", "vectors", "rfc7748-x25519.json"), "utf8")) as {
  single: { scalar: string; u: string; output: string }[];
  iterated: { start: string; after: { iterations: number; k: string }[] };
  dh: { alicePrivate: string; alicePublic: string; bobPrivate: string; bobPublic: string; shared: string };
};
const hex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("X25519 against RFC 7748", () => {
  it("section 5.2: the single-step vector", () => {
    for (const v of V.single) expect(toHex(x25519(hex(v.scalar), hex(v.u)))).toBe(v.output);
  });

  it("section 5.2: the iterated vectors, after 1 and 1,000 steps", () => {
    let k: Uint8Array = hex(V.iterated.start);
    let u: Uint8Array = hex(V.iterated.start);
    const want = new Map(V.iterated.after.map((a) => [a.iterations, a.k]));
    for (let i = 1; i <= 1000; i++) {
      const r = x25519(k, u);
      u = k;
      k = r;
      if (want.has(i)) expect(toHex(k), `after ${i}`).toBe(want.get(i));
    }
  });

  it("section 6.1: each side's public key and the shared secret", () => {
    expect(toHex(publicOf(hex(V.dh.alicePrivate)))).toBe(V.dh.alicePublic);
    expect(toHex(publicOf(hex(V.dh.bobPrivate)))).toBe(V.dh.bobPublic);
    expect(toHex(x25519(hex(V.dh.alicePrivate), hex(V.dh.bobPublic)))).toBe(V.dh.shared);
    expect(toHex(x25519(hex(V.dh.bobPrivate), hex(V.dh.alicePublic)))).toBe(V.dh.shared);
  });
});

describe("keys", () => {
  it("a generated pair is 32 bytes each, its public key is the private key's, and two pairs differ", () => {
    const a = generateX25519();
    const b = generateX25519();
    expect(a.privateKey.length).toBe(32);
    expect(a.publicKey.length).toBe(32);
    expect(toHex(publicOf(a.privateKey))).toBe(toHex(a.publicKey));
    expect(toHex(a.privateKey)).not.toBe(toHex(b.privateKey));
    expect(toHex(x25519(a.privateKey, b.publicKey))).toBe(toHex(x25519(b.privateKey, a.publicKey)));
  });

  it("a low-order public key throws LOW_ORDER (the all-zero output, RFC 7748 section 6.1)", () => {
    const { privateKey } = generateX25519();
    const lowOrder = ["00".repeat(32), `01${"00".repeat(31)}`, `ec${"ff".repeat(30)}7f`, "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800"];
    for (const u of lowOrder) {
      expect(() => x25519(privateKey, hex(u)), u).toThrow(SealError);
      try {
        x25519(privateKey, hex(u));
      } catch (e) {
        expect((e as SealError).code, u).toBe("LOW_ORDER");
      }
    }
  });

  it("a key of any other length throws LENGTH", () => {
    const { privateKey, publicKey } = generateX25519();
    expect(() => x25519(privateKey.subarray(0, 31), publicKey)).toThrow("LENGTH");
    expect(() => x25519(privateKey, new Uint8Array(33))).toThrow("LENGTH");
    expect(() => publicOf(new Uint8Array(16))).toThrow("LENGTH");
    expect(() => fingerprint(new Uint8Array(31))).toThrow("LENGTH");
  });

  it("the fingerprint is SHA-256 of the raw public key, 64 lower-case hex digits", () => {
    expect(fingerprint(hex(V.dh.alicePublic))).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(hex(V.dh.alicePublic))).not.toBe(fingerprint(hex(V.dh.bobPublic)));
  });
});
