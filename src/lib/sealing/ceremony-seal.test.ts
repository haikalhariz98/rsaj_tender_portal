import { describe, expect, it } from "vitest";

import { unpackGcm } from "./aead";
import { makeExerciseKey, makeOfficerKey, officerKeyAad, shareAad } from "./ceremony-seal";
import { unpackHpke } from "./hpke";
import { unwrapKey } from "./kdf";
import { hpkeOpen } from "./open";
import { combineShares } from "./split";
import { publicOf } from "./x25519";

const ORG = "org1";
const EX = "ex1";
const PEPPER = { id: "p#abc", key: new Uint8Array(32).fill(7) };

describe("an officer's key (D4, 20d)", () => {
  it("unwraps with the passphrase and the pepper it was wrapped with, to the private half of its public key", async () => {
    const k = await makeOfficerKey({ organisationId: ORG, exerciseId: EX, officerKeyId: "ok1", rosterRowId: "r1", passphrase: "correct horse battery", pepper: PEPPER });
    expect(k.pepperId).toBe("p#abc");
    expect(k.kdfSalt.length).toBe(16);
    const wrapped = { params: { log2N: k.kdfLog2N, r: k.kdfR, p: k.kdfP, salt: k.kdfSalt }, pepperId: k.pepperId, sealed: unpackGcm(k.wrappedPrivateKey) };
    const aad = officerKeyAad({ organisationId: ORG, exerciseId: EX, officerKeyId: "ok1", rosterRowId: "r1" });
    const priv = await unwrapKey(wrapped, "correct horse battery", PEPPER, aad);
    expect(priv).not.toBeNull();
    expect(Buffer.from(publicOf(priv!)).equals(Buffer.from(k.publicKey))).toBe(true);
    expect(await unwrapKey(wrapped, "another passphrase!!", PEPPER, aad)).toBeNull();
    // Moved to another roster row, the wrap fails its tag.
    expect(await unwrapKey(wrapped, "correct horse battery", PEPPER, officerKeyAad({ organisationId: ORG, exerciseId: EX, officerKeyId: "ok1", rosterRowId: "r2" }))).toBeNull();
  }, 20000);

  it("wraps with no pepper where none is given (demonstration only: the store decides)", async () => {
    const k = await makeOfficerKey({ organisationId: ORG, exerciseId: EX, officerKeyId: "ok2", rosterRowId: "r2", passphrase: "another long passphrase", pepper: null });
    expect(k.pepperId).toBeNull();
  }, 20000);
});

describe("the exercise key (D3, 20k)", () => {
  it("is split across every holder; all the shares together recover a private key for the public key, and one fewer does not", async () => {
    const officers = await Promise.all(["r1", "r2", "r3"].map(async (r, n) => ({ r, id: `ok${n}`, pass: `passphrase number ${n}!!`, key: await makeOfficerKey({ organisationId: ORG, exerciseId: EX, officerKeyId: `ok${n}`, rosterRowId: r, passphrase: `passphrase number ${n}!!`, pepper: PEPPER }) })));
    const made = makeExerciseKey({ organisationId: ORG, exerciseId: EX, keyId: "k1", holders: officers.map((o, n) => ({ rosterRowId: o.r, officerKeyId: o.id, shareId: `s${n}`, officerPublicKey: o.key.publicKey })) });
    expect(made.officerCount).toBe(3);
    expect(made.fingerprint.length).toBeGreaterThan(8);
    const opened = await Promise.all(
      made.shares.map(async (s, n) => {
        const o = officers[n];
        const priv = (await unwrapKey({ params: { log2N: o.key.kdfLog2N, r: o.key.kdfR, p: o.key.kdfP, salt: o.key.kdfSalt }, pepperId: o.key.pepperId, sealed: unpackGcm(o.key.wrappedPrivateKey) }, o.pass, PEPPER, officerKeyAad({ organisationId: ORG, exerciseId: EX, officerKeyId: o.id, rosterRowId: o.r })))!;
        return hpkeOpen(priv, unpackHpke(s.sealedShare), shareAad({ organisationId: ORG, exerciseId: EX, keyId: "k1", shareId: s.shareId }));
      }),
    );
    const all = combineShares(opened, made.publicKey);
    expect(all.ok).toBe(true);
    expect(combineShares(opened.slice(0, 2), made.publicKey)).toEqual({ ok: false, fault: "SHARE_MISMATCH" });
  }, 60000);

  it("refuses fewer than two holders: n-of-n needs two", () => {
    expect(() => makeExerciseKey({ organisationId: ORG, exerciseId: EX, keyId: "k1", holders: [{ rosterRowId: "r1", officerKeyId: "ok1", shareId: "s1", officerPublicKey: new Uint8Array(32).fill(9) }] })).toThrow();
  });
});
