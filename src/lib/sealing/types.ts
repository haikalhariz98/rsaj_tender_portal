/**
 * The crypto contract of online sealed bids (wave 3b, ADR 0036 D2, D3, D4; build plan §1.1, written verbatim). `node:crypto` only, no new dependency. The
 * types are here as written; the functions are re-exported from the files that implement them (step 4).
 */

export type Bytes = Uint8Array;

export type SealPurpose =
  | "OFFICER_KEY" | "SHARE" | "SHARE_RELEASE"
  | "FILE_DEK" | "FILE_META" | "FILE_BODY"
  | "MANIFEST_DEK" | "MANIFEST"
  | "DECLARATION_DEK" | "DECLARATION"
  | "ESTIMATE_DEK" | "ESTIMATE"
  | "OFFICER_GRANT";   // a DEK re-sealed to one named officer at the unseal (ADR 0036 D10)

/// Canonical AAD: "v1|purpose|organisationId|exerciseId|keyId|recordId|partKey" (partKey "" when absent). Ids are cuid; "|" is asserted absent.
export interface AadContext { purpose: SealPurpose; organisationId: string; exerciseId: string; keyId: string; recordId: string; partKey?: string }

/// RFC 9180 base mode, DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-256-GCM. info = aad = canonical AAD.
/// Node 24 has no HPKE: composed from diffieHellman (X25519) and createHmac (LabeledExtract / LabeledExpand).
export interface HpkeSealed { enc: Bytes /* 32 */; ct: Bytes /* ciphertext || 16-byte tag */ }
export interface GcmSealed { iv: Bytes /* 12 */; ct: Bytes; tag: Bytes /* 16 */ }

export interface ScryptParams { log2N: number /* 17 */; r: number /* 8 */; p: number /* 1 */; salt: Bytes /* 16 */ }
/// pepperId null: wrapped without a pepper (DEMONSTRATION only). KEK = scrypt(pepper ? HMAC-SHA256(pepper, passphrase) : passphrase).
export interface WrappedKey { params: ScryptParams; pepperId: string | null; sealed: GcmSealed }

export interface X25519KeyPair { publicKey: Bytes; privateKey: Bytes }
export class SealError extends Error { constructor(readonly code: "TAG" | "LOW_ORDER" | "FORMAT" | "LENGTH" | "PEPPER") { super(code); } }

// The functions of the contract (build plan §1.1), each implemented in its own file. `contract.test.ts` holds every one to the plan's signature, written there verbatim.
export { fingerprint, generateX25519, publicOf } from "./x25519";
export { hpkeSeal } from "./hpke";
export { gcmSeal, zero } from "./aead";
export { gcmOpen, hpkeOpen } from "./open";       // throws SealError
export { pepperFault, unwrapKey, wrapKey } from "./kdf";
export { combineShares, splitKey } from "./split";
