import { describe, expect, it } from "vitest";

import { combineShares, splitKey } from "./split";
import { generateX25519, publicOf } from "./x25519";

/**
 * The exercise key split n-of-n by XOR across every named officer (ADR 0036 D2, ruling 20k), and recombined only when its public key is derived again.
 */

const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const flip = (b: Uint8Array, byte: number, bit: number) => {
  const c = new Uint8Array(b);
  c[byte] ^= 1 << bit;
  return c;
};

describe("splitting and recombining the exercise key", () => {
  it.each([2, 3, 5])("recovers k from all %i shares, in any order", (n) => {
    const { privateKey: k, publicKey } = generateX25519();
    const shares = splitKey(k, n);
    expect(shares).toHaveLength(n);
    for (const s of shares) {
      expect(s.length).toBe(32);
      expect(toHex(s)).not.toBe(toHex(k));
    }
    const r = combineShares(shares, publicKey);
    expect(r.ok && toHex(r.k)).toBe(toHex(k));
    const reversed = combineShares([...shares].reverse(), publicKey);
    expect(reversed.ok && toHex(reversed.k)).toBe(toHex(k));
  });

  it.each([2, 3, 5])("refuses %i shares less one: every named officer is needed", (n) => {
    const { privateKey: k, publicKey } = generateX25519();
    const shares = splitKey(k, n);
    expect(combineShares(shares.slice(1), publicKey)).toEqual({ ok: false, fault: n - 1 < 2 ? "SHARE_COUNT" : "SHARE_MISMATCH" });
  });

  it("refuses fewer than two shares, and a share of the wrong length", () => {
    const { privateKey: k, publicKey } = generateX25519();
    expect(combineShares([], publicKey)).toEqual({ ok: false, fault: "SHARE_COUNT" });
    expect(combineShares([k], publicKey)).toEqual({ ok: false, fault: "SHARE_COUNT" });
    const shares = splitKey(k, 2);
    expect(combineShares([shares[0], shares[1].subarray(0, 31)], publicKey)).toEqual({ ok: false, fault: "SHARE_MISMATCH" });
  });

  it("an altered share, with a NON-clamped bit flipped, is refused as SHARE_MISMATCH", () => {
    const { privateKey: k, publicKey } = generateX25519();
    const shares = splitKey(k, 3);
    // Not bits 0 to 2 of byte 0, not bits 6 or 7 of byte 31: each of these changes the scalar X25519 uses.
    for (const [byte, bit] of [[0, 3], [0, 7], [15, 3], [16, 0], [31, 0], [31, 5]] as const) {
      const altered = shares.map((s, i) => (i === 1 ? flip(s, byte, bit) : s));
      expect(combineShares(altered, publicKey), `byte ${byte} bit ${bit}`).toEqual({ ok: false, fault: "SHARE_MISMATCH" });
    }
  });

  it("a flip confined to a bit X25519 clamps away gives the same key: the same public key, so there is nothing to tell apart", () => {
    const { privateKey: k } = generateX25519();
    for (const [byte, bit] of [[0, 0], [0, 1], [0, 2], [31, 6], [31, 7]] as const) expect(toHex(publicOf(flip(k, byte, bit))), `byte ${byte} bit ${bit}`).toBe(toHex(publicOf(k)));
  });

  it("a share set from another key, or the right shares against another key's public key, is refused", () => {
    const a = generateX25519();
    const b = generateX25519();
    expect(combineShares(splitKey(a.privateKey, 2), b.publicKey)).toEqual({ ok: false, fault: "SHARE_MISMATCH" });
    const sa = splitKey(a.privateKey, 2);
    const sb = splitKey(b.privateKey, 2);
    expect(combineShares([sa[0], sb[1]], a.publicKey)).toEqual({ ok: false, fault: "SHARE_MISMATCH" });
  });

  it("refuses to split for fewer than two officers, or a key that is not 32 bytes", () => {
    const { privateKey: k } = generateX25519();
    expect(() => splitKey(k, 1)).toThrow("FORMAT");
    expect(() => splitKey(k, 2.5)).toThrow("FORMAT");
    expect(() => splitKey(k.subarray(0, 16), 2)).toThrow("LENGTH");
  });
});
