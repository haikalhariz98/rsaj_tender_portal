import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { KDF_MAX_CONCURRENT, kdfInput, kdfPeak, PEPPER_NOT_HELD_WORDS, pepperFault, resetKdfPeak, SCRYPT_LOG2N, SCRYPT_P, SCRYPT_R, scryptRaw, unwrapKey, wrapKey, wrapKeyWith } from "./kdf";
import { SealError, type AadContext, type WrappedKey } from "./types";
import { generateX25519 } from "./x25519";

/**
 * The officer's key wrapped under their passphrase (ADR 0036 D2, D4, ruling 20v): scrypt against RFC 7914 section 12, the wrap and the unwrap, and the pepper.
 */

const V = JSON.parse(readFileSync(path.join(process.cwd(), "src", "lib", "sealing", "vectors", "rfc7914-scrypt.json"), "utf8")) as {
  cases: { password: string; salt: string; log2N: number; r: number; p: number; length: number; output: string }[];
};
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const utf8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
const AAD: AadContext = { purpose: "OFFICER_KEY", organisationId: "cmorg1", exerciseId: "cmex1", keyId: "cmofficerkey1", recordId: "cmroster1" };
const PEPPER = { id: "pepper-2026-10", key: new Uint8Array(32).fill(0x5a) };
const OTHER_PEPPER = { id: "pepper-other", key: new Uint8Array(32).fill(0x33) };
const PASS = "correct horse battery staple";
const sealCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof SealError ? e.code : `not a SealError: ${String(e)}`;
  }
};
/// A wrap with small parameters, so a test that only needs a wrap does not spend scrypt's 128 MiB each time. The unwrap reads them from the wrap.
const quick = (salt = 1) => ({ log2N: 10, r: 8, p: 1, salt: new Uint8Array(16).fill(salt) });

describe("scrypt against RFC 7914 section 12", () => {
  it.each(V.cases.map((c, i) => [i + 1, c] as const))("vector %s", async (_n, c) => {
    expect(toHex(await scryptRaw(utf8(c.password), utf8(c.salt), c.length, c))).toBe(c.output);
  });
});

describe("wrapping an officer's key", () => {
  it("a new wrap uses ADR 0036 D2's parameters, a fresh 16-byte salt, and records the pepper's id", async () => {
    const { privateKey } = generateX25519();
    const a = await wrapKey(privateKey, PASS, PEPPER, AAD);
    const b = await wrapKey(privateKey, PASS, null, AAD);
    expect(a.params).toMatchObject({ log2N: SCRYPT_LOG2N, r: SCRYPT_R, p: SCRYPT_P });
    expect([SCRYPT_LOG2N, SCRYPT_R, SCRYPT_P]).toEqual([17, 8, 1]);
    expect(a.params.salt.length).toBe(16);
    expect(toHex(a.params.salt)).not.toBe(toHex(b.params.salt));
    expect(a.pepperId).toBe(PEPPER.id);
    expect(b.pepperId).toBeNull();
    expect(toHex((await unwrapKey(a, PASS, PEPPER, AAD))!)).toBe(toHex(privateKey));
    expect(toHex((await unwrapKey(b, PASS, null, AAD))!)).toBe(toHex(privateKey));
  });

  it("the parameters are read from the wrap, not from the constants", async () => {
    const { privateKey } = generateX25519();
    const w = await wrapKeyWith(quick(), privateKey, PASS, null, AAD);
    expect(w.params.log2N).not.toBe(SCRYPT_LOG2N);
    expect(toHex((await unwrapKey(w, PASS, null, AAD))!)).toBe(toHex(privateKey));
    // The same wrap read with other parameters derives another key, and does not open.
    expect(await unwrapKey({ ...w, params: { ...w.params, log2N: 11 } }, PASS, null, AAD)).toBeNull();
  });

  it("a wrong passphrase returns null, and only a wrong passphrase does", async () => {
    const { privateKey } = generateX25519();
    const w = await wrapKeyWith(quick(), privateKey, PASS, PEPPER, AAD);
    expect(await unwrapKey(w, "correct horse battery stapler", PEPPER, AAD)).toBeNull();
    expect(await unwrapKey(w, "", PEPPER, AAD)).toBeNull();
    // A wrap moved to another record cannot be told from a wrong passphrase by its tag (GCM says only "does not open"), and it never opens.
    expect(await unwrapKey(w, PASS, PEPPER, { ...AAD, recordId: "cmroster2" })).toBeNull();
    expect(toHex((await unwrapKey(w, PASS, PEPPER, AAD))!)).toBe(toHex(privateKey));
  });

  it("the passphrase is read in Unicode normal form C, so the same text typed two ways is the same passphrase", async () => {
    const { privateKey } = generateX25519();
    const composed = "Kata laluan café untuk pembukaan";
    const decomposed = "Kata laluan café untuk pembukaan";
    const w = await wrapKeyWith(quick(), privateKey, composed, null, AAD);
    expect(toHex((await unwrapKey(w, decomposed, null, AAD))!)).toBe(toHex(privateKey));
    expect(toHex(kdfInput(composed, null))).toBe(toHex(kdfInput(decomposed, null)));
  });

  it("the pepper is mixed in by HMAC-SHA256: the same passphrase with another pepper is another key-encryption key", () => {
    expect(toHex(kdfInput(PASS, PEPPER))).not.toBe(toHex(kdfInput(PASS, OTHER_PEPPER)));
    expect(toHex(kdfInput(PASS, PEPPER))).not.toBe(toHex(kdfInput(PASS, null)));
    expect(kdfInput(PASS, PEPPER).length).toBe(32);
    expect(() => kdfInput(PASS, { id: "short", key: new Uint8Array(31) })).toThrow("PEPPER");
  });

  it("parameters out of range, or over the memory cap, are refused as FORMAT before any work", async () => {
    const { privateKey } = generateX25519();
    const w = await wrapKeyWith(quick(), privateKey, PASS, null, AAD);
    const bad = (params: Partial<WrappedKey["params"]>) => sealCode(unwrapKey({ ...w, params: { ...w.params, ...params } }, PASS, null, AAD));
    expect(await bad({ log2N: 0 })).toBe("FORMAT");
    expect(await bad({ log2N: 21 })).toBe("FORMAT");
    expect(await bad({ log2N: 18, r: 16 })).toBe("FORMAT");
    expect(await bad({ r: 0 })).toBe("FORMAT");
    expect(await bad({ p: 17 })).toBe("FORMAT");
    expect(await bad({ salt: new Uint8Array(8) })).toBe("LENGTH");
  });
});

describe("a pepper the deployment does not hold is not a wrong passphrase (20v)", () => {
  it("pepperFault tells a pepper-id mismatch apart, before any unwrap", async () => {
    const { privateKey } = generateX25519();
    const peppered = await wrapKeyWith(quick(), privateKey, PASS, PEPPER, AAD);
    const plain = await wrapKeyWith(quick(), privateKey, PASS, null, AAD);
    expect(pepperFault(peppered, null)).toBe("PEPPER_NOT_HELD");
    expect(pepperFault(peppered, { id: OTHER_PEPPER.id })).toBe("PEPPER_NOT_HELD");
    expect(pepperFault(peppered, { id: PEPPER.id })).toBeNull();
    // A wrap made without a pepper needs none, whatever the deployment holds.
    expect(pepperFault(plain, null)).toBeNull();
    expect(pepperFault(plain, { id: PEPPER.id })).toBeNull();
  });

  it("unwrapKey handed a pepper that is not the wrap's throws PEPPER: never null, so it can never be counted as a wrong passphrase", async () => {
    const { privateKey } = generateX25519();
    const peppered = await wrapKeyWith(quick(), privateKey, PASS, PEPPER, AAD);
    const plain = await wrapKeyWith(quick(), privateKey, PASS, null, AAD);
    expect(await sealCode(unwrapKey(peppered, PASS, OTHER_PEPPER, AAD))).toBe("PEPPER");
    expect(await sealCode(unwrapKey(peppered, PASS, null, AAD))).toBe("PEPPER");
    expect(await sealCode(unwrapKey(plain, PASS, PEPPER, AAD))).toBe("PEPPER");
    // Even with the wrong passphrase as well: the pepper is refused first.
    expect(await sealCode(unwrapKey(peppered, "not it at all", OTHER_PEPPER, AAD))).toBe("PEPPER");
  });

  it("its words say the deployment must restore the pepper, and never that the passphrase is wrong", () => {
    expect(PEPPER_NOT_HELD_WORDS).toMatch(/pepper/);
    expect(PEPPER_NOT_HELD_WORDS).toMatch(/restore/);
    expect(PEPPER_NOT_HELD_WORDS).not.toMatch(/wrong|incorrect|invalid|does not match|try again|attempts? (left|remaining)/i);
  });
});

describe("scrypt runs at most two at once", () => {
  it("a burst of derivations waits its turn", async () => {
    resetKdfPeak();
    const salt = new Uint8Array(16);
    await Promise.all(Array.from({ length: 6 }, (_, i) => scryptRaw(utf8(`p${i}`), salt, 32, { log2N: 12, r: 8, p: 1 })));
    expect(KDF_MAX_CONCURRENT).toBe(2);
    expect(kdfPeak()).toBe(KDF_MAX_CONCURRENT);
  });
});
