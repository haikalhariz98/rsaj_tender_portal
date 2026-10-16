import { describe, expect, it } from "vitest";

import { parseEstimateFigure } from "@/lib/opening/online-finalise";

import { sealEstimateFigure } from "./estimate-seal";
import { estimateAad, estimateDekAad, openStoredGcm, openStoredHpke } from "./unseal-seal";
import { generateX25519 } from "./x25519";

const pair = generateX25519();
const context = { organisationId: "org1", exerciseId: "ex1", keyId: "key1", lodgementId: "lod1" };
const open = (c: typeof context, s: ReturnType<typeof sealEstimateFigure>, privateKey = pair.privateKey) => {
  const dek = openStoredHpke({ privateKey, stored: s.estimateDek, aad: estimateDekAad(c) });
  return parseEstimateFigure(openStoredGcm({ dek, stored: s.sealedEstimate, aad: estimateAad(c) }));
};

describe("sealEstimateFigure", () => {
  it("round-trips the figure with two places, and holds it nowhere in plain", () => {
    const s = sealEstimateFigure({ context, exercisePublicKey: pair.publicKey, figure: 123456_78n });
    expect(open(context, s)).toBe(123456_78n);
    expect(Buffer.concat([s.sealedEstimate, s.estimateDek]).includes(Buffer.from("123456.78"))).toBe(false);
    expect(s.cipherSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is sealed fresh each time", () => {
    const a = sealEstimateFigure({ context, exercisePublicKey: pair.publicKey, figure: 5_00n });
    const b = sealEstimateFigure({ context, exercisePublicKey: pair.publicKey, figure: 5_00n });
    expect(Buffer.from(a.sealedEstimate).equals(Buffer.from(b.sealedEstimate))).toBe(false);
  });

  it("does not open under another lodgement, key, exercise or organisation, or another private key", () => {
    const s = sealEstimateFigure({ context, exercisePublicKey: pair.publicKey, figure: 9_99n });
    for (const other of [{ ...context, lodgementId: "lod2" }, { ...context, keyId: "key2" }, { ...context, exerciseId: "ex2" }, { ...context, organisationId: "org2" }]) expect(() => open(other, s)).toThrow();
    expect(() => open(context, s, generateX25519().privateKey)).toThrow();
  });
});
