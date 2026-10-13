/**
 * X25519 on raw 32-byte keys (RFC 7748), through `node:crypto` KeyObjects (ADR 0036 D2).
 *
 * A public key is imported as a JWK (`x`). A private key is imported as PKCS#8 DER, the fixed 16-byte prefix and the raw scalar: Node's JWK import of a private OKP
 * key requires its public `x` as well, which is what is being derived. Keys are exported as JWK (`d`, `x`). The Diffie-Hellman output is refused when it is all
 * zero, which is what a low-order public key gives (RFC 7748 section 6.1, RFC 9180 section 7.1.4): OpenSSL refuses it itself, and the check is made here too.
 */

import { createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, type KeyObject } from "node:crypto";

import { SealError, type Bytes, type X25519KeyPair } from "./types";

export const X25519_KEY_BYTES = 32;
const PKCS8_X25519_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

const b64u = (b: Bytes) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string | undefined): Uint8Array => {
  if (!s) throw new SealError("FORMAT");
  return new Uint8Array(Buffer.from(s, "base64url"));
};

function privateKeyObject(sk: Bytes): KeyObject {
  if (sk.length !== X25519_KEY_BYTES) throw new SealError("LENGTH");
  const der = Buffer.concat([PKCS8_X25519_PREFIX, Buffer.from(sk)]);
  try {
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } finally {
    der.fill(0);
  }
}

function publicKeyObject(pk: Bytes): KeyObject {
  if (pk.length !== X25519_KEY_BYTES) throw new SealError("LENGTH");
  return createPublicKey({ key: { kty: "OKP", crv: "X25519", x: b64u(pk) }, format: "jwk" });
}

export function generateX25519(): X25519KeyPair {
  const { privateKey } = generateKeyPairSync("x25519");
  const jwk = privateKey.export({ format: "jwk" });
  return { privateKey: fromB64u(jwk.d), publicKey: fromB64u(jwk.x) };
}

export function publicOf(privateKey: Bytes): Bytes {
  return fromB64u(createPublicKey(privateKeyObject(privateKey)).export({ format: "jwk" }).x);
}

/// X25519(sk, pk): the shared secret. Throws SealError("LOW_ORDER") for a public key of small order (an all-zero output).
export function x25519(privateKey: Bytes, publicKey: Bytes): Bytes {
  const priv = privateKeyObject(privateKey);
  const pub = publicKeyObject(publicKey);
  let out: Buffer;
  try {
    out = diffieHellman({ privateKey: priv, publicKey: pub });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_OSSL_FAILED_DURING_DERIVATION") throw new SealError("LOW_ORDER");
    throw e;
  }
  if (out.every((b) => b === 0)) throw new SealError("LOW_ORDER");
  return new Uint8Array(out);
}

/// The key's fingerprint, shown on the opportunity and every receipt (ADR 0036 D3, S10): SHA-256 of the raw public key, as 64 lower-case hex digits.
export function fingerprint(publicKey: Bytes): string {
  if (publicKey.length !== X25519_KEY_BYTES) throw new SealError("LENGTH");
  return createHash("sha256").update(publicKey).digest("hex");
}
