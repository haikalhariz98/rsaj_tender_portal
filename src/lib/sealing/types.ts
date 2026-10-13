/**
 * The crypto contract of online sealed bids (wave 3b, ADR 0036 D2, D3, D4; build plan §1.1, written verbatim). `node:crypto` only, no new dependency.
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

export declare function generateX25519(): X25519KeyPair;
export declare function publicOf(privateKey: Bytes): Bytes;
export declare function hpkeSeal(recipientPublic: Bytes, plaintext: Bytes, aad: AadContext): HpkeSealed;
export declare function hpkeOpen(recipientPrivate: Bytes, sealed: HpkeSealed, aad: AadContext): Bytes;          // throws SealError
export declare function gcmSeal(key: Bytes, plaintext: Bytes, aad: AadContext): GcmSealed;
export declare function gcmOpen(key: Bytes, sealed: GcmSealed, aad: AadContext): Bytes;                          // throws SealError
export declare function wrapKey(privateKey: Bytes, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<WrappedKey>;
/// 20v: the caller checks the wrap's pepper FIRST, with its own fault, never counted toward the passphrase lockout and never worded as a wrong passphrase.
export declare function pepperFault(w: WrappedKey, held: { id: string } | null): "PEPPER_NOT_HELD" | null;
/// null: wrong passphrase ONLY. Called with a pepper that is not the wrap's (pepperFault skipped), it throws SealError("PEPPER"): a programming error, not a wrong passphrase.
export declare function unwrapKey(w: WrappedKey, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<Bytes | null>;
export declare function splitKey(k: Bytes, n: number): Bytes[];                                                  // n-of-n XOR, n >= 2
export declare function combineShares(shares: readonly Bytes[], expectedPublic: Bytes): { ok: true; k: Bytes } | { ok: false; fault: "SHARE_COUNT" | "SHARE_MISMATCH" };
export declare function fingerprint(publicKey: Bytes): string;
export declare function zero(...buffers: Bytes[]): void;
