import { describe, expect, expectTypeOf, it } from "vitest";

import * as sealing from "./types";
import type { AadContext, Bytes, GcmSealed, HpkeSealed, WrappedKey, X25519KeyPair } from "./types";

/**
 * Build plan §1.1 (step 3 wrote it verbatim; step 4 implements it): every function of the crypto contract, as the plan declares it, held against what `types.ts`
 * exports. The signatures below are the plan's lines, as the members of a type that only the type checker reads.
 */
interface Plan {
  generateX25519(): X25519KeyPair;
  publicOf(privateKey: Bytes): Bytes;
  hpkeSeal(recipientPublic: Bytes, plaintext: Bytes, aad: AadContext): HpkeSealed;
  hpkeOpen(recipientPrivate: Bytes, sealed: HpkeSealed, aad: AadContext): Bytes;          // throws SealError
  gcmSeal(key: Bytes, plaintext: Bytes, aad: AadContext): GcmSealed;
  gcmOpen(key: Bytes, sealed: GcmSealed, aad: AadContext): Bytes;                          // throws SealError
  wrapKey(privateKey: Bytes, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<WrappedKey>;
  pepperFault(w: WrappedKey, held: { id: string } | null): "PEPPER_NOT_HELD" | null;
  unwrapKey(w: WrappedKey, passphrase: string, pepper: { id: string; key: Bytes } | null, aad: AadContext): Promise<Bytes | null>;
  splitKey(k: Bytes, n: number): Bytes[];                                                  // n-of-n XOR, n >= 2
  combineShares(shares: readonly Bytes[], expectedPublic: Bytes): { ok: true; k: Bytes } | { ok: false; fault: "SHARE_COUNT" | "SHARE_MISMATCH" };
  fingerprint(publicKey: Bytes): string;
  zero(...buffers: Bytes[]): void;
}

describe("the crypto contract (build plan §1.1)", () => {
  it("every function is implemented with the plan's signature", () => {
    expectTypeOf(sealing.generateX25519).toEqualTypeOf<Plan["generateX25519"]>();
    expectTypeOf(sealing.publicOf).toEqualTypeOf<Plan["publicOf"]>();
    expectTypeOf(sealing.hpkeSeal).toEqualTypeOf<Plan["hpkeSeal"]>();
    expectTypeOf(sealing.hpkeOpen).toEqualTypeOf<Plan["hpkeOpen"]>();
    expectTypeOf(sealing.gcmSeal).toEqualTypeOf<Plan["gcmSeal"]>();
    expectTypeOf(sealing.gcmOpen).toEqualTypeOf<Plan["gcmOpen"]>();
    expectTypeOf(sealing.wrapKey).toEqualTypeOf<Plan["wrapKey"]>();
    expectTypeOf(sealing.pepperFault).toEqualTypeOf<Plan["pepperFault"]>();
    expectTypeOf(sealing.unwrapKey).toEqualTypeOf<Plan["unwrapKey"]>();
    expectTypeOf(sealing.splitKey).toEqualTypeOf<Plan["splitKey"]>();
    expectTypeOf(sealing.combineShares).toEqualTypeOf<Plan["combineShares"]>();
    expectTypeOf(sealing.fingerprint).toEqualTypeOf<Plan["fingerprint"]>();
    expectTypeOf(sealing.zero).toEqualTypeOf<Plan["zero"]>();
  });

  it("and each is there at run time, not only declared", () => {
    for (const name of ["generateX25519", "publicOf", "hpkeSeal", "hpkeOpen", "gcmSeal", "gcmOpen", "wrapKey", "pepperFault", "unwrapKey", "splitKey", "combineShares", "fingerprint", "zero"] as const) {
      expect(typeof sealing[name], name).toBe("function");
    }
    expect(new sealing.SealError("TAG")).toBeInstanceOf(Error);
    expect(new sealing.SealError("PEPPER").code).toBe("PEPPER");
  });
});
