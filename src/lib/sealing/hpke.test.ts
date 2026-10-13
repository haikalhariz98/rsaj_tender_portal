import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalAad } from "./aad";
import { AES_128_GCM, AES_256_GCM, contextExport, contextOpen, contextSeal, decap, deriveKeyPair, encap, hkdfExpand, hkdfExtract, hpkeSeal, keyScheduleBase, nonceFor, openBase, packHpke, sealBase, unpackHpke, type HpkeAead } from "./hpke";
import { hpkeOpen } from "./open";
import { SealError, type AadContext, type HpkeSealed } from "./types";
import { generateX25519 } from "./x25519";

/**
 * HPKE (RFC 9180, base mode), composed in `hpke.ts` from X25519 and HMAC, checked against the published vectors (ADR 0036 D2, build plan step 4):
 * - the CFRG test-vectors.json entry for mode 0, DHKEM(X25519, HKDF-SHA256) 0x0020, HKDF-SHA256 0x0001, AES-256-GCM 0x0002, the product's suite;
 * - RFC 9180 appendix A.1, the same KEM and KDF with AES-128-GCM 0x0001, through the parameterised AEAD (its CFRG entry, which carries A.1's values).
 * Both entries are vendored byte for byte from the file fetched on 2026-10-13 (`vectors/hpke-cfrg-source.json` records the source and its SHA-256), and each
 * vendored file's SHA-256 is pinned here, so a changed vector cannot pass unnoticed. Every key, the shared secret, the key schedule, all 257 sequence numbers and
 * every exported secret are checked; the single-shot seal is checked against the first.
 * Also RFC 5869's HKDF-SHA256 vectors (appendix A.1 to A.3), since HKDF is built here from HMAC.
 */

const VECTORS = path.join(process.cwd(), "src", "lib", "sealing", "vectors");
const read = (name: string) => readFileSync(path.join(VECTORS, name));
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const hex = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/// The pinned SHA-256 of each vendored file (the entry's bytes as they stand in the CFRG file, then one newline).
const PINNED: Record<string, string> = {
  "hpke-cfrg-x25519-sha256-aes256gcm.json": "34f651ff9568b274632c851b4e117a82757d345b1a893846a8cb756f3bb51e4b",
  "hpke-cfrg-x25519-sha256-aes128gcm.json": "176bb0efeed8f1d442fca3f3beca0129605122a062a6dbbc2f8d799eb9970fbe",
};
/// The SHA-256 of the whole CFRG test-vectors.json the entries were cut from.
const CFRG_SOURCE_SHA256 = "61fc662f01996cd06d713dacf5e133167bd309a1f329442d53f1e21a47b3ede6";

interface Entry {
  mode: number; kem_id: number; kdf_id: number; aead_id: number;
  info: string; ikmR: string; ikmE: string; skRm: string; skEm: string; pkRm: string; pkEm: string; enc: string;
  shared_secret: string; key_schedule_context: string; secret: string; key: string; base_nonce: string; exporter_secret: string;
  encryptions: { aad: string; ct: string; nonce: string; pt: string }[];
  exports: { exporter_context: string; L: number; exported_value: string }[];
}

describe("the vendored vectors are the CFRG file's entries, unchanged", () => {
  it.each(Object.entries(PINNED))("%s has its pinned SHA-256", (name, digest) => {
    expect(sha256(read(name))).toBe(digest);
  });

  it("the provenance record names the source file and each entry's own hash, and they agree with the files", () => {
    const source = JSON.parse(read("hpke-cfrg-source.json").toString("utf8")) as { sourceSha256: string; entries: Record<string, { entrySha256: string; mode: number; kem_id: number; kdf_id: number; aead_id: number }> };
    expect(source.sourceSha256).toBe(CFRG_SOURCE_SHA256);
    for (const [name, e] of Object.entries(source.entries)) {
      const text = read(name).toString("utf8");
      expect(text.endsWith("\n")).toBe(true);
      expect(sha256(text.slice(0, -1)), name).toBe(e.entrySha256);
      expect(JSON.parse(text)).toMatchObject({ mode: e.mode, kem_id: e.kem_id, kdf_id: e.kdf_id, aead_id: e.aead_id });
    }
  });
});

const SUITES: [string, string, HpkeAead][] = [
  ["CFRG mode 0, X25519 / HKDF-SHA256 / AES-256-GCM (the product's suite)", "hpke-cfrg-x25519-sha256-aes256gcm.json", AES_256_GCM],
  ["RFC 9180 A.1, X25519 / HKDF-SHA256 / AES-128-GCM", "hpke-cfrg-x25519-sha256-aes128gcm.json", AES_128_GCM],
];

describe.each(SUITES)("%s", (_title, file, aead) => {
  const e = JSON.parse(read(file).toString("utf8")) as Entry;

  it("is the suite it says: mode 0, kem 0x0020, kdf 0x0001, and this AEAD", () => {
    expect([e.mode, e.kem_id, e.kdf_id, e.aead_id]).toEqual([0, 0x0020, 0x0001, aead.id]);
  });

  it("DeriveKeyPair gives the vectors' keys", () => {
    const r = deriveKeyPair(hex(e.ikmR));
    const s = deriveKeyPair(hex(e.ikmE));
    expect([toHex(r.privateKey), toHex(r.publicKey)]).toEqual([e.skRm, e.pkRm]);
    expect([toHex(s.privateKey), toHex(s.publicKey)]).toEqual([e.skEm, e.pkEm]);
  });

  it("Encap and Decap give the shared secret, and the key schedule gives the key, the base nonce and the exporter secret", () => {
    const { sharedSecret, enc } = encap(hex(e.pkRm), hex(e.skEm));
    expect(toHex(enc)).toBe(e.enc);
    expect(toHex(sharedSecret)).toBe(e.shared_secret);
    expect(toHex(decap(hex(e.enc), hex(e.skRm)))).toBe(e.shared_secret);
    const ctx = keyScheduleBase(aead, hex(e.shared_secret), hex(e.info));
    expect([toHex(ctx.key), toHex(ctx.baseNonce), toHex(ctx.exporterSecret)]).toEqual([e.key, e.base_nonce, e.exporter_secret]);
  });

  it(`every sequence number seals to the vector's ciphertext and opens back (${e.encryptions.length} of them)`, () => {
    const ctx = keyScheduleBase(aead, hex(e.shared_secret), hex(e.info));
    expect(e.encryptions.length).toBe(257);
    e.encryptions.forEach((x, seq) => {
      expect(toHex(nonceFor(ctx, seq)), `nonce ${seq}`).toBe(x.nonce);
      expect(toHex(contextSeal(ctx, seq, hex(x.aad), hex(x.pt))), `seal ${seq}`).toBe(x.ct);
      expect(toHex(contextOpen(ctx, seq, hex(x.aad), hex(x.ct))), `open ${seq}`).toBe(x.pt);
    });
  });

  it("every exported secret", () => {
    const ctx = keyScheduleBase(aead, hex(e.shared_secret), hex(e.info));
    for (const x of e.exports) expect(toHex(contextExport(ctx, hex(x.exporter_context), x.L))).toBe(x.exported_value);
  });

  it("the single-shot seal, with the vector's ephemeral key, is the first encryption; and opens", () => {
    const first = e.encryptions[0];
    const sealed = sealBase(aead, hex(e.pkRm), hex(e.info), hex(first.aad), hex(first.pt), hex(e.skEm));
    expect([toHex(sealed.enc), toHex(sealed.ct)]).toEqual([e.enc, first.ct]);
    expect(toHex(openBase(aead, hex(e.skRm), hex(e.info), hex(first.aad), sealed))).toBe(first.pt);
  });
});

describe("RFC 9180 appendix A.1's printed values agree with its vendored entry", () => {
  it("the shared secret, key, base nonce, exporter secret and ephemeral public key of A.1.1", () => {
    const e = JSON.parse(read("hpke-cfrg-x25519-sha256-aes128gcm.json").toString("utf8")) as Entry;
    expect(e.shared_secret).toBe("fe0e18c9f024ce43799ae393c7e8fe8fce9d218875e8227b0187c04e7d2ea1fc");
    expect(e.key).toBe("4531685d41d65f03dc48f6b8302c05b0");
    expect(e.base_nonce).toBe("56d890e5accaaf011cff4b7d");
    expect(e.exporter_secret).toBe("45ff1c2e220db587171952c0592d5f5ebe103f1561a2614e38f2ffd47e99e3f8");
    expect(e.pkEm).toBe("37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431");
  });
});

describe("HKDF-SHA256 from HMAC, against RFC 5869 appendix A.1 to A.3", () => {
  type Spec = { repeat: string; count: number } | { from: number; to: number };
  const V = JSON.parse(read("rfc5869-hkdf-sha256.json").toString("utf8")) as { cases: { name: string; ikm: Spec; salt: Spec; info: Spec; length: number; prk: string; okm: string }[] };
  const bytes = (s: Spec) => ("repeat" in s ? new Uint8Array(s.count).fill(parseInt(s.repeat, 16)) : Uint8Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i));
  it.each(V.cases.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    const prk = hkdfExtract(bytes(c.salt), bytes(c.ikm));
    expect(toHex(prk)).toBe(c.prk);
    expect(toHex(hkdfExpand(prk, bytes(c.info), c.length))).toBe(c.okm);
  });
});

describe("the product's seal: AES-256-GCM, info = aad = the canonical AAD", () => {
  const AAD: AadContext = { purpose: "FILE_DEK", organisationId: "cmorg1", exerciseId: "cmex1", keyId: "cmkey1", recordId: "cmfile1", partKey: "cmpart1" };
  const dek = new Uint8Array(32).fill(3);
  const code = (fn: () => unknown) => {
    try {
      fn();
      return null;
    } catch (err) {
      return err instanceof SealError ? err.code : `not a SealError: ${String(err)}`;
    }
  };
  const flip = (b: Uint8Array, i: number, bit = 0) => {
    const c = new Uint8Array(b);
    c[i] ^= 1 << bit;
    return c;
  };

  it("seals to a recipient's public key and only its private key opens it", () => {
    const r = generateX25519();
    const sealed = hpkeSeal(r.publicKey, dek, AAD);
    expect(sealed.enc.length).toBe(32);
    expect(sealed.ct.length).toBe(32 + 16);
    expect(toHex(hpkeOpen(r.privateKey, sealed, AAD))).toBe(toHex(dek));
    expect(toHex(hpkeOpen(r.privateKey, unpackHpke(packHpke(sealed)), AAD))).toBe(toHex(dek));
    expect(code(() => hpkeOpen(generateX25519().privateKey, sealed, AAD))).toBe("TAG");
  });

  it("a flipped bit in enc, in the ciphertext or its tag, or a change to any AAD field, fails", () => {
    const r = generateX25519();
    const s = hpkeSeal(r.publicKey, dek, AAD);
    const open = (x: HpkeSealed, aad: AadContext = AAD) => code(() => hpkeOpen(r.privateKey, x, aad));
    expect(open({ ...s, enc: flip(s.enc, 9, 3) })).toBe("TAG");
    expect(open({ ...s, ct: flip(s.ct, 0, 0) })).toBe("TAG");
    expect(open({ ...s, ct: flip(s.ct, s.ct.length - 1, 7) })).toBe("TAG");
    for (const field of ["purpose", "organisationId", "exerciseId", "keyId", "recordId", "partKey"] as const) {
      const changed = { ...AAD, [field]: field === "purpose" ? "MANIFEST_DEK" : `${AAD[field]}x` } as AadContext;
      expect(canonicalAad(changed)).not.toBe(canonicalAad(AAD));
      expect(open(s, changed), field).toBe("TAG");
    }
    expect(open(s)).toBeNull();
  });

  it("a low-order recipient key, or a low-order enc, throws LOW_ORDER; a short enc or ciphertext throws LENGTH", () => {
    const r = generateX25519();
    expect(code(() => hpkeSeal(new Uint8Array(32), dek, AAD))).toBe("LOW_ORDER");
    const s = hpkeSeal(r.publicKey, dek, AAD);
    expect(code(() => hpkeOpen(r.privateKey, { ...s, enc: new Uint8Array(32) }, AAD))).toBe("LOW_ORDER");
    expect(code(() => hpkeOpen(r.privateKey, { ...s, enc: s.enc.subarray(0, 31) }, AAD))).toBe("LENGTH");
    expect(code(() => hpkeOpen(r.privateKey, { ...s, ct: s.ct.subarray(0, 15) }, AAD))).toBe("LENGTH");
  });

  it("each seal uses a fresh ephemeral key, so the same plaintext seals differently", () => {
    const r = generateX25519();
    const a = hpkeSeal(r.publicKey, dek, AAD);
    const b = hpkeSeal(r.publicKey, dek, AAD);
    expect(toHex(a.enc)).not.toBe(toHex(b.enc));
    expect(toHex(a.ct)).not.toBe(toHex(b.ct));
  });
});
