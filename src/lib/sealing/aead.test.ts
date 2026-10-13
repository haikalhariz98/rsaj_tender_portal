import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalAad } from "./aad";
import { aeadOpen, aeadSeal, gcmSeal, packGcm, unpackGcm, zero } from "./aead";
import { gcmOpen } from "./open";
import { SealError, type AadContext, type GcmSealed } from "./types";

/**
 * AES-GCM (ADR 0036 D2), checked against the McGrew-Viega GCM specification's AES-256 cases selected by a 96-bit IV (13 to 16;
 * `vectors/gcm-mcgrew-viega-aes256.json`). Cases 17 and 18 use other IV lengths and are excluded: `gcmSeal` makes 96-bit IVs only.
 */

const V = JSON.parse(readFileSync(path.join(process.cwd(), "src", "lib", "sealing", "vectors", "gcm-mcgrew-viega-aes256.json"), "utf8")) as {
  cases: { name: string; key: string; iv: string; plaintext: string; aad: string; ciphertext: string; tag: string }[];
  excluded: { name: string; ivBits: number }[];
};
const hex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const AAD: AadContext = { purpose: "FILE_BODY", organisationId: "org1", exerciseId: "ex1", keyId: "key1", recordId: "file1", partKey: "part1" };
const flip = (b: Uint8Array, i: number, bit = 0) => {
  const c = new Uint8Array(b);
  c[i] ^= 1 << bit;
  return c;
};
const code = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof SealError ? e.code : `not a SealError: ${String(e)}`;
  }
};

describe("AES-256-GCM against the McGrew-Viega cases with a 96-bit IV", () => {
  it("only the 96-bit IV cases are run, and 17 and 18 are excluded for their IV length", () => {
    expect(V.cases.map((c) => c.name)).toEqual(["13", "14", "15", "16"]);
    for (const c of V.cases) expect(c.iv.length).toBe(24);
    expect(V.excluded.every((e) => e.ivBits !== 96)).toBe(true);
  });

  it.each(V.cases.map((c) => [c.name, c] as const))("case %s seals to the published ciphertext and tag, and opens back", (_n, c) => {
    const { ct, tag } = aeadSeal("aes-256-gcm", hex(c.key), hex(c.iv), hex(c.aad), hex(c.plaintext));
    expect(toHex(ct)).toBe(c.ciphertext);
    expect(toHex(tag)).toBe(c.tag);
    expect(toHex(aeadOpen("aes-256-gcm", hex(c.key), hex(c.iv), hex(c.aad), hex(c.ciphertext), hex(c.tag)))).toBe(c.plaintext);
  });

  it("case 16 with any changed bit in the IV, the ciphertext, the tag or the AAD fails its tag", () => {
    const c = V.cases.find((x) => x.name === "16")!;
    const open = (iv: Uint8Array, ct: Uint8Array, tag: Uint8Array, aad: Uint8Array) => code(() => aeadOpen("aes-256-gcm", hex(c.key), iv, aad, ct, tag));
    expect(open(flip(hex(c.iv), 11, 7), hex(c.ciphertext), hex(c.tag), hex(c.aad))).toBe("TAG");
    expect(open(hex(c.iv), flip(hex(c.ciphertext), 30, 2), hex(c.tag), hex(c.aad))).toBe("TAG");
    expect(open(hex(c.iv), hex(c.ciphertext), flip(hex(c.tag), 0, 0), hex(c.aad))).toBe("TAG");
    expect(open(hex(c.iv), hex(c.ciphertext), hex(c.tag), flip(hex(c.aad), 19, 4))).toBe("TAG");
  });
});

describe("gcmSeal and gcmOpen, with the canonical AAD", () => {
  const key = new Uint8Array(32).fill(7);
  const body = new TextEncoder().encode("Grand Summary, page 1");

  it("seals with a fresh 96-bit IV each time and opens back", () => {
    const a = gcmSeal(key, body, AAD);
    const b = gcmSeal(key, body, AAD);
    expect(a.iv.length).toBe(12);
    expect(a.tag.length).toBe(16);
    expect(toHex(a.iv)).not.toBe(toHex(b.iv));
    expect(new TextDecoder().decode(gcmOpen(key, a, AAD))).toBe("Grand Summary, page 1");
    expect(toHex(gcmOpen(key, unpackGcm(packGcm(a)), AAD))).toBe(toHex(body));
  });

  it("a flipped bit in the IV, the ciphertext or the tag, or a change to any AAD field, fails", () => {
    const s = gcmSeal(key, body, AAD);
    const open = (x: GcmSealed, aad: AadContext = AAD) => code(() => gcmOpen(key, x, aad));
    expect(open({ ...s, iv: flip(s.iv, 0) })).toBe("TAG");
    expect(open({ ...s, ct: flip(s.ct, 5, 6) })).toBe("TAG");
    expect(open({ ...s, tag: flip(s.tag, 15, 7) })).toBe("TAG");
    for (const field of ["purpose", "organisationId", "exerciseId", "keyId", "recordId", "partKey"] as const) {
      const changed = { ...AAD, [field]: field === "purpose" ? "FILE_META" : `${AAD[field]}x` } as AadContext;
      expect(canonicalAad(changed)).not.toBe(canonicalAad(AAD));
      expect(open(s, changed), field).toBe("TAG");
    }
    expect(open(s, { ...AAD, partKey: undefined })).toBe("TAG");
    expect(open(s)).toBeNull();
  });

  it("a wrong key fails its tag, and a short key, IV or tag is refused, never accepted truncated", () => {
    const s = gcmSeal(key, body, AAD);
    expect(code(() => gcmOpen(new Uint8Array(32).fill(8), s, AAD))).toBe("TAG");
    expect(code(() => gcmSeal(new Uint8Array(16), body, AAD))).toBe("LENGTH");
    expect(code(() => gcmOpen(key, { ...s, tag: s.tag.subarray(0, 12) }, AAD))).toBe("LENGTH");
    expect(code(() => gcmOpen(key, { ...s, iv: s.iv.subarray(0, 8) }, AAD))).toBe("LENGTH");
    expect(code(() => unpackGcm(new Uint8Array(20)))).toBe("LENGTH");
  });

  it("zero clears every buffer it is given", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    zero(a, b);
    expect([...a, ...b]).toEqual([0, 0, 0, 0, 0]);
  });
});
