import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { Manifest } from "@/lib/bids/online/types";

import { unpackGcm } from "./aead";
import { declarationAad, declarationDekAad, manifestAad, manifestDekAad, sealSubmission, type BidSealContext } from "./bid-seal";
import { unpackHpke } from "./hpke";
import { gcmOpen, hpkeOpen } from "./open";
import { generateX25519 } from "./x25519";

const CTX: BidSealContext = { organisationId: "o1", exerciseId: "e1", keyId: "k1", onlineBidId: "b1" };
const DECLARATION = { price: "123456.78", completionPeriod: 12, completionUnit: "WEEKS" as const };
const MANIFEST: Omit<Manifest, "declarationCipherSha256"> = {
  v: 1, exerciseId: "e1", onlineBidId: "b1", supplierId: "s1", supplierAccountId: "a1", kind: "BID", parentOnlineBidId: null, replacesOnlineBidId: null,
  files: [{ fileId: "f1", packPartId: "p1", cipherSha256: "c".repeat(64) }],
};
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("sealSubmission (ADR 0036 D5)", () => {
  const pair = generateX25519();
  const sealed = sealSubmission({ context: CTX, exercisePublicKey: pair.publicKey, declaration: DECLARATION, manifest: MANIFEST });

  it("keeps the price and the ids out of everything it makes", () => {
    for (const b of [sealed.sealedManifest, sealed.sealedDeclaration, sealed.manifestDek, sealed.declarationDek]) {
      expect(Buffer.from(b).includes(Buffer.from("123456.78"))).toBe(false);
      expect(Buffer.from(b).includes(Buffer.from("supplierId"))).toBe(false);
    }
  });

  it("opens with the exercise private key, and the manifest carries the declaration's digest", () => {
    const declDek = hpkeOpen(pair.privateKey, unpackHpke(sealed.declarationDek), declarationDekAad(CTX));
    const decl = JSON.parse(Buffer.from(gcmOpen(declDek, unpackGcm(sealed.sealedDeclaration), declarationAad(CTX))).toString());
    expect(decl).toEqual(DECLARATION);
    const manDek = hpkeOpen(pair.privateKey, unpackHpke(sealed.manifestDek), manifestDekAad(CTX));
    const man = JSON.parse(Buffer.from(gcmOpen(manDek, unpackGcm(sealed.sealedManifest), manifestAad(CTX))).toString());
    expect(man).toEqual({ ...MANIFEST, declarationCipherSha256: sealed.declarationCipherSha256 });
  });

  it("states each digest as the SHA-256 of the stored form", () => {
    expect(sealed.manifestCipherSha256).toBe(sha(sealed.sealedManifest));
    expect(sealed.declarationCipherSha256).toBe(sha(sealed.sealedDeclaration));
  });

  it("does not open for another submission, exercise or key, nor for the other purpose", () => {
    const declDek = hpkeOpen(pair.privateKey, unpackHpke(sealed.declarationDek), declarationDekAad(CTX));
    expect(() => gcmOpen(declDek, unpackGcm(sealed.sealedDeclaration), declarationAad({ ...CTX, onlineBidId: "b2" }))).toThrow();
    expect(() => gcmOpen(declDek, unpackGcm(sealed.sealedDeclaration), declarationAad({ ...CTX, exerciseId: "e2" }))).toThrow();
    expect(() => gcmOpen(declDek, unpackGcm(sealed.sealedDeclaration), declarationAad({ ...CTX, keyId: "k2" }))).toThrow();
    expect(() => gcmOpen(declDek, unpackGcm(sealed.sealedDeclaration), manifestAad(CTX))).toThrow();
    expect(() => hpkeOpen(pair.privateKey, unpackHpke(sealed.declarationDek), manifestDekAad(CTX))).toThrow();
  });

  it("makes new data keys each time", () => {
    const again = sealSubmission({ context: CTX, exercisePublicKey: pair.publicKey, declaration: DECLARATION, manifest: MANIFEST });
    expect(again.declarationCipherSha256).not.toBe(sealed.declarationCipherSha256);
    expect(again.manifestCipherSha256).not.toBe(sealed.manifestCipherSha256);
  });
});
