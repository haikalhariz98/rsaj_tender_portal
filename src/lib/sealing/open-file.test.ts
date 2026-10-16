import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { unpackGcm } from "./aead";
import { openFile, sealFile, type FileSealContext } from "./file-seal";
import { hpkeOpen } from "./open";
import { unpackHpke } from "./hpke";
import { fileDekAad } from "./file-seal";
import { generateX25519 } from "./x25519";

/// The officer's download opens what the upload sealed (wave 3b step 14): the same additional data, every tag and the plain digest checked, nothing returned unless all hold.
const CTX: FileSealContext = { organisationId: "o1", exerciseId: "e1", keyId: "k1", fileId: "f1", packPartId: "p1" };
const PLAIN = new TextEncoder().encode("%PDF-1.7 PLAINTEXT-MARKER-1234567890");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const META = { v: 1 as const, filename: "tender.pdf", mediaType: "application/pdf", plainSha256: sha(PLAIN), plainBytes: String(PLAIN.length) };

const sealed = (meta = META) => {
  const pair = generateX25519();
  const s = sealFile({ context: CTX, exercisePublicKey: pair.publicKey, plain: PLAIN, meta });
  const dek = hpkeOpen(pair.privateKey, unpackHpke(s.sealedDek), fileDekAad(CTX));
  return { s, dek };
};

describe("openFile", () => {
  it("returns the plain bytes and the metadata", () => {
    const { s, dek } = sealed();
    const r = openFile({ context: CTX, dek, cipher: s.cipher, bodyIv: s.bodyIv, sealedMeta: s.sealedMeta });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Buffer.from(r.plain).equals(Buffer.from(PLAIN))).toBe(true);
      expect(r.meta.filename).toBe("tender.pdf");
    }
  });

  it("does not open for another file, part, exercise, key or organisation", () => {
    const { s, dek } = sealed();
    for (const other of [{ fileId: "f2" }, { packPartId: "p2" }, { exerciseId: "e2" }, { keyId: "k2" }, { organisationId: "o2" }]) {
      expect(openFile({ context: { ...CTX, ...other }, dek, cipher: s.cipher, bodyIv: s.bodyIv, sealedMeta: s.sealedMeta })).toEqual({ ok: false, fault: "UNREADABLE" });
    }
  });

  it("refuses a changed body, a changed IV, changed metadata and a wrong key, returning no bytes", () => {
    const { s, dek } = sealed();
    const flip = (b: Uint8Array, at = 0) => Uint8Array.from(b, (x, i) => (i === at ? x ^ 1 : x));
    expect(openFile({ context: CTX, dek, cipher: flip(s.cipher), bodyIv: s.bodyIv, sealedMeta: s.sealedMeta }).ok).toBe(false);
    expect(openFile({ context: CTX, dek, cipher: flip(s.cipher, s.cipher.length - 1), bodyIv: s.bodyIv, sealedMeta: s.sealedMeta }).ok).toBe(false);
    expect(openFile({ context: CTX, dek, cipher: s.cipher, bodyIv: flip(s.bodyIv), sealedMeta: s.sealedMeta }).ok).toBe(false);
    expect(openFile({ context: CTX, dek, cipher: s.cipher, bodyIv: s.bodyIv, sealedMeta: flip(s.sealedMeta, 20) }).ok).toBe(false);
    expect(openFile({ context: CTX, dek: flip(dek), cipher: s.cipher, bodyIv: s.bodyIv, sealedMeta: s.sealedMeta }).ok).toBe(false);
    expect(openFile({ context: CTX, dek, cipher: new Uint8Array(3), bodyIv: s.bodyIv, sealedMeta: s.sealedMeta }).ok).toBe(false);
    expect(unpackGcm(s.sealedMeta).iv.length).toBe(12);
  });

  it("refuses a body whose digest or size is not the one the metadata states, even though every tag verifies", () => {
    for (const meta of [{ ...META, plainSha256: "b".repeat(64) }, { ...META, plainBytes: String(PLAIN.length + 1) }]) {
      const { s, dek } = sealed(meta);
      expect(openFile({ context: CTX, dek, cipher: s.cipher, bodyIv: s.bodyIv, sealedMeta: s.sealedMeta })).toEqual({ ok: false, fault: "DIGEST_MISMATCH" });
    }
  });
});
