import { describe, expect, it } from "vitest";

import { canonicalAad } from "./aad";
import { makeExerciseKey, makeOfficerKey, officerKeyAad, shareAad } from "./ceremony-seal";
import { unpackGcm } from "./aead";
import { unpackHpke } from "./hpke";
import { unwrapKey } from "./kdf";
import { hpkeOpen } from "./open";
import { SealError } from "./types";
import { combineHeld, estimateAad, estimateDekAad, officerGrantAad, openGrant, openRelease, packHeldShares, sealGrant, sealRelease, shareReleaseAad, unpackHeldShares, type HeldShare } from "./unseal-seal";
import { generateX25519, publicOf } from "./x25519";

const ORG = "org1";
const EX = "ex1";
const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill);

describe("the release payload (step 13, plan 1.5f)", () => {
  it("round-trips every share with its id, and refuses a payload that is not exactly what it says", () => {
    const held: HeldShare[] = [{ shareId: "s1", share: bytes(32, 1) }, { shareId: "share-two", share: bytes(32, 2) }];
    const back = unpackHeldShares(packHeldShares(held));
    expect(back.map((h) => h.shareId)).toEqual(["s1", "share-two"]);
    expect(Buffer.from(back[1].share).equals(Buffer.from(bytes(32, 2)))).toBe(true);
    const packed = packHeldShares(held);
    expect(() => unpackHeldShares(packed.slice(0, packed.length - 1))).toThrow(SealError);
    expect(() => unpackHeldShares(new Uint8Array([...packed, 0]))).toThrow(SealError);
    expect(() => unpackHeldShares(new Uint8Array([2, 1]))).toThrow(SealError);
    expect(() => packHeldShares([])).toThrow(SealError);
    expect(() => packHeldShares([{ shareId: "x", share: bytes(31, 1) }])).toThrow(SealError);
  });
});

describe("a release is sealed to one officer and opens for that officer only", () => {
  const pair = generateX25519();
  const other = generateX25519();
  const aad = shareReleaseAad({ organisationId: ORG, exerciseId: EX, keyId: "k1", releaseId: "rel1", toOfficerKeyId: "ok2" });
  const held: HeldShare[] = [{ shareId: "s1", share: bytes(32, 9) }];

  it("opens with the right key and additional data", () => {
    const sealed = sealRelease({ recipientPublic: pair.publicKey, held, aad });
    expect(openRelease({ recipientPrivate: pair.privateKey, sealed, aad }).map((h) => h.shareId)).toEqual(["s1"]);
  });
  it("does not open with another officer's key, another officer's additional data, or another release", () => {
    const sealed = sealRelease({ recipientPublic: pair.publicKey, held, aad });
    expect(() => openRelease({ recipientPrivate: other.privateKey, sealed, aad })).toThrow(SealError);
    expect(() => openRelease({ recipientPrivate: pair.privateKey, sealed, aad: shareReleaseAad({ organisationId: ORG, exerciseId: EX, keyId: "k1", releaseId: "rel1", toOfficerKeyId: "ok3" }) })).toThrow(SealError);
    expect(() => openRelease({ recipientPrivate: pair.privateKey, sealed, aad: shareReleaseAad({ organisationId: ORG, exerciseId: EX, keyId: "k1", releaseId: "rel2", toOfficerKeyId: "ok2" }) })).toThrow(SealError);
  });
});

describe("combining what was gathered", () => {
  async function ceremony(n: number) {
    const officers = await Promise.all(
      Array.from({ length: n }, async (_, i) => ({ id: `ok${i}`, row: `r${i}`, key: await makeOfficerKey({ organisationId: ORG, exerciseId: EX, officerKeyId: `ok${i}`, rosterRowId: `r${i}`, passphrase: `unseal passphrase ${i}!!`, pepper: null }) })),
    );
    const made = makeExerciseKey({ organisationId: ORG, exerciseId: EX, keyId: "k1", holders: officers.map((o, i) => ({ rosterRowId: o.row, officerKeyId: o.id, shareId: `s${i}`, officerPublicKey: o.key.publicKey })) });
    const shares: HeldShare[] = [];
    for (let i = 0; i < n; i++) {
      const priv = (await unwrapKey({ params: { log2N: officers[i].key.kdfLog2N, r: officers[i].key.kdfR, p: officers[i].key.kdfP, salt: officers[i].key.kdfSalt }, pepperId: null, sealed: unpackGcm(officers[i].key.wrappedPrivateKey) }, `unseal passphrase ${i}!!`, null, officerKeyAad({ organisationId: ORG, exerciseId: EX, officerKeyId: officers[i].id, rosterRowId: officers[i].row })))!;
      shares.push({ shareId: `s${i}`, share: hpkeOpen(priv, unpackHpke(made.shares[i].sealedShare), shareAad({ organisationId: ORG, exerciseId: EX, keyId: "k1", shareId: `s${i}` })) });
    }
    return { made, shares };
  }

  it("recovers the key from n distinct shares, in any order, and tolerates a share carried twice (the overlap of the forwarded sets)", async () => {
    const { made, shares } = await ceremony(3);
    const ids = shares.map((s) => s.shareId);
    const once = combineHeld([...shares].reverse(), ids, made.publicKey);
    expect(once.ok && Buffer.from(publicOf(once.k)).equals(Buffer.from(made.publicKey))).toBe(true);
    // The last officer receives the first's set (s0) and the second's set (s0, s1) and holds s2: s0 arrives twice.
    const overlapped = combineHeld([shares[0], shares[0], shares[1], shares[2]], ids, made.publicKey);
    expect(overlapped.ok).toBe(true);
  }, 30000);

  it("refuses a missing share, a share the key does not have, and one id carried with different bytes", async () => {
    const { made, shares } = await ceremony(3);
    const ids = shares.map((s) => s.shareId);
    expect(combineHeld(shares.slice(0, 2), ids, made.publicKey)).toEqual({ ok: false, fault: "SHARE_COUNT" });
    expect(combineHeld([...shares.slice(0, 2), { shareId: "stranger", share: shares[2].share }], ids, made.publicKey)).toEqual({ ok: false, fault: "SHARE_COUNT" });
    expect(combineHeld([...shares, { shareId: "s0", share: bytes(32, 3) }], ids, made.publicKey)).toEqual({ ok: false, fault: "SHARE_MISMATCH" });
    expect(combineHeld(shares, ["s0"], made.publicKey)).toEqual({ ok: false, fault: "SHARE_COUNT" });
  }, 30000);

  it("refuses a share altered in place", async () => {
    const { made, shares } = await ceremony(2);
    const altered = shares.map((s, i) => (i === 0 ? { ...s, share: s.share.map((b, j) => (j === 5 ? b ^ 1 : b)) } : s));
    expect(combineHeld(altered, shares.map((s) => s.shareId), made.publicKey)).toEqual({ ok: false, fault: "SHARE_MISMATCH" });
  }, 30000);
});

describe("a grant is bound to its officer, opening, record and use", () => {
  const officer = generateX25519();
  const dek = bytes(32, 5);
  const base = { organisationId: ORG, exerciseId: EX, openingId: "op1", officerKeyId: "ok1", subject: "FILE" as const, recordId: "f1" };
  it("opens with the same binding and not with a changed use, record, opening or officer", () => {
    const sealed = sealGrant({ officerPublic: officer.publicKey, dek, aad: officerGrantAad({ ...base, use: "OPENING_CHECK" }) });
    expect(Buffer.from(openGrant({ officerPrivate: officer.privateKey, sealed, aad: officerGrantAad({ ...base, use: "OPENING_CHECK" }) })).equals(Buffer.from(dek))).toBe(true);
    for (const changed of [{ use: "FINALISE" as const }, { use: "OPENING_CHECK" as const, recordId: "f2" }, { use: "OPENING_CHECK" as const, openingId: "op2" }, { use: "OPENING_CHECK" as const, officerKeyId: "ok2" }, { use: "OPENING_CHECK" as const, subject: "DECLARATION" as const }]) {
      expect(() => openGrant({ officerPrivate: officer.privateKey, sealed, aad: officerGrantAad({ ...base, ...changed }) })).toThrow(SealError);
    }
  });
});

describe("the additional data written here (steps 14 to 16 rebuild it)", () => {
  it("is written as plan 1.5f says", () => {
    expect(canonicalAad(shareReleaseAad({ organisationId: "o", exerciseId: "e", keyId: "k", releaseId: "r", toOfficerKeyId: "t" }))).toBe("v1|SHARE_RELEASE|o|e|k|r|t");
    expect(canonicalAad(officerGrantAad({ organisationId: "o", exerciseId: "e", openingId: "op", officerKeyId: "ok", subject: "DECLARATION", recordId: "d", use: "FINALISE" }))).toBe("v1|OFFICER_GRANT|o|e|ok|d|op.DECLARATION.FINALISE");
    expect(canonicalAad(estimateDekAad({ organisationId: "o", exerciseId: "e", keyId: "k", lodgementId: "l" }))).toBe("v1|ESTIMATE_DEK|o|e|k|l|");
    expect(canonicalAad(estimateAad({ organisationId: "o", exerciseId: "e", keyId: "k", lodgementId: "l" }))).toBe("v1|ESTIMATE|o|e|k|l|");
  });
});
