import { describe, expect, it } from "vitest";

import { gcmOpen, hpkeOpen } from "./open";
import { fileBodyAad, fileDekAad, fileMetaAad, sealFile, type FileSealContext } from "./file-seal";
import { unpackGcm } from "./aead";
import { unpackHpke } from "./hpke";
import { generateX25519 } from "./x25519";

const CTX: FileSealContext = { organisationId: "o1", exerciseId: "e1", keyId: "k1", fileId: "f1", packPartId: "p1" };
const META = { v: 1 as const, filename: "tender.pdf", mediaType: "application/pdf", plainSha256: "a".repeat(64), plainBytes: "26" };

describe("sealFile (ADR 0036 D4, D6)", () => {
  const pair = generateX25519();
  const plain = new TextEncoder().encode("PLAINTEXT-MARKER-1234567890");
  const sealed = sealFile({ context: CTX, exercisePublicKey: pair.publicKey, plain, meta: META });

  it("keeps the plain bytes out of everything it makes", () => {
    for (const b of [sealed.cipher, sealed.sealedDek, sealed.sealedMeta]) {
      expect(Buffer.from(b).includes(Buffer.from("PLAINTEXT-MARKER"))).toBe(false);
    }
    expect(Buffer.from(sealed.sealedMeta).includes(Buffer.from("tender.pdf"))).toBe(false);
  });

  it("opens with the exercise private key, and only with the bound context", () => {
    const dek = hpkeOpen(pair.privateKey, unpackHpke(sealed.sealedDek), fileDekAad(CTX));
    const body = gcmOpen(dek, { iv: sealed.bodyIv, ct: sealed.cipher.slice(0, sealed.cipher.length - 16), tag: sealed.cipher.slice(sealed.cipher.length - 16) }, fileBodyAad(CTX));
    expect(Buffer.from(body).toString()).toBe("PLAINTEXT-MARKER-1234567890");
    const meta = JSON.parse(Buffer.from(gcmOpen(dek, unpackGcm(sealed.sealedMeta), fileMetaAad(CTX))).toString());
    expect(meta.filename).toBe("tender.pdf");
    expect(() => hpkeOpen(pair.privateKey, unpackHpke(sealed.sealedDek), fileDekAad({ ...CTX, fileId: "f2" }))).toThrow();
    expect(() => gcmOpen(dek, unpackGcm(sealed.sealedMeta), fileMetaAad({ ...CTX, packPartId: "p2" }))).toThrow();
  });

  it("makes a new data key and IV each time", () => {
    const again = sealFile({ context: CTX, exercisePublicKey: pair.publicKey, plain, meta: META });
    expect(Buffer.from(again.cipher).equals(Buffer.from(sealed.cipher))).toBe(false);
    expect(Buffer.from(again.bodyIv).equals(Buffer.from(sealed.bodyIv))).toBe(false);
  });
});
